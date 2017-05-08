'use strict';
var async = require('async');
var fs = require('fs');
var utils = require('./util');

var uploader;
var store;
var rootRemoteId;

var FileFixer  = {};

FileFixer.setBoxUploader = function(box) {
  uploader = box;
};

FileFixer.setStorage = function (storage) {
  store = storage;
};

FileFixer.setRootId = function(id) {
  rootRemoteId = id;
};

FileFixer.fixAndMarkForUpload = function(type, item, callback) {
  var newName;
  var valids = utils.validators;
  var tasks = [];
  var remainingIssues = {
    chars: false,
    space: false,
    length: false
  };


  newName = item.name;
  if (item.issues.includes("spaces")) {
    newName = newName.trim();
  }

  if (item.issues.includes("chars")) {
    newName = encodeURIComponent(newName);
  }

  switch(type) {
    case 'dir':
      throw new Error("Fixing directory uploads is still unfinished and should not be used.");
      tasks = assembleDirRenameTasks(item, newName);
      break;
    case 'file':
      tasks = assembleFileRenameTasks(item, newName);
      break;
    default:
      throw new Error("fixAndMarkForUpload:: Unrecognized file type given (" + type + ")");
  }

  remainingIssues.chars = valids.badChars(newName) ? true : false;
  remainingIssues.space = valids.badWhitespace(newName) ? true : false;
  remainingIssues.length = valids.badLength(newName) ? true : false;

  if (remainingIssues.chars || remainingIssues.space || remainingIssues.length) {
    callback(new Error("Unable to fix invalid filename issues in a way that passes our validation specification. [Chars: " + remainingIssues.chars + " Space: " + remainingIssues.space + " Length: " + remainingIssues.length + "]"));
    return;
  }

  async.series(tasks, callback);
};

function assembleDirRenameTasks(oirginalDir, newName) {
  var newDir;
  return [
    function(cb) {
      renameDirAndUpdateDb(oirginalDir, newName, function(err, replacementDir) {
        newDir = replacementDir;
        cb(err);
      });
    },
    function(cb) {
      // Making sure the DB indicates that we have a new dir to move over.
      store.recordStart('dir', newDir, cb);
    },
    function(cb) {
      oirginalDir.remoteId = 'renamed';
      store.storeDir(store.CLASS.INVALID, oirginalDir, cb);
    },
    function(cb) {
      updatePathsAfterParentChange(oirginalDir, newDir, cb);
    },
    function(cb) {
      store.recordCompletion('dir', oirginalDir, cb);
    }
  ];
}

function assembleFileRenameTasks(originalFile, newName) {
  var newFile;
  return [
    function(cb) {
      renameFileAndUpdateDb(originalFile, newName, function(err, replacementFile) {
        newFile = replacementFile;
        cb(err);
      });
    },
    function(cb) {
      // Making sure the DB shows that we have a new file to move over.
      store.recordStart('file', newFile, cb);
    },
    function(cb) {
      originalFile.remoteId = 'renamed';
      store.storeFile(store.CLASS.INVALID, originalFile, cb);
    },
    function(cb) {
      store.recordCompletion('file', originalFile, cb);
    }
  ];
}

function renameDirAndUpdateDb(currentDir, newName, callback) {
  var newDir = utils.createNewItemFrom(currentDir);
  newDir.name = newName;
  var fullOldPath = currentDir.pathStr + '/' + currentDir.name;
  var fullNewPath = newDir.pathStr + '/' + newDir.name;

  async.series([
    function(cb) {
      fs.rename(fullOldPath, fullNewPath, cb);
    },
    // There could be a new id.  One known case is on some windows FS, if the filename is longer.
    function(cb) {
      var stat = fs.statSync(fullNewPath);
      newDir.localId = stat.ino;
      cb();
    },
    function(cb) {
      store.storeDir(store.CLASS.VALID, newDir, cb);
    },
  ], function(err) {
    if (err) {
      throw err;
    }
    callback(null, newDir);
  });
}

function renameFileAndUpdateDb(currentFile, newName, callback) {
  var newFile = utils.createNewItemFrom(currentFile);
  newFile.name = newName;
  var fullOldPath = currentFile.pathStr + '/' + currentFile.name;
  var fullNewPath = newFile.pathStr + '/' + newFile.name;

  async.series([
    function(cb) {
      fs.rename(fullOldPath, fullNewPath, cb);
    },
    function(cb) {
      store.storeFile('valid', newFile, cb);
    },
  ], function(err) {
    if (err) {
      throw err;
    }
    callback(null, newFile);
  });
}

function updatePathsAfterParentChange(originalDir, newDir, callback) {
  var filesToUpdate = [];
  var dirsToUpdate = [];
  var originalPath = originalDir.pathStr + '/' + originalDir.name;
  var replacementPath = newDir.pathStr + '/' + newDir.name;
  async.series([
    function(cb) {
      store.getItemsWithinPath(originalPath, function(err, items) {
        if (err) {
          cb(err);
          return;
        }

        filesToUpdate = items.files;
        dirsToUpdate = items.dirs;
      });
    },
    function(cb) {
      replaceFilePathParts(filesToUpdate, originalPath, replacementPath, cb);
    },
    function(cb) {
      replaceDirPathParts(filesToUpdate, originalPath, replacementPath, cb);
    }
  ], callback);
  store.getAllDecendants();
}

function replaceFilePathParts(files, originalString, newString, callback) {

  async.eachLimit(3, files,
    function(file, cb) {
      var classification = utils.itemHasIssues(file) ? store.CLASS.INVALID : store.CLASS.VALID;
      file.name = file.name.replace(originalString, newString);
      store.storeFile(classification, file, cb);
    },
    callback);
}

function replaceDirPathParts(dirs, originalString, newString, callback) {
  async.eachLimit(3, dirs,
    function(dir, cb) {
      var classification = utils.itemHasIssues(dir) ? store.CLASS.INVALID : store.CLASS.VALID;
      dir.name = dir.name.replace(originalString, newString);
      store.storeDir(classification, dir, cb);
    },
    callback);
}


module.exports = FileFixer;
