var async = require('async');
var Ui = require('./verify-uploads-ui');

var storage;
var box;

var VerifyUploads = {
  init: function(diskState, uploader) {
    storage = diskState;
    box = uploader;
  },
  verifyAll: function(callback) {

    async.series([
      function(cb) {
        Ui.start();
        cb();
      },
      verifyDirectories,
      verifyFiles
    ], function(err) {
      Ui.stop();
      callback(err);
    });
  }
};

function verifyDirectories(callback) {
  storage.getUploadedDirs(function (dirs) {
    async.eachLimit(dirs, 1, verifyDirUpload, callback);
  });
}

function verifyFiles(callback) {
  storage.getUploadedFiles(function (files) {
    async.eachLimit(files, 1, verifyFileUpload, callback);
  });
}

function verifyDirUpload(dir, callback) {
  Ui.startingDir(dir);
  box.getDirInfo(dir, null, function(err, response) {
    if (err) {
      Ui.failedDir(dir, err.message);
      // Error was handled, keep moving along.
      callback();
      return;
    }

    if (dir.name !== response.name) {
      Ui.failedDir(dir, "Name didn't match!  Expected: '" + dir.name + "' Got: '" + response.name + "'");
    }

    Ui.finishedDir(dir);
    callback();
  });
}

function verifyFileUpload(file, callback) {
  Ui.startingFile(file);
  box.getFileInfo(file, null, function(err, response) {
    if (err) {
      Ui.failedFile(file, err.message);
      // Error was handled, keep moving along.
      callback();
      return;
    }

    if (file.hash !== response.sha1) {
      Ui.failedFile(file, "Hash didn't match!  Expected: '" + file.hash + "' Got: '" + response.sha1 + "'");
    }

    Ui.finishedFile(file);
    callback();
  });
}


module.exports = VerifyUploads;
