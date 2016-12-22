#!/usr/bin/env node
'use strict';
var fs = require('fs');
var program = require('commander');
var ProgressBar = require('progress');
var async = require("async");

var BoxUploader = require('./js/box-uploader.js');
var StickyFileInfo = require('./js/file-info');
var StickyDirInfo = require('./js/dir-info');
var DiskState = require('./js/disk-state');

var Db = require('./js/files-db');

var validator = require('./js/filename-validator');

var FILENAMES = {
  ignoredFiles: 'files/Ignored.txt',
};

var outputStream = process.stdout;
var lastStrRendered = '';
var callbacks = {};
var diskState = new DiskState();
var uploader = new BoxUploader(diskState);

callbacks.onDirectoryStarted = function (path) {
  var progressStr = formatPathProgress(path, outputStream);
  if (lastStrRendered !== progressStr) {
    outputStream.cursorTo(0);
    outputStream.write(progressStr);
    outputStream.clearLine(1);
    lastStrRendered = progressStr;
  }
}

callbacks.onBadDirectory = function (dirInfo) {
  diskState.storeDir('bad', dirInfo);
}

callbacks.onBadFile = function (fileInfo) {
  diskState.storeFile('bad', fileInfo);
}
callbacks.onValidDir = function (dirInfo) {
  diskState.storeDir('valid', dirInfo);
}

callbacks.onValidFile = function (fileInfo) {
  diskState.storeFile('valid', fileInfo);
}

callbacks.onIgnoredFile = function(path, file) {
  try {
    fs.appendFileSync(fds.ignoredFiles, path + '/' + file + '\n');
  } catch(err) {}
}

callbacks.onCategorizeComplete = function() {
  outputStream.write('\n');
  var stats = validator.getStats();
  console.log("# valid", stats.validCounts.files);
  console.log("# valid dirs", stats.validCounts.dirs);
  console.log("# bad file lengths", stats.badCounts.long);
  console.log("# bad file chars", stats.badCounts.unprintable);
  console.log("# bad whitespace", stats.badCounts.spaces);
  console.log("# bytes", stats.bytes);
}

callbacks.onFolderComplete = function(dir, error, response, completeCallback) {
  var remoteId;
  if (response) {
    dir.remoteId = response.id;
  }
  async.series([
    function(callback) {
      if (error) {
        diskState.storeDirError(dir, error, response, callback);
      } else {
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
    completeCallback();
  });
}

callbacks.onFileComplete = function(file, error, response, completeCallback) {
  console.log("FILE COMPLETED");
  if (response) {
    file.remoteId = response.id;
  }
  async.series([
    function(callback) {
      if (error) {
        diskState.storeFileError(file, error, response, callback);
      } else {
        callback();
      }
    },
    function(callback) {
      diskState.storeFile('valid', file, callback);
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
    createBoxContent(fileState, function() {
      console.log("*** create box content fininished!!!!! ****");
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

var fileBar = new ProgressBar('  uploading [:name] [:bar] :rate/bps :percent :etas', {
  width: 10,
  clear: true,
  total: 0
});
var overallBar = new ProgressBar('  progress [:bar] :rate/bps :percent :etas', {
  width: 10,
  clear: true,
  total: 0
});

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
    validator.categorizeDirectoryContents(source, null, options, true);
    callbacks.onCategorizeComplete();
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
      fds.ignoredFiles = fs.openSync(__dirname + '/' + FILENAMES.ignoredFiles, 'w');
      DiskState.clear(callback);
    });
  } else {
    tasks.push(function(callback) {
      fds.ignoredFiles = fs.openSync(__dirname + '/' + FILENAMES.ignoredFiles, 'r');
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

function formatPathProgress(path, stream) {
  var label = "Reading ";
  var pathStart;
  var pathEnd;

  outputStream.columns;

  pathStart = path.substring(0, outputStream.columns / 3);
  pathEnd = path.substring(path.length - outputStream.columns / 3, path.length);

  return label + pathStart + '...' + pathEnd;
}

function putFoldersOnBox(dirs, doneCallback) {
  async.eachSeries(dirs, function(dir, callback) {
    diskState.recordStart('dir', dir, function() {
      uploader.makeDir(dir, callbacks.onFolderComplete, callback);
    })
  }, function() {
    doneCallback();
  });
}

function putFilesOnBox(files, doneCallback) {
  console.log("Putting files on box.");
  async.eachSeries(files, function(file, callback) {
    diskState.recordStart('file', file, function() {
      uploader.makeFile(file, callbacks.onFileComplete, callback);
    });
  }, function() {
    console.log("Done with files!");
    doneCallback();
  });
}
