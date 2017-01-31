'use strict';
var async = require('async');
var fs = require('fs');
var archiver = require('archiver');

var FileInfo = require('./file-info');

var ErrorFixer = module.exports;

var BOX_ITEM_NOT_FOLDER = "Item on Box.com was not a folder.";

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

function getParentRemoteId(dir, callback) {
  var parentRemoteId;
  var searchInfo = {dirId: dir.parentId};
  if (dir.parentId === 'noparent') {
    parentRemoteId = rootRemoteId;
    callback(null, parentRemoteId);
    return;
  }
  store.getRemoteDirId(searchInfo, function(err) {
    parentRemoteId = searchInfo.remoteId;
    callback(err, parentRemoteId);
  });
}

function correctDirRemoteId(issueInfo, callback) {
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
      getParentRemoteId(dir, function(err, result) {
        parentRemoteId = result;
        cb(err);
      });
    },
    function(cb) {
      // Step 2: Get all the entries in our parent folder.
      function GotEverything() {
        return entryInfo.entries.length >= entryInfo.totalCount;
      }

      async.doUntil(function(doCb) {
        // Offset is zero-based.
        entryInfo.offset = entryInfo.entries.length;
          getDirEntries(parentRemoteId, entryInfo.offset, function(err, total, entries) {
            entryInfo.totalCount = total;
            entryInfo.entries = entryInfo.entries.concat(entries);
            doCb(err);
          });
      }, GotEverything, cb);
    },
    function(cb) {
      // Step 3: Look in our Box parent entries to find the correct folder ID to use.
      var checkedCt = 0;
      var err;
      entryInfo.entries.some(function(entry, index, array) {
        checkedCt +=1;
        if (entry.name === dir.name) {
          if (entry.type !== 'folder') {
            err = new Error(BOX_ITEM_NOT_FOLDER);
            err.foundType = entry.type;
            err.itemName = entry.name;
          }
          newRemoteId = entry.id;
          return true;
        }
        return false;
      });

      if (err) {
        return cb(err);
      }

      if (!newRemoteId) {
        console.error("Entries checked", entryInfo.entries);
        console.error("Dir info", dir);
        // This shouldn't be happening... something big went wrong.
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
    callback(err, newRemoteId);
  });
}

function createZipofDirAndSaveToStorage(issueInfo, callback) {
  var dir = issueInfo.dir;
  var file = new FileInfo({
    localFolderId: dir.parentId,
    path: dir.pathStr,
    name: dir.name + '.zip',
    problems: []
  });
  var output = fs.createWriteStream(file.pathStr + '/' + file.name);
  var archive = archiver('zip');

  output.on('close', function() {
    store.storeFile('valid', file, callback);
  });

  archive.on('error', function(err) {
    throw err;
  });

  archive.pipe(output);
  archive.directory(dir.pathStr + '/' + dir.name, '');
  archive.finalize();
}

function dirRetryDone(dir, err, response, callback) {
  if (err) {
    // Don't totally remove existing error information.  Enhance the information a little.
    err.statusCode = "retry-" + dir.errCode + "-[" + err.statusCode + "]";
    err.message = "failed to retry during fix of error '" + dir.errText + "'.  New error: " + err.message;
    store.storeDirError(dir, err, response, function(err) {
      callback(err);
    });
  } else {
    store.removeDirError(dir.localId, function(err) {
      callback(err);
    });
  }
}

function retryBadUpload(issueInfo, callback) {
  var dir = issueInfo.dir;
  console.log("re-uploading:", issueInfo);
  async.series([
    function (cb) {
      store.recordStart('dir', dir, cb);
    },
    function (cb) {
      uploader.makeDir(dir, dirRetryDone, cb);
    },
    function(cb) {
      store.recordCompletion('dir', dir, cb);
    }
  ], function() {
    console.log("done retrying upload.");
    callback();
  });
}

function isfixableDirError(errorNum, errorText) {
  console.log("error info given", errorNum);
  if (errorNum == 409 || errorNum == 'pre-409') {
    return true;
  }

  if (errorNum == 503) {
    return true;
  }

  return false;
}

function fixDirError(info, errorNum, callback) {
  if (errorNum == 409 || errorNum == 'pre-409') {
    correctDirRemoteId(info, function(err) {
      if (err && err.message === BOX_ITEM_NOT_FOLDER) {
        // This is probably because a mac app bundle has been uploaded through other means.  But maybe not?  Upload a zip file
        // of this folder just in case.
        createZipofDirAndSaveToStorage(info, callback);
      } else {
        callback(err);
      }
    });
  } else if (errorNum == 503) {
    console.log("Retying");
    retryBadUpload(info, callback);
  } else {
    callback(new Error("Did not recognize error information during fix attempt: " + errorNum));
  }
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
      return isfixableDirError(errorNum, errorMsg);
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
      fixDirError(info, errorNum, callback);
      break;
    case 'file':

      break;
    default:
      throw new Error("fixError:: Unrecognized error type");
  }
};
