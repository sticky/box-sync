#!/usr/bin/env node
'use strict';
var fs = require('fs');
var program = require('commander');
var ProgressBar = require('progress');
var async = require("async");

var BoxSDK = require('box-node-sdk');
var clientID = require('./files/tokens.env').clientID;
var developerToken = require('./files/tokens.env').developerToken;
var clientSecret = require('./files/tokens.env').clientSecret;
var StickyFileInfo = require('./js/file-info');
var StickyDirInfo = require('./js/dir-info');
var FileState = require('./js/disk-state');

var Db = require('./js/files-db');

var validator = require('./js/filename-validator');

var remoteRootId = -1;

var FILENAMES = {
  ignoredFiles: 'files/Ignored.txt',
};

var outputStream = process.stdout;
var lastStrRendered = '';
var callbacks = {};
var fileState = new FileState();
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
  fileState.storeDir('bad', dirInfo);
}

callbacks.onBadFile = function (fileInfo) {
  fileState.storeFile('bad', fileInfo);
}
callbacks.onValidDir = function (dirInfo) {
  fileState.storeDir('valid', dirInfo);
}

callbacks.onValidFile = function (fileInfo) {
  fileState.storeFile('valid', fileInfo);
}

callbacks.onIgnoredFile = function(path, file) {
  try {
    fs.appendFileSync(fds.ignoredFiles, path + '/' + file + '\n');
  } catch(err) {

  }
}

callbacks.onPreFileComplete = function(error, response) {
  if (error) {
    console.log("error status code:", error.statusCode);
    console.log("error message:", error.message);
  }
  if (response) {
    console.log(response);
  }
}

callbacks.onFolderComplete = function(folder, error, response) {
  var remoteId;
  if (error) {
    console.log("error status code:", error.statusCode);
    console.log("error message:", error.message);
  }
  if (response) {
    console.log("response id", response.id);
    folder.remoteId = response.id;
  }
}

callbacks.onDoneLoadingFromDisk = function(fileState) {
  console.log("done loading!!!", fileState.getCounts());
  fileState.getIncompleteDirs(function(dirs) {
    console.log("incompletes", dirs);
    if (dirs === false)  {
      console.log("No progress recorded.");
      // Fake the root directory as a starting point.
      dirs = [new StickyDirInfo({inode: 'noparent', parent: 'noparent'})];
    }
    async.each(dirs, uploadDirectory);
  });
};

function uploadDirectory(dir, onDone) {
  console.log("uploadDirectory; dirName: ", dir.name);
  var realDir = dir.localId !== 'noparent';
  if (realDir) {
    fileState.recordStart(dir);
  }
  async.series([
    function(callback) {
      fileState.getFilesInDir(dir, function(files) {
        putFilesOnBox(files, callback);
      });
    },
    function(callback) {
      fileState.getDirsInDir(dir, function(dirs) {
        console.log("looking for dirs in:", dir);
        putFoldersOnBox(dirs, callback);
      });
    },
  ], function() {
    console.log("DIRECTORY FINISHED:", dir.name);
    console.log("real dir?", realDir);
    if (realDir) {
      fileState.recordCompletion(dir);
    }
    onDone();
  });
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
    remoteRootId = dest;

    initializeFds(freshStart, onFdInitalized.bind(this, source, freshStart));
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

  if (freshStart) {
    validator.categorizeDirectoryContents(source, null, options, true);
  } else {
    loadPreviousState(callbacks.onDoneLoadingFromDisk);
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

function initializeFds(fresh, callback) {
  if (fresh === true) {
    console.log("treating as fresh start (purging existing state)");
    FileState.clear(callback);
    fds.processedFiles = fs.openSync(__dirname + '/' + FILENAMES.processedFiles, 'w');
    fds.ignoredFiles = fs.openSync(__dirname + '/' + FILENAMES.ignoredFiles, 'w');
  } else {
    console.log("opening with old");
    fds.processedFiles = fs.openSync(__dirname + '/' + FILENAMES.processedFiles, 'a');
    fds.ignoredFiles = fs.openSync(__dirname + '/' + FILENAMES.ignoredFiles, 'r');
    if (callback) {
      callback();
    }
  }
}

function loadPreviousState(doneCallback) {
  console.log("loading previous");
  var filesProcessing = 0;

  filesProcessing += 1;
  fileState.loadFiles("bad", function() {
    filesProcessing -= 1;
    console.log("Done with bads files.", filesProcessing);
    if (filesProcessing <= 0 && doneCallback) {
      doneCallback(fileState);
    }
  });
  filesProcessing += 1;
  fileState.loadDirs("bad", function() {
    filesProcessing -= 1;
    console.log("Done with bads dirs.", filesProcessing);
    if (filesProcessing <= 0 && doneCallback) {
      doneCallback(fileState);
    }
  });
  filesProcessing += 1;
  fileState.loadDirs("valid", function() {
    filesProcessing -= 1;
    console.log("Done with good dirs.", filesProcessing);
    if (filesProcessing <= 0 && doneCallback) {
      doneCallback(fileState);
    }
  });
  filesProcessing += 1;
  fileState.loadFiles("valid", function() {
    filesProcessing -= 1;
    console.log("Done with good files.", filesProcessing);
    if (filesProcessing <= 0 && doneCallback) {
      doneCallback(fileState);
    }
  });
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

function putFoldersOnBox(dirs, doneCallback) {
  console.log("************* dirs *************", dirs);
  async.eachSeries(dirs, function(dir, callback) {
    fileState.recordStart(dir, function() {
      putFolderOnBox(dir, callback);
    })
  }, function(err) {
    doneCallback();
  });
}

function putFilesOnBox(files, doneCallback) {
  console.error("Don't have file putting implemented yet.");
  if (doneCallback) {
    doneCallback();
  }
}

function putFolderOnBox(dir, doneCallback) {
  // We have a directory, but now we need to figure out the Box.com ID we
  // need to make a folder in.

  if (dir.issues.length !== 0) {
    console.log("BAD DIR, SHOULD NOT SYNC");
    doneCallback();
    return;
  }
  var info = {remoteId: 0, dirId: dir.parentId};
  async.series([
    function(callback) {
      findDirParentRemote(info, callback);
    },
    function(callback) {
      console.log("Starting to sync:", dir);
      console.log("Target Remote Id", info.remoteId);
      console.log("New folder Name", dir.name);
      client.folders.create(info.remoteId, dir.name, function(err, response) {
        callbacks.onFolderComplete(dir, err, response);
        fileState.storeDir('valid', dir, callback);
      });
    },
  ], function() {
      console.log("DONE WITH BOX.COM FOR A DIR");
      doneCallback()
    });
}

function findDirParentRemote(searchInfo, callback) {
  // Are we at the bottom level of our folder tree?
  console.log("search info", searchInfo);
  if (!searchInfo.dirId || searchInfo.dirId === 'noparent') {
    searchInfo.remoteId = remoteRootId;
    callback();
  } else {
    // Guess we need to find our parent.
    fileState.getRemoteDirId(searchInfo, callback);
  }
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

  var folderId = remoteRootId;
  fileBar.total = fileSize;
  fileBar.tick(0);

  //client.files.preflightUploadFile('' + folderId, {name: name, size: 10000}, null, onPreFileComplete);
  client.files.uploadFile('' + folderId, name, stream, callbacks.onPreFileComplete);

  stream.on('data', function(chunk) {
    fileBar.tick(chunk.length);
  });
}
