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

/**
 var uploadStats = {
  time: 0,
  sFiles: 0,
  sDirs: 0,
  fDirs: 0,
  fFiles: 0,
  fixedDirs: 0,
  fixedFiles: 0,
  bytes: 0,
  totalBytes: 0,
  uploadingStr: '',
  totalUploads: ''
}; */


var uploadCounts = {
  totalFiles: 0,
  totalDirs: 0,
  goodFiles: 0,
  badFiles: 0,
  goodDirs: 0,
  badDirs: 0,
  fixedDirs: 0,
  totalBytes: 0,
  bytes: 0, // Not implmented yet.
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
  } catch(err) {}
}

callbacks.onCategorizeComplete = function() {
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
  });
}

callbacks.onFolderComplete = function(dir, error, response, completeCallback) {
  var remoteId;
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
    }
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
  if (!error.statusCode) {
    error.statusCode = 'SYS';
  }
  if (ErrorFixer.canFixError('dir', error.statusCode, error.message)) {
    info.error = error;
    info.dir = dir;
    ErrorFixer.fixError('dir', info, error.statusCode, function(err, remoteId) {
      if (err) {
        throw err;
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
  async.series([
    function(callback) {
      if (error) {
        if (!error.statusCode) {
          error.statusCode = 'SYS';
        }
        uploadCounts.badFiles += 1;
        diskState.storeFileError(file, error, response, callback);
      } else {
        uploadCounts.goodFiles += 1;
        callback();
      }
    },
    function(callback) {
      UI.updateUploading({fFiles: uploadCounts.badFiles, sFiles: uploadCounts.goodFiles});
      diskState.recordCompletion('file', file, callback);
    }
  ], function(err) {
    if (err) {
      throw Error(err);
    }
    completeCallback();
  });
}

callbacks.onDoneLoadingFromDisk = function(fileState) {
  if (!program.onlyValidate) {
    UI.startDisplay('upload');
    createBoxContent(fileState, function() {
      UI.stopDisplay('uploading');
      closeFiles();
      console.log("Totally done with creating box content!");
    });
  }
  closeFiles();
};

function createBoxContent(fileState, callback) {
  fileState.getIncompleteDirs(function(dirs) {
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
      createBoxContent(fileState, callback);
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
  .option('-fix, --fix-errors', 'Try to fix errors encountered on a previous upload attempt.')
  .action(function(source, dest) {
    console.log("SOURCE", source);
    var freshStart = program.assumeNew ? true : false;

    uploader.rootId = dest;
    ErrorFixer.setRootId(dest);

    initializeData(freshStart, onFdInitalized.bind(this, source, freshStart));
  })
  .parse(process.argv);

function onFdInitalized(source, freshStart) {
  var options = {
    onBadFile: callbacks.onBadFile,
    onBadDir: callbacks.onBadDirectory,
    onDirectoryStart: callbacks.onDirectoryStarted,
    onValidDir: callbacks.onValidDir,
    onValidFile: callbacks.onValidFile,
    onIgnoredFile: callbacks.onIgnoredFile
  };

  /* TODO: Get Filename-Validator module async-ified so that it's safe to run a validate
     followed immediately by the asyncrounous loadPreviousState behavior. */
  if (program.onlyValidate || freshStart) {
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
        callbacks.onCategorizeComplete();
      }
    ], function(err) {
      if (err) {
        throw err;
      }
      console.log("Done!!!");
    });
  } else if (!program.onlyValidate) {
    loadPreviousState(callbacks.onDoneLoadingFromDisk);
  } else {
    closeFiles();
  }
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
      console.log("Redoing uploads.");
      DiskState.clearProgress(callback);
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

  async.series(tasks, function() {
    if (doneCallback) {
      doneCallback(diskState);
    }
  })
}

function badDirToString(badDir) {
  var dirStr = badDir.str();
  var issueStr = badDir.issues.reduce(function(str, current) {
    return str + current + ';';
  }, '');

  // Report more information in the case of bad characters.
  if (badDir.issues.indexOf("chars") >= 0) {
    return issueStr + StickyDirInfo.SEP + dirStr + StickyDirInfo.SEP + callOutProblemChars(badDir.name) + '\n';
  }

  return issueStr + StickyDirInfo.SEP + dirStr + '\n';
}

function badFileToString(badFile) {
  var fileStr = badFile.str();
  var issueStr = badFile.issues.reduce(function(str, current) {
    return str + current + ';';
  }, '');

  // Report more information in the case of bad characters.
  if (badFile.issues.indexOf("chars") >= 0) {
    return issueStr + StickyFileInfo.SEP + fileStr + StickyFileInfo.SEP + callOutProblemChars(badFile.name) + '\n';
  }

  return issueStr + StickyFileInfo.SEP + fileStr;
}

function validFileToString(goodFile) {
  return goodFile.str() + '\n';
}

function validDirToString(goodDir) {
  return goodDir.str() + '\n';
}

function callOutProblemChars(str) {
  // We don't like something in the characters of this string.  Wrap each problem one.
  // /[^A-Za-z 0-9 \.,\?""!@#\$%\^&\*\(\)-_=\+;:<>\/\\\|\}\{\[\]`~]/g works too?
  str = str.replace(/[^ -~]|[\/\\]/g, function(currentStr) {
    var newStr = '[';

    for (var i = 0; i < currentStr.length; ++i) {
      newStr += '#' + currentStr.charCodeAt(i) + ';';
    }

    return newStr + ']';
  });
  return str;
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
  async.eachSeries(dirs, function(dir, callback) {
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
  async.eachSeries(files, function(file, callback) {
    diskState.recordStart('file', file, function() {
      if (file.issues.length !== 0) {
        throw new Error("BAD FILE, SHOULD NOT BE TRYING TO SYNC: " + file.localFolderId);
      }
      uploader.makeFile(file, callbacks.onFileComplete, callback);
    });
  }, function() {
    doneCallback();
  });
}
