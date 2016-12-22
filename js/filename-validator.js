// TODO: Really need to make this module more async-aware.
var fs = require('fs');
var FileState = require('./disk-state');
var StickyFile = require('./file-info');
var StickyDir = require('./dir-info');
var Path = require('path');

var FilenameValidator = exports;

var INIT_VALID_COUNTS = {dirs: 0, files: 0};
var INIT_BAD_COUNTS = {long: 0, unprintable: 0, spaces: 0, unknown: 0, ignores: 0};

var ISSUE_TOO_LONG = 'long';
var ISSUE_UNPRINTABLE = 'chars';
var ISSUE_SPACES = 'spaces';

var fileState;

// Making sure errors in code don't cause us to categorize a directory more than once.
var checkedInoNumbers = [];

var NameHas = {
  badLength: function (filename) {
    if (filename.length > 255) {
      return false;
    }
  },
  badChars: function (filename) {
    return /[^ -~]|[\/\\]/g.test(filename);
  },
  badWhitespace: function(filename) {
    return /^[\s]|[\s]$/g.test(filename);
  },
  ignored: function(name) {
    // Very specific names...
    switch (name) {
      case '.Trash':
      case '.DS_Store':
      case '.cache':
        return true;
        break;
    }

    return false;
  }
};

var stats = {
  bytes: 0,
  validCounts: INIT_VALID_COUNTS,
  badCounts: INIT_BAD_COUNTS
};

function registerBadFile(filename, path, inodeNum, issues, callback) {
  var badFile = new StickyFile({localFolderId: inodeNum, problems:issues, name: filename, path: path});
  recordIssues(issues);
  fileState.bad.files.push(badFile);
  if (callback) {
    callback(badFile);
  }
}

function registerDir(type, dirname, path, dirId, parentId, issues, callback) {
  if (checkedInoNumbers.indexOf(dirId) >= 0) {
    throw new Error("registerDir(" + type + ")::: Sanity check failure; inodeNum already checked. Num: " + dirId + " Path:" + path + "/" + dirname);
  } else {
    checkedInoNumbers.push(dirId);
  }

  var dir = new StickyDir({parent: parentId, inode: dirId, problems:issues, name: dirname, path: path});
  var list;
  switch(type) {
    case 'bad':
      recordIssues(issues);
      list = fileState.bad.dirs;
      break;
    case 'good':
      stats.validCounts.dirs += 1;
      list = fileState.valid.dirs;
      break;
    default:
      throw new Error("registerDir()::: Bad type: " + type);
  }

  list.push(dir);

  if (callback) {
    callback(dir);
  }
}

function registerBadDir(dirname, path, dirId, parentId, issues, callback) {
  registerDir('bad', dirname, path, dirId, parentId, issues, callback);
}

function registerGoodFile(filename, path, folderId, issues, callback) {
  var file = new StickyFile({localFolderId: folderId, problems:issues, name: filename, path: path});
  stats.validCounts.files += 1;
  fileState.valid.files.push(file);
  if (callback) {
    callback(file);
  }
}

function registerGoodDir(dirname, path, dirId, parentId, issues, callback) {
  registerDir('good', dirname, path, dirId, parentId, issues, callback);
}

function recordIssues(issues) {
  issues.forEach(recordIssue);
}

function recordIssue(issue) {
  switch(issue) {
    case ISSUE_SPACES:
      stats.badCounts.spaces += 1;
      break;
    case ISSUE_TOO_LONG:
      stats.badCounts.long += 1;
      break;
    case ISSUE_UNPRINTABLE:
      stats.badCounts.unprintable += 1;
      break;
  }
}

function processDirectoryEntry(fileName, dirId, parentId, dirPathStr, options) {
  var invalid = false;
  var problems = [];
  var fullPath = dirPathStr + '/' + fileName;
  var stat = fs.lstatSync(fullPath);
  var currentId = stat.ino;

  if (stat.isSymbolicLink() || NameHas.ignored(fileName)) {
    if (options.onIgnoredFile) {
      stats.badCounts.ignores += 1;
      options.onIgnoredFile(dirPathStr, fileName);
    }
    return;
  }

  var checkedPaths = [];
  if (checkedPaths.indexOf(fullPath) >= 0) {
    throw new Error("Sanity check: path already checked! " + fullPath);
  } else {
    checkedPaths.push(fullPath);
  }

  if (stat.isDirectory()) {
    FilenameValidator.categorizeDirectoryContents(fullPath, currentId, options);
  }
  stats.bytes += stat.size;

  if (NameHas.badLength(fileName)) {
    invalid = true;
    problems.push(ISSUE_TOO_LONG);
  }
  if (NameHas.badChars(fileName)) {
    invalid = true;
    problems.push(ISSUE_UNPRINTABLE);
  }
  if (NameHas.badWhitespace(fileName)) {
    invalid = true;
    problems.push(ISSUE_SPACES);
  }

  if (invalid) {
    if (stat.isFile()) {
      registerBadFile(fileName, dirPathStr, dirId, problems, options.onBadFile);
    } else if (stat.isDirectory()) {
      registerBadDir(fileName, dirPathStr, currentId, parentId, problems, options.onBadDir);
    }
    return;
  }

  if (stat.isFile()) {
    fileState.valid.files.push({path: dirPathStr, file: fileName});
    registerGoodFile(fileName, dirPathStr, dirId, problems, options.onValidFile);
  } else if(stat.isDirectory()) {
    fileState.valid.dirs.push({path: dirPathStr, file: fileName});
    registerGoodDir(fileName, dirPathStr, currentId, parentId, problems, options.onValidDir);
  }
}

FilenameValidator.init = function() {
  fileState = new FileState();
  stats.bytes = 0;
  stats.validCounts = INIT_VALID_COUNTS;
  stats.badCounts = INIT_BAD_COUNTS;
};

FilenameValidator.getStats = function() {
  return stats;
};

FilenameValidator.getFiles = function() {
  return fileState.valid;
};
FilenameValidator.getBadFiles = function() {
  return fileState.bad;
};

var usedInoNumes = [];

FilenameValidator.categorizeDirectoryContents = function (path, parentId, options, shouldInit) {
  var absPath = Path.resolve(path);
  var fileNames = fs.readdirSync(absPath);
  var dirId = fs.lstatSync(absPath).ino;
  if (usedInoNumes.indexOf(dirId) >= 0) {
    throw new Error("wtf?  info taken already:" + dirId + " for " + absPath);
  } else {
    usedInoNumes.push(dirId);
  }
  var parentId = parentId ? parentId : 'noparent';
  if (shouldInit === true) {
    this.init();
  }

  if (options.onDirectoryStart) {
    options.onDirectoryStart(absPath);
  }

  fileNames.forEach(function(fileName) {
    processDirectoryEntry(fileName, dirId, parentId, absPath, options);
  });
};

