'use strict';
var async = require('async');

var ErrorFixer = module.exports;

var uploader;
var store;
var rootRemoteId;

function correctDirRemoteId(issueInfo, callback) {
  console.log("getting an existing dir remote", issueInfo);
  var dir = issueInfo.dir;
  var newRemoteId;
  var parentRemoteId;

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
        console.log("search info to find parent folder ID", searchInfo);
        parentRemoteId = searchInfo.remoteId;
        cb();
      });
    },
    function(cb) {
      // Step 2: Look in our Box parent folder to find the correct folder ID to use.
      console.log("starting to search my parent for the correct ID");
      uploader.getDirContents(parentRemoteId, function(err, response) {
        if (err) {
          throw err;
        }

        //console.log("resssponnnnseeee!!!", response);
        response.entries.some(function(entry) {
          if (entry.type === 'folder' && entry.name === dir.name) {
            newRemoteId = entry.id;
            return true;
          }
        });
        if (!newRemoteId) {
          throw new Error("New remote ID not found during attempt to fix.");
        }
        cb();
      });
    },
    function(cb) {
      // Step 3: Save our new remote ID.
      console.log("Okay, time to save our new remote id:", newRemoteId);
      dir.remoteId = newRemoteId;
      store.storeDir('valid', dir, cb);
    }
  ], function(err) {
    if (err) {
      throw err;
    }

    console.log("remote id!!!!", newRemoteId);
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
      console.log("fixing error using info", info);
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
