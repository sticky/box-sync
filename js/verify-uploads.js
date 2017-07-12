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
  storage.getUnverifiedDirs(function (dirs) {
    async.eachLimit(dirs, 1, verifyDirUpload, callback);
  });
}

function verifyFiles(callback) {
  storage.getUnverifiedFiles(function (files) {
    async.eachLimit(files, 1, verifyFileUpload, callback);
  });
}

function verifyDirUpload(dir, callback) {
  // If this isn't a number, it has probably been manually handled or is otherwise not a normal upload.
  // Sidenote: Holy crap is it hard to simply do an "is numeric" check in Javascript.
  if (isNumeric(dir.remoteId)) {
    storage.recordVerifyComplete('dir', dir, callback);
    return;
  }

  async.series(
    [
      function(cb) {
        Ui.startingDir(dir);
        cb();
      },
      function(cb) {
        box.getDirInfo(dir, null, function(err, response) {
          if (err) {
            cb(err.message);
            return;
          }

          if (dir.name !== response.name) {
            cb(new Error("Name didn't match!  Expected: '" + dir.name + "' Got: '" + response.name + "'"));
            return;
          }

          cb();
        });
      },
      function(cb) {
        storage.recordVerifyComplete('dir', dir, cb);
      },
      function(cb) {
        // Maybe a previous attempt left an error sitting around.  Clean it up!
        storage.removeDirError(dir.localId, cb);
      }
    ],
    function(err) {
      Ui.finishedDir(dir);
      if (err) {
        Ui.failedDir(dir, err);
        recordFailureToVerifyDir(dir, {statusCode: 'VERIFY', message: err}, callback);
        return;
      }
      callback();
    }
  );
}

function recordFailureToVerifyDir(dir, error, callback) {
  async.series([
    function(cb) {
      storage.storeDirError(dir, error, null, cb);
    },
    function(cb) {
      storage.recordVerifyInComplete('dir', dir, cb);
    }],
    function(err) {
      if (err) {
        throw new Error(err);
      }
      callback();
    }
  );
}

function verifyFileUpload(file, callback) {
  var tasks = [];
  // If this isn't a number, it has probably been manually handled or is otherwise not a normal upload.
  if (!isNumeric(file.remoteId)) {
    storage.recordVerifyComplete('file', file, callback);
    return;
  }

  tasks.push(
    function(cb) {
      Ui.startingFile(file);
      cb();
    }
  );

  tasks.push(function(cb) {
    box.getFileInfo(file, null, function(err, response) {
      if (err) {
        cb(err);
        return;
      }
      if (file.hash !== response.sha1) {
        err = "Hash didn't match!  Expected: '" + file.hash + "' Got: '" + response.sha1 + "'";
      }
      cb(err);
    });
  });

  tasks.push(function(cb) {
    storage.recordVerifyComplete('file', file, cb);
  });

  tasks.push(function(cb) {
    // Maybe a previous attempt left an error sitting around.  Clean it up!
    storage.removeFileError(file.localFolderId, file.name, cb);
  });

  async.series(tasks, function(err) {
    Ui.finishedFile(file);
    if (err) {
      recordFailureToVerifyFile(file, {statusCode: 'VERIFY', message: err}, callback);
      Ui.failedFile(file, err);
      return;
    }
    callback(err);
  });
}

function recordFailureToVerifyFile(file, error, callback) {
  async.series([
    function(cb) {
      storage.storeFileError(file, error, null, cb);
    },
    function(cb) {
      storage.recordVerifyInComplete('file', file, cb);
    },
    function(err) {
      if (err) {
        throw new Error(err);
      }
      callback();
    }
  ]);
}

// Always forget what a pain it is to do a simple "Is this thing numeric?" and also find a solution that
// works.
function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}


module.exports = VerifyUploads;
