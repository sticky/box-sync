#!/usr/bin/env node
'use strict';
var fs = require('fs');
var program = require('commander');
var async = require("async");

var UI = require('./js/ConsoleOutput.js');
var BoxUploader = require('./js/box-uploader.js');
var StickyFileInfo = require('./js/file-info');
var StickyDirInfo = require('./js/dir-info');
var DiskState = require('./js/disk-state');
var ErrorFixer = require('./js/error-fixer');

var validator = require('./js/filename-validator');

var FILENAMES = {
  ignoredFiles: 'files/IgnoredFiles.txt',
  ignoredDirs: 'files/IgnoredDirs.txt',
};

var callbacks = {};
var diskState = new DiskState();
var uploader = new BoxUploader(diskState);
ErrorFixer.setBoxUploader(uploader);
ErrorFixer.setStorage(diskState);

var times = {
  start: process.hrtime(),
  elapsed: 0
};

var validCounts = {
  validDirs: 0,
  validFiles: 0,
  invalidDirs: 0,
  invalidFiles: 0,
  read: 0,
  stored: 0,
  bytes: 0, // Not implmented yet.
};

var uploadCounts = {
  totalFiles: 0,
  totalDirs: 0,
  goodFiles: 0,
  badFiles: 0,
  goodDirs: 0,
  badDirs: 0,
  fixedDirs: 0,
  totalBytes: 0,
  bytes: 0,
};

var updateUiTimer;

callbacks.onDirectoryStarted = function (path) {
  var cols = UI.getStrWidth();
  var progressStr = formatPathProgress("", path, cols);
  UI.setReading(progressStr);
}

callbacks.onBadDirectory = function (dirInfo, callback) {
  var cols = UI.getStrWidth();
  validCounts.read += 1;
  diskState.storeDir('bad', dirInfo, function(err) {
    if (err) {
      throw err;
    }
    validCounts.stored += 1;
    UI.setStoring(formatPathProgress("", dirInfo.pathStr + "/" + dirInfo.name, cols));
    UI.setStats({savedCt: validCounts.stored});
    callback();
  });
  var cols = UI.getStrWidth();
  validCounts.invalidDirs += 1;
  UI.setStats({iFiles: validCounts.invalidDirs, time: process.hrtime(times.start)[0], totalCt: validCounts.read});
}

callbacks.onBadFile = function (fileInfo, callback) {
  var cols = UI.getStrWidth();
  validCounts.read += 1;
  diskState.storeFile('bad', fileInfo, function(err) {
    if (err) {
      throw err;
    }
    validCounts.stored += 1;
    UI.setStoring(formatPathProgress("", fileInfo.pathStr + "/" + fileInfo.name, cols));
    UI.setStats({savedCt: validCounts.stored});
    callback();
  });
  validCounts.invalidFiles += 1;
  UI.setStats({iDirs: validCounts.invalidFiles, time: process.hrtime(times.start)[0], totalCt: validCounts.read});
}
callbacks.onValidDir = function (dirInfo, callback) {
  var cols = UI.getStrWidth();
  validCounts.read += 1;
  diskState.storeDir('valid', dirInfo, function(err) {
    if (err) {
      throw err;
    }
    validCounts.stored += 1;
    UI.setStoring(formatPathProgress("", dirInfo.pathStr + "/" + dirInfo.name, cols));
    UI.setStats({savedCt: validCounts.stored});
    callback();
  });
  validCounts.validDirs += 1;
  UI.setStats({vDirs: validCounts.validDirs, time: process.hrtime(times.start)[0], totalCt: validCounts.read});
}

callbacks.onValidFile = function (fileInfo, callback) {
  var cols = UI.getStrWidth();
  validCounts.read += 1;
  diskState.storeFile('valid', fileInfo, function(err) {
    if (err) {
      throw err;
    }
    validCounts.stored += 1;
    UI.setStoring(formatPathProgress("", fileInfo.pathStr + "/" + fileInfo.name, cols));
    UI.setStats({savedCt: validCounts.stored});
    callback();
  });
  validCounts.validFiles += 1;
  UI.setStats({vFiles: validCounts.validFiles, time: process.hrtime(times.start)[0], totalCt: validCounts.read});
}

callbacks.onIgnoredFile = function(path, file) {
  try {
    fs.appendFileSync(fds.ignoredFiles, path + '/' + file + '\n');
  } catch(err) {
    throw err;
  }
}

callbacks.onCategorizeComplete = function(callback) {
  var stats = validator.getStats();
  clearTimeout(updateUiTimer);
  UI.stopDisplay();

  async.series([
    function(callback) {
      diskState.recordVar('bytes', stats.bytes, callback);
    },
    function(callback) {
      diskState.recordVar('completed_validate', true, callback);
    },
  ], function() {
    console.log("# valid", stats.validCounts.files);
    console.log("# valid dirs", stats.validCounts.dirs);
    console.log("# bad file lengths", stats.badCounts.long);
    console.log("# bad file chars", stats.badCounts.unprintable);
    console.log("# bad whitespace", stats.badCounts.spaces);
    console.log("# bytes", stats.bytes);
    console.log("Time elapsed (s):",  process.hrtime(times.start)[0]);
    callback();
  });
}

callbacks.onFolderComplete = function(dir, error, response, completeCallback) {
  if (response) {
    dir.remoteId = response.id;
  }
  async.series([
    function(callback) {
      if (error) {
        uploadCounts.badDirs += 1;
        callbacks.onFolderError(dir, error, response, completeCallback);
      } else {
        uploadCounts.goodDirs += 1;
        callback();
      }
    },
    function(callback) {
      diskState.storeDir('valid', dir, callback);
    },
    function(callback) {
      // Have to prep the DB because it doesn't initialize in a parallel-safe way.
      diskState.recordVar('uploaded_dir_fixed', uploadCounts.fixedDirs, callback);
    },
    function(callback) {
      async.parallel([
        function(cb) {
          diskState.recordVar('uploaded_dir_fail', uploadCounts.badDirs, cb);
        },
        function(cb) {
          diskState.recordVar('uploaded_dir_finish', uploadCounts.goodDirs, cb);
        }
      ], callback);
    },
  ], function(err) {
    if (err) {
      throw Error(err);
    }
    console.log("finished async");
    UI.updateUploading({fDirs: uploadCounts.badDirs, sDirs: uploadCounts.goodDirs, fixedDirs: uploadCounts.fixedDirs});
    completeCallback();
  });
}

callbacks.onFolderError = function(dir, error, response, completeCallback) {
  var info = {};
  generalErrorTouchup(error);
  if (ErrorFixer.canFixError('dir', error.statusCode, error.message)) {
    info.error = error;
    info.dir = dir;
    ErrorFixer.fixError('dir', info, error.statusCode, function(err, remoteId) {
      if (err) {
        completeCallback(err);
      }
      uploadCounts.fixedDirs += 1;
      uploadCounts.badDirs -= 1;
      completeCallback();
    });
  } else {
    UI.updateUploading({fDirs: uploadCounts.badDirs, sDirs: uploadCounts.goodDirs, fixedDirs: uploadCounts.fixedDirs});
    diskState.storeDirError(dir, error, response, completeCallback);
  }
};

callbacks.onFileComplete = function(file, error, response, completeCallback) {
  if (response && response.entries && response['total_count'] === 1) {
    file.remoteId = response.entries[0].id;
  }
  async.series([
    function(callback) {
      if (error) {
        generalErrorTouchup(error);
        uploadCounts.badFiles += 1;
        diskState.storeFileError(file, error, response, callback);
      } else {
        uploadCounts.goodFiles += 1;
        callback();
      }
    },
    function(callback) {
      diskState.storeFile('valid', file, callback);
    },
    function(callback) {
      UI.updateUploading({fFiles: uploadCounts.badFiles, sFiles: uploadCounts.goodFiles});
      diskState.recordCompletion('file', file, callback);
    },
    function(callback) {
      async.parallel([
        function(cb) {
          diskState.recordVar('uploaded_bytes', uploadCounts.bytes, cb);
        },
        function(cb) {
          diskState.recordVar('uploaded_file_fail', uploadCounts.badFiles, cb);
        },
        function(cb) {
          diskState.recordVar('uploaded_file_finish', uploadCounts.goodFiles, cb);
        }
      ], callback);
    },
  ], function(err) {
    if (err) {
      throw Error(err);
    }
    completeCallback();
  });
}

function generalErrorTouchup(error) {
  if (!error.statusCode) {
    error.statusCode = 'SYS';
  }

  // We don't want to keep trying if we're not even authenticated correctly.
  // But try to avoid other random 400 "bad request" messages.
  if (error.statusCode == 400 || error.statusCode == 'pre-400') {
    if (error.message.includes('Auth') || error.message.includes('auth')) {
      throw new Error("Possible authentication failure  Server response: " + error.message);
    }
  }
}

function beginUploading(callback) {
  if (!program.onlyValidate) {
    UI.startDisplay('upload');
    UI.updateUploading({totalBytes: uploadCounts.totalBytes, start: Date.now()});
    createBoxContent(function() {
      UI.stopDisplay('uploading');
      callback();
      console.log("Totally done with creating box content!");
    });
  }
};

callbacks.onFileData = function(chunk) {
  uploadCounts.bytes += chunk.length;
  UI.updateUploading({bytes: uploadCounts.bytes});
};

callbacks.onFileEnd = function() {};

function createBoxContent(callback) {
  diskState.getIncompleteDirs(function(dirs) {
    if (dirs === false)  {
      // Fake the root directory as a starting point.
      dirs = [new StickyDirInfo({inode: 'noparent', parent: 'noparent'})];
    }
    if (!dirs) {
      callback();
      return;
    }
    async.each(dirs, uploadDirectory, function(err) {
      if (err) {
        throw new Error("createBoxContent: " + err);
      }
      createBoxContent(callback);
    });
  });
}

function uploadDirectory(dir, onDone) {
  var realDir = dir.localId !== 'noparent';
  async.series([
    function(callback) {
      if (realDir) {
        diskState.recordStart('dir', dir, callback);
      } else {
        callback();
      }
    },
    function(callback) {
      diskState.getFilesInDir(dir, function(files) {
        putFilesOnBox(files, callback);
      });
    },
    function(callback) {
      diskState.getDirsInDir(dir, function(dirs) {
        putFoldersOnBox(dirs, callback);
      });
    },
  ], function(err) {
    if (err) {
      throw new Error(err);
    }

    if (realDir) {
      diskState.recordCompletion('dir', dir);
    }
    onDone();
  });
}

// File descriptors
var fds = {ignoredFiles: null};

program
  .version('0.0.1')
  .arguments('<local-dir> <box-folder>')
  .option('-v, --only-validate', 'Only do the initial validation and categorization of the files.')
  .option('-n, --assume-new', 'Completely ignore results from previous runs.')
  .option('-r, --redo', 'Try to upload all files, ignoring previous upload attempts.')
  .option('-f, --fix-errors', 'Try to fix errors encountered on a previous upload attempt.')
  .action(function(source, dest) {
    console.log("SOURCE", source);
    var freshStart = program.assumeNew ? true : false;

    uploader.rootId = dest;
    ErrorFixer.setRootId(dest);

    initializeData(freshStart, onFdInitalized.bind(this, source, freshStart));
  })
  .parse(process.argv);

function onFdInitalized(source, freshStart) {
  var tasks = [];

  /* TODO: Get Filename-Validator module async-ified so that it's safe to run a validate
     followed immediately by the asyncrounous loadPreviousState behavior. */
  if (program.onlyValidate || freshStart) {
    tasks.push(function(cb) {
      runValidation(source, cb);
    });
  } else if (!program.onlyValidate) {
    tasks.push(loadPreviousState);

    if (program.fixErrors) {
      throw new Error("Fixing errors not implemented!");
    }


    // A switch to parallel behavior could make the DB class explode because its statement preparation
    // is not parallel safe.
    // Do one non-parallel call to storage to get those statements prepared.
    tasks.push(function(cb) {
      diskState.recordVar('nada', 0, cb);
    });
    tasks.push(function(cb) {
     beginUploading(cb);
     });
  }

  async.series(tasks,function(err) {
    if (err) {
      throw err;
    }
    closeFiles();
  });
}

function runValidation(source, callback) {
  var options = {
    onBadFile: callbacks.onBadFile,
    onBadDir: callbacks.onBadDirectory,
    onDirectoryStart: callbacks.onDirectoryStarted,
    onValidDir: callbacks.onValidDir,
    onValidFile: callbacks.onValidFile,
    onIgnoredFile: callbacks.onIgnoredFile
  };
  UI.startDisplay('validate');
  updateUiTimer = setInterval(function() {
    UI.setStats({time: process.hrtime(times.start)[0]});
  }, 1000);

  async.series([
    function(callback) {
      diskState.recordVar('completed_validate', false, callback);
    },
    function(callback) {
      diskState.recordVar('bytes', 0, callback);
    },
    function(callback) {
      diskState.prepareForInserts(callback);
    },
    function(callback) {
      validator.categorizeDirectoryContents(source, null, options, true, callback);
    },
    function(callback) {
      console.log("Finishing writes to database...");
      diskState.completeInserts(callback);
    },
    function(callback) {
      callbacks.onCategorizeComplete(callback);
    }
  ], function(err) {
    if (err) {
      throw err;
    }
    console.log("Done!!!");
    callback();
  });
}

function closeFiles() {
  for (var fdType in fds) {
    if (fds.hasOwnProperty(fdType)) {
      if (fds[fdType]) {
        fs.closeSync(fds[fdType]);
      }
    }
  }
}

function hasContent (filename) {
  var stats;
  var contentPresent = false;

  try {
    stats = fs.statSync(__dirname + '/' + filename);
    contentPresent = stats["size"] > 0;
  } catch (err) {
    // Probably doesn't exist.
  }

  return contentPresent;
}

function initializeData(fresh, callback) {
  var tasks = [];
  if (program.redo) {
    tasks.push(function(callback) {
      DiskState.clearProgress(callback);
    });
    // This is a dumb trick to make sure that the database finished preparing
    // its statements; the DB store behavior is not parallel safe and will explode.
    tasks.push(function(callback) {
      diskState.recordVar('uploaded_dir_fixed', 0, callback);
    });
    tasks.push(function(callback) {
      // Clear previous progress variables related to uploading.
      async.parallel([
        function(cb) {
          diskState.recordVar('uploaded_dir_fail', 0, cb);
        },
        function(cb) {
          diskState.recordVar('uploaded_dir_finish', 0, cb);
        },
        function(cb) {
          diskState.recordVar('uploaded_bytes', 0, cb);
        },
        function(cb) {
          diskState.recordVar('uploaded_file_fail', 0, cb);
        },
        function(cb) {
          diskState.recordVar('uploaded_file_finish', 0, cb);
        }
      ], callback);
    });
  }

  if (fresh === true) {
    tasks.push(function(callback) {
      console.log("treating as fresh start (purging all existing state)");
      try {
        fds.ignoredFiles = fs.openSync(__dirname + '/' + FILENAMES.ignoredFiles, 'w');
      } catch (err) {
        throw err;
      }
      DiskState.clear(callback);
    });
  } else {
    tasks.push(function(callback) {
      try {
        fds.ignoredFiles = fs.openSync(__dirname + '/' + FILENAMES.ignoredFiles, 'w');
      } catch (err) {
        throw err;
      }
      callback();
    });
  }

  async.series(tasks, function() {
    callback();
  });
}

function loadPreviousState(doneCallback) {
  console.log("loading previous");
  var tasks = [];

  tasks.push(function(callback) {
    diskState.loadFiles("bad", function() {
      callback();
    });
  });

  tasks.push(function(callback) {
    diskState.loadDirs("bad", function() {
      callback();
    });
  });

  tasks.push(function(callback) {
    diskState.loadDirs("valid", function() {
      callback();
    });
  });

  tasks.push(function(callback) {
    diskState.loadDirs("valid", function() {
      callback();
    });
  });

  tasks.push(function(callback) {
    diskState.loadFiles("valid", function() {
      callback();
    });
  });

  tasks.push(function(callback) {
    diskState.getVars(function(rows) {
      rows.forEach(function(varRow) {
   switch(varRow.Name) {
          case 'bytes':
            uploadCounts.totalBytes = parseInt(varRow.Value);
            break;
          case 'uploaded_bytes':
            uploadCounts.bytes = parseInt(varRow.Value);
            break;
          case 'uploaded_dir_fixed':
            uploadCounts.fixedDirs = parseInt(varRow.Value);
            break;
          case 'uploaded_dir_fail':
            uploadCounts.badDirs = parseInt(varRow.Value);
            break;
          case 'uploaded_file_fail':
            uploadCounts.badFiles = parseInt(varRow.Value);
            break;
          case 'uploaded_file_finish':
            uploadCounts.goodFiles = parseInt(varRow.Value);
            break;
          case 'uploaded_dir_finish':
            uploadCounts.goodDirs = parseInt(varRow.Value);
            break;
        }
      });
      callback();
    });
  });

  async.series(tasks, function() {
    if (doneCallback) {
      doneCallback(null, diskState);
    }
  })
}

function formatPathProgress(label, path, width) {
  var label = label + " ";
  var pathStart;
  var pathEnd;

  pathStart = path.substring(0, width / 3);
  pathEnd = path.substring(path.length - width / 3, path.length);

  return label + pathStart + '...' + pathEnd;
}

function putFoldersOnBox(dirs, doneCallback) {
  async.eachLimit(dirs, 3, function(dir, callback) {
    diskState.recordStart('dir', dir, function() {
      if (dir.issues.length !== 0) {
        throw new Error("BAD DIR, SHOULD NOT BE TRYING TO SYNC: " + dir.localId);
      }
      uploader.makeDir(dir, callbacks.onFolderComplete, callback);
    })
  }, function() {
    doneCallback();
  });
}

function putFilesOnBox(files, doneCallback) {
  async.eachLimit(files, 10, function(file, callback) {
    diskState.recordStart('file', file, function() {
      if (file.issues.length !== 0) {
        throw new Error("BAD FILE, SHOULD NOT BE TRYING TO SYNC: " + file.localFolderId);
      }
      uploader.makeFile(file, {data: callbacks.onFileData, end: callbacks.onFileEnd}, callbacks.onFileComplete, callback);
    });
  }, function() {
    doneCallback();
  });
}
