#!/usr/bin/env node
'use strict';
var fs = require('fs');
var program = require('commander');
var ProgressBar = require('progress');
var BoxSDK = require('box-node-sdk');
var clientID = require('./files/tokens.env').clientID;
var developerToken = require('./files/tokens.env').developerToken;
var clientSecret = require('./files/tokens.env').clientSecret;
var StickyFileInfo = require('./js/file-info');
var StickyDirInfo = require('./js/dir-info');
var FileState = require('./js/file-state');

var validator = require('./js/filename-validator');

var FILENAMES = {
  badFiles: 'files/BadFiles.txt',
  badDirs: 'files/BadDirs.txt',
  validFiles: 'files/GoodFiles.txt',
  validDirs: 'files/GoodDirs.txt',
  processedFiles: 'files/ProcessedFiles.txt',
  ignoredFiles: 'files/Ignored.txt',
};

var outputStream = process.stdout;
var lastStrRendered = '';
var callbacks = {};
var fileState;
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
  try {
    fs.appendFileSync(fds.badDirs, badDirToString(dirInfo));
  } catch(err) {
    console.error("Failed to append to bad dir file.  File descriptor: %s errorcode: %", fds.badDirs, err.code);
  }
}

callbacks.onBadFile = function (fileInfo) {
  try {
    fs.appendFileSync(fds.badFiles, badFileToString(fileInfo));
  } catch(err) {
    console.error("Failed to append to bad file.  File descriptor: %s errorcode: %", fds.badFiles, err.code);
  }
}
callbacks.onValidDir = function (fileInfo) {
  try {
    fs.appendFileSync(fds.validDirs, validFileToString(fileInfo));
  } catch(err) {
    console.error("Failed to append to valid dir file.  File descriptor: %s errorcode: %", fds.validDirs, err.code);
  }
}

callbacks.onValidFile = function (fileInfo) {
  try {
    fs.appendFileSync(fds.validFiles, validDirToString(fileInfo));
  } catch(err) {
    console.error("Failed to append to valid file list.  File descriptor: %s errorcode: %s", fds.validFiles, err.code);
  }
}

callbacks.onIgnoredFile = function(path, file) {
  try {
    fs.appendFileSync(fds.ignoredFiles, path + '/' + file + '\n');
  } catch(err) {

  }
}

var sdk = new BoxSDK({
  clientID: clientID,
  clientSecret: clientSecret
});

// Create a basic API client
var client = sdk.getBasicClient(developerToken);

// File descriptors
var fds = {badFiles: null, badDirs: null, validFiles: null, processedFiles: null, validDirs: null, processedDirs: null, ignoredFiles: null};

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
  //.option('-d, --directories', 'Only process directories.(unimplmeneted) '),
  //.option('-f, --files', 'Only process files (unimplmeneted)')
  .action(function(source, dest) {
    var freshStart = program.assumeNew ? true : false;
    // A simplisitc check; do any of our files already have content?
    var key;
    var emptyFiles = false;
    for(key in FILENAMES) {
      if (freshStart) {break;}
      if (FILENAMES.hasOwnProperty(key)) {
        // All files must be empty.
        emptyFiles = emptyFiles && !hasContent(FILENAMES[key]);
      }
    }

    initializeFds(freshStart);

    var options = {
      onBadFile: callbacks.onBadFile,
      onBadDir: callbacks.onBadDirectory,
      onDirectoryStart: callbacks.onDirectoryStarted,
      onValidDir: callbacks.onValidDir,
      onValidFile: callbacks.onValidFile,
      onIgnoredFile: callbacks.onIgnoredFile
    };

    if (freshStart) {
      validator.categorizeDirectoryContents(source, null, options, true);
    } else {
      loadPreviousState();
    }

    if (!program.onlyValidate) {
      createDirectoryTree(validator.getDirs());
      uploadFiles(validator.getFiles());
    }

    outputStream.write('\n');
    var stats = validator.getStats();
    console.log("# valid", stats.validCounts.files);
    console.log("# valid dirs", stats.validCounts.dirs);
    console.log("# bad file lengths", stats.badCounts.long);
    console.log("# bad file chars", stats.badCounts.unprintable);
    console.log("# bad whitespace", stats.badCounts.spaces);
    console.log("# bytes", stats.bytes);

    for (var fdType in fds) {
      if (fds.hasOwnProperty(fdType)) {
        if (fds[fdType]) {
          fs.closeSync(fds[fdType]);
        }
      }
    }
  })
  .parse(process.argv);

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

function initializeFds(fresh) {
  if (fresh === true) {
    console.log("opening with new");
    fds.badFiles = fs.openSync(__dirname + '/' + FILENAMES.badFiles, 'w');
    fds.badDirs = fs.openSync(__dirname + '/' + FILENAMES.badDirs, 'w');
    fds.validFiles = fs.openSync(__dirname + '/' + FILENAMES.validFiles, 'w');
    fds.validDirs = fs.openSync(__dirname + '/' + FILENAMES.validDirs, 'w');
    fds.processedFiles = fs.openSync(__dirname + '/' + FILENAMES.processedFiles, 'w');
    fds.ignoredFiles = fs.openSync(__dirname + '/' + FILENAMES.ignoredFiles, 'w');
  } else {
    console.log("opening with old");
    fds.badFiles = fs.openSync(__dirname + '/' + FILENAMES.badFiles, 'r');
    fds.badDirs = fs.openSync(__dirname + '/' + FILENAMES.badDirs, 'w+');
    fds.validFiles = fs.openSync(__dirname + '/' + FILENAMES.validFiles, 'r');
    fds.validDirs = fs.openSync(__dirname + '/' + FILENAMES.validDirs, 'w+');
    fds.processedFiles = fs.openSync(__dirname + '/' + FILENAMES.processedFiles, 'w+');
    fds.ignoredFiles = fs.openSync(__dirname + '/' + FILENAMES.ignoredFiles, 'r');
  }
}

function loadPreviousState() {
  var filesProcessing = 0;
  fileState = new FileState();

  // It'd be kinda cool if we could use file descriptors but for some reason it wasn't working...

  filesProcessing += 1;
  fileState.loadFromBadFile(__dirname + '/' + FILENAMES.badFiles, function() {
    filesProcessing -= 1;
    console.log("Done with bads files.");
    if (filesProcessing <= 0) {
      onDoneLoadingFiles(fileState);
    }
  });
  filesProcessing += 1;
  fileState.loadFromBadDirs(__dirname + '/' + FILENAMES.badDirs, function() {
    filesProcessing -= 1;
    console.log("Done with bads dirs.");
    if (filesProcessing <= 0) {
      onDoneLoadingFiles(fileState);
    }
  });
}

function onDoneLoadingFiles(fileState) {
  console.log("done!!!", fileState.getCounts());
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

function uploadFiles(uploadFileList) {
  console.error("uploadFiles:: This needs to be updated.");
  return;
  uploadFileList.forEach(uploadFile);
}

function makeFoldersOnBox(folders) {

}

function makeFolderOnBox(folder) {
  console.log("folder", folder);
}

function uploadFile(fileInfo) {
  console.error("uploadFile:: This needs to be updated.");
  return;
  var name = fileInfo.file;
  var path = fileInfo.path;
  var fullPath = path + '/' + name;
  var stream = fs.createReadStream(fullPath);
  var filestat = fs.statSync(fullPath);
  var fileSize = filestat.size;

  var folderId = 14324972774;
  fileBar.total = fileSize;
  fileBar.tick(0);

  //client.files.preflightUploadFile('' + folderId, {name: name, size: 10000}, null, onPreFileComplete);
  client.files.uploadFile('' + folderId, name, stream, onPreFileComplete);

  stream.on('data', function(chunk) {
    fileBar.tick(chunk.length);
  });
}

function onPreFileComplete(error, response) {
  if (error) {
    console.log("error status code:", error.statusCode);
    console.log("error message:", error.message);
    //console.log("error response:", error.response);
  }
  if (response) {
    console.log(response);
  }
}






