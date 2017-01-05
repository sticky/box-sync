'use strict';
var async = require('async');

var ErrorFixer = module.exports;

var uploader;
var store;
var rootRemoteId;

function getDirEntries(dirId, offset, callback) {
  // Step 2: Look in our Box parent folder to find the correct folder ID to use.
  uploader.getDirContents(dirId, offset, function(err, response) {
    if (err) {
      throw err;
    }
    callback(null, response['total_count'], response['entries']);
  });
}

function correctDirRemoteId(issueInfo, callback) {
  console.log("Trying to fix a missing remote ID for:", issueInfo.dir);
  var dir = issueInfo.dir;
  var newRemoteId;
  var parentRemoteId;
  var entryInfo = {
    offset: 0,
    totalCount: 0,
    entries: []
  };

  async.series([
    function(cb) {
      // Step 1: Get the correct parent Box Id for a dir.
      var searchInfo = {dirId: dir.parentId};
      if (dir.parentId === 'noparent') {
        parentRemoteId = rootRemoteId;
        cb();
        return;
      }
      store.getRemoteDirId(searchInfo, function(err) {
        parentRemoteId = searchInfo.remoteId;
        cb();
      });
    },
    function(cb) {
      // Step 2: Get all the entries in our parent folder.
      function GotEverything() {
        return entryInfo.entries.length >= entryInfo.totalCount;
      }

      async.doUntil(function(cb) {
        // Offset is zero-based.
        entryInfo.offset = entryInfo.entries.length;
          getDirEntries(parentRemoteId, entryInfo.offset, function(err, total, entries) {
            entryInfo.totalCount = total;
            entryInfo.entries = entryInfo.entries.concat(entries);
            cb();
          });
      }, GotEverything, cb);
    },
    function(cb) {
      // Step 3: Look in our Box parent entries to find the correct folder ID to use.
      var checkedCt = 0;
      entryInfo.entries.some(function(entry, index, array) {
        checkedCt +=1;
        if (entry.type === 'folder' && entry.name === dir.name) {
          console.log("found it!", entry.id);
          newRemoteId = entry.id;
          return true;
        }
        return false;
      });

      if (!newRemoteId) {
        console.log("Entries checked", entryInfo.entries);
        console.error("Dir info", dir);
        throw new Error("New remote ID not found during attempt to fix.");
      }
      cb();
    },
    function(cb) {
      // Step 4: Save our new remote ID.
      dir.remoteId = newRemoteId;
      store.storeDir('valid', dir, cb);
    }
  ], function(err) {
    if (err) {
      throw err;
    }
    callback(err, newRemoteId);
  });
}

ErrorFixer.setBoxUploader = function(box) {
  uploader = box;
};

ErrorFixer.setStorage = function (storage) {
  store = storage;
};

ErrorFixer.setRootId = function(id) {
  rootRemoteId = id;
};

// Issue = Problems noticed during validation like whitespace, bad characters, etc
ErrorFixer.canFixIssue = function() {
};

// Error = Problems noticed during upload process.
ErrorFixer.canFixError = function(type, errorNum, errorMsg) {
  switch(type) {
    case 'dir':
      if (errorNum == 409 || errorNum == 'pre-409') {
        return true;
      }
      break;
    case 'file':
      break;
    default:
      throw new Error("canFix?:: Unrecognized error type");
  }

  return false;
};

ErrorFixer.fixError = function(type, info, errorNum, callback) {
  switch(type) {
    case 'dir':
      if (errorNum == 409 || errorNum == 'pre-409') {
        correctDirRemoteId(info, callback);
      }
      break;
    case 'file':

      break;
    default:
      throw new Error("fixError:: Unrecognized error type");
  }
}
