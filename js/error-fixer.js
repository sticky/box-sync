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

function getFileFolderRemoteId(file, callback) {
  var searchInfo = {dirId: file.localFolderId};
  store.getRemoteDirId(searchInfo, function(err) {
    callback(err, searchInfo.remoteId);
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
      store.storeDir(store.CLASS.VALID, dir, cb);
    }
  ], function(err) {
    callback(err, newRemoteId);
  });
}

function createZipofDirAndSaveToStorage(issueInfo, callback) {
  console.log("Making a zip file");
  var dir = issueInfo.dir;
  var file = new FileInfo({
    localFolderId: dir.parentId,
    path: dir.pathStr,
    name: dir.name + '_STICKY_SYNC.zip',
    problems: []
  });
  var output = fs.createWriteStream(file.pathStr + '/' + file.name);
  var archive = archiver('zip');

  output.on('close', function() {
    console.log("zip file completed");
    async.series([
      function(cb) {
        store.storeFile(store.CLASS.VALID, file, cb);
      },
      function(cb) {
        // Make sure our new file doesn't get lost in the hustle and bustle.
        store.recordStart('file', file, cb);
      },
      function (cb) {
        dir.remoteId = 'zipfile';
        store.storeDir(store.CLASS.VALID, dir, cb);
      }
    ], callback);
  });

  archive.on('error', function(err) {
    console.error("error during zip file");
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

function getFileRemoteIdIfMatchesLocal(issueInfo, callback) {
  var conflictedId = issueInfo.error.response.body.context_info.conflicts.id;
  var localFile = issueInfo.file;
  var partialRemoteFile = new FileInfo({remote: conflictedId});

  uploader.getFileInfo(partialRemoteFile, null, function(err, response) {
    if (err) {
      callback(err);
      return;
    }

    if (response.sha1 !== localFile.hash) {
      callback(new Error("File already exists but remote file hash did not match local hash."));
    } else {
      callback(null, response.id);
    }
  });
}

function maybeMarkDirAsZipped(issueInfo, callback) {
  // This directory might not have a remote folder to live in because that parent folder
  // was zipped up.  This directory should be marked as zipped too and not labelled as an error.
  getParentRemoteId(issueInfo.dir, function(err, remoteId) {
    if (err) {
      callback(err);
      return;
    }
    if (remoteId !== 'zipfile') {
      callback(new Error("Directory directory not flagged as a zipfile directory."));
      return;
    }
    issueInfo.dir.remoteId = 'zipfile'
    callback(null, issueInfo.dir);
  });
}

function maybeMarkFileAsZipped(issueInfo, callback) {
  // This file might not have a remote folder to live in because that remote folder
  // was zipped up.  This file should be marked as zipped too and not labelled as an error.
  getFileFolderRemoteId(issueInfo.file, function(err, remoteId) {
    if (err) {
      callback(err);
      return;
    }
    if (remoteId !== 'zipfile') {
      callback(new Error("File directory not flagged as a zipfile directory."));
      return;
    }
    issueInfo.file.remoteId = 'zipfile'
    callback(null, issueInfo.file);
  });
}

function isfixableDirError(errorNum, errorText) {
  if (errorNum == 409 || errorNum == 'pre-409') {
    return true;
  }

  if (errorNum == 404 || errorNum == 'pre-404') {
    return true;
  }

  if (errorNum == 503) {
    return true;
  }

  return false;
}

function isfixableFileError(errorNum, errorText) {
  if (errorNum == 409 || errorNum == 'pre-409') {
    return true;
  }

  if (errorNum == 404 || errorNum == 'pre-404') {
    return true;
  }

  return false;
}

function fixDirError(info, errorNum, callback) {
  if (errorNum == 409 || errorNum == 'pre-409') {
    console.log("fixing error 409");
    correctDirRemoteId(info, function(err) {
      if (err && err.message === BOX_ITEM_NOT_FOLDER) {
        console.log("trying to fix folder conflict");
        // This is probably because a mac app bundle has been uploaded through other means.  But maybe not?  Upload a zip file
        // of this folder just in case.
        createZipofDirAndSaveToStorage(info, function(err) {

          callback();
        });
      } else {
        callback(err);
      }
    });
  } else if (errorNum == 503) {
    retryBadUpload(info, callback);
  } else if (errorNum == 404 || errorNum == 'pre-404') {
    console.log("fixing FILE error 404: " + info.dir.path + '/' + info.dir.name);
    // Currently the only recognized case of a 404 file is if the parent directory has ended up getting rolled into
    // a zip file.
    maybeMarkDirAsZipped(info, function(err, dir) {
      if (err) {
        // Don't pass on the failure to the error log; keep the original information.
        callback(info.error);
        return;
      }

      async.series([
        function(cb) {
          store.storeDir(store.CLASS.VALID, dir, cb);
        },
        function(cb) {
          store.removeDirError(dir.localId, cb);
        },
      ], callback);
    });
  } else {
    callback(new Error("Did not recognize error information during fix attempt: " + errorNum));
  }
}

function fixFileError(info, errorNum, callback) {
  if (errorNum == 409 || errorNum == 'pre-409') {
    console.log("fixing FILE error 409");
    getFileRemoteIdIfMatchesLocal(info, function(err, remoteId) {
      if (err) {
        callback(err);
        return;
      }
      info.file.remoteId = remoteId;
      async.series([
        function(cb) {
          store.storeFile(store.CLASS.VALID, info.file, cb);
        },
      ], callback);
    });
  } else if (errorNum == 404 || errorNum == 'pre-404') {
    console.log("fixing FILE error 404: " + info.file.path + '/' + info.file.name);
    // Currently the only recognized case of a 404 file is if the parent directory has ended up getting rolled into
    // a zip file.
    maybeMarkFileAsZipped(info, function(err, file) {
      if (err) {
        // Don't pass on the failure to the error log; keep the original information.
        callback(info.error);
        return;
      }

      async.series([
        function(cb) {
          store.storeFile(store.CLASS.VALID, file, cb);
        },
      ], callback);
    });
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

// Error = Problems noticed during upload process.
ErrorFixer.canFixError = function(type, errorNum, errorMsg) {
  switch(type) {
    case 'dir':
      return isfixableDirError(errorNum, errorMsg);
      break;
    case 'file':
      return isfixableFileError(errorNum, errorMsg);
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
      fixFileError(info, errorNum, callback);
      break;
    default:
      throw new Error("fixError:: Unrecognized error type");
  }
};
