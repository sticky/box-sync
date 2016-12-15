var fs = require('fs');
var StickyFile = require('./file-info');
var StickyDir = require('./dir-info');

var FilenameValidator = exports;

var INIT_FILES = {files: [], dirs: []};
var INIT_BADS = {files: [], dirs: [], ignores: []};
var INIT_VALID_COUNTS = {dirs: 0, files: 0};
var INIT_BAD_COUNTS = {long: 0, unprintable: 0, spaces: 0, unknown: 0, ignores: 0};

var ISSUE_TOO_LONG = 'long';
var ISSUE_UNPRINTABLE = 'chars';
var ISSUE_SPACES = 'spaces';

var stats = {
  bytes: 0,
  validCounts: INIT_VALID_COUNTS,
  badCounts: INIT_BAD_COUNTS
};
var valid = INIT_FILES;
var bad = INIT_BADS;

function registerBadFile(filename, path, inodeNum, issues, callback) {
  var badFile = new StickyFile({localFolderId: inodeNum, problems:issues, name: filename, path: path});
  recordIssues(issues);
  bad.files.push(badFile);
  if (callback) {
    callback(badFile);
  }
}

var checkedInoNumbers = [];
function registerBadDir(dirname, path, parentId, inodeNum, issues, callback) {
  if (checkedInoNumbers.indexOf(inodeNum) >= 0) {
    throw new Error("registerBadDir()::: Sanity check failure; inodeNum already checked. Num: " + inodeNum + " Path:" + path + "/" + dirname);
  } else {
    checkedInoNumbers.push(inodeNum);
  }

  var badDir = new StickyDir({parent: parentId, inode: inodeNum, problems:issues, name: dirname, path: path});
  recordIssues(issues);
  bad.dirs.push(badDir);
  if (callback) {
    callback(badDir);
  }
}

function registerGoodFile(filename, path, inodeNum, issues, callback) {
  var file = new StickyFile({localFolderId: inodeNum, problems:issues, name: filename, path: path});
  stats.validCounts.files += 1;
  valid.files.push(file);
  if (callback) {
    callback(file);
  }
}

function registerGoodDir(dirname, path, parentId, inodeNum, issues, callback) {
  if (checkedInoNumbers.indexOf(inodeNum) >= 0) {
    throw new Error("registerGoodDir()::: Sanity check failure; inodeNum already checked. Num: " + inodeNum + " Path:" + path + "/" + dirname);
  } else {
    checkedInoNumbers.push(inodeNum);
  }

  var dir = new StickyDir({parent: parentId, inode: inodeNum, problems:issues, name: dirname, path: path});
  stats.validCounts.dirs += 1;
  valid.dirs.push(dir);

  if (callback) {
    callback(dir);
  }
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

function isTooLong(filename) {
  if (filename.length > 255) {
    return false;
  }
}

function isInvalidChars(filename) {
  return /[^ -~]|[\/\\]/g.test(filename);
}

function badWhitespace(filename) {
  return /^[\s]|[\s]$/g.test(filename);
}

function ignorableName(name) {
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

FilenameValidator.init = function() {
  valid = INIT_FILES;
  bad = INIT_BADS;
  stats.bytes = 0;
  stats.validCounts = INIT_VALID_COUNTS;
  stats.badCounts = INIT_BAD_COUNTS;
};

FilenameValidator.getStats = function() {
  return stats;
};

FilenameValidator.getFiles = function() {
  return valid;
};
FilenameValidator.getBadFiles = function() {
  return bad;
};

var usedInoNumes = [];

FilenameValidator.categorizeDirectoryContents = function (path, parentId, options, shouldInit) {
  var fileNames = fs.readdirSync(path);
  var thisDirIno = fs.lstatSync(path).ino;
  if (usedInoNumes.indexOf(thisDirIno) >= 0) {
    throw new Error("wtf?  info taken already:" + thisDirIno + " for " + path);
  } else {
    usedInoNumes.push(thisDirIno);
  }
  var parentId = parentId ? parentId : 'noparent';
  var self = this;
  if (shouldInit === true) {
    this.init();
  }

  if (options.onDirectoryStart) {
    options.onDirectoryStart(path);
  }

  fileNames.forEach(function(file) {
    var invalid = false;
    var problems = [];
    var fullPath = path + '/' + file;
    var stat = fs.lstatSync(fullPath);
    var currentIno = stat.ino;

    if (stat.isSymbolicLink() || ignorableName(file)) {
      if (options.onIgnoredFile) {
        stats.badCounts.ignores += 1;
        options.onIgnoredFile(path, file);
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
      self.categorizeDirectoryContents(fullPath, thisDirIno, options);
    }
    stats.bytes += stat.size;

    if (isTooLong(file)) {
      invalid = true;
      problems.push(ISSUE_TOO_LONG);
    }
    if (isInvalidChars(file)) {
      invalid = true;
      problems.push(ISSUE_UNPRINTABLE);
    }
    if (badWhitespace(file)) {
      invalid = true;
      problems.push(ISSUE_SPACES);
    }

    if (invalid) {
      if (stat.isFile()) {
        registerBadFile(file, path, thisDirIno, problems, options.onBadFile);
      } else if (stat.isDirectory()) {
        registerBadDir(file, path, parentId, thisDirIno, problems, options.onBadDir);
      }
      return;
    }

    if (stat.isFile()) {
      valid.files.push({path: path, file: file});
      registerGoodFile(file, path, currentIno, problems, options.onValidFile);
    } else if(stat.isDirectory()) {
      valid.dirs.push({path: path, file: file});
      registerGoodDir(file, path, thisDirIno, currentIno, problems, options.onValidDir);
    }
  });
};
