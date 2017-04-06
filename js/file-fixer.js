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

FileFixer.fixAndUpload = function(file, streamHandlers, onFileComplete, callback) {
  var newName = file.name;
  var newFile;
  var valids = utils.validators;
  var remainingIssues = {
    chars: false,
    space: false,
    length: false
  };
  if (file.issues.includes("spaces")) {
    newName = newName.trim();
  }

  if (file.issues.includes("chars")) {
    newName = encodeURIComponent(newName);
  }

  remainingIssues.chars = valids.badChars(newName) ? true : false;
  remainingIssues.space = valids.badWhitespace(newName) ? true : false;
  remainingIssues.length = valids.badLength(newName) ? true : false;

  if (remainingIssues.chars || remainingIssues.space || remainingIssues.length) {
    store.storeFileError(callback);
    callback(new Error("Unable to fix invalid filename issues in a way that passes our validation specification. [Chars: " + remainingIssues.chars + " Space: " + remainingIssues.space + " Length: " + remainingIssues.length + "]"));
    return;
  }

  async.series([
    function(cb) {
      renameFileAndUpdateDb(file, newName, function(err, replacementFile) {
        newFile = replacementFile;
        cb(err);
      });
    },
    function(cb) {
      // Making sure the DB shows that we have a new file to move over.
      store.recordStart('file', newFile, cb);
    },
    function(cb) {
      file.remoteId = 'renamed';
      store.recordCompletion('file', file, cb);
    },
  ], callback);
};


function renameFileAndUpdateDb(currentFile, newName, callback) {
  var newFile = currentFile.duplicate();
  newFile.name = newName;
  newFile.issues = [];
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
