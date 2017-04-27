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

function renameFileAndUpdateDb(currentFile, newName, callback) {
  var newFile = currentFile.duplicate();
  newFile.name = newName;
  newFile.issues = [];
  newFile.remoteId = null;

  // These timestamps (in current behavior) aren't set until an upload is attempted.
  newFile.created = null;
  newFile.updated = null;
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

module.exports = FileFixer;
