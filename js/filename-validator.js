var fs = require('fs');

var FilenameValidator = exports;

var INIT_FILES = [];
var INIT_BADS = [];
var INIT_COUNTS = {long: 0, unprintable: 0, spaces: 0};

var ISSUE_TOO_LONG = 'long';
var ISSUE_UNPRINTABLE = 'chars';
var ISSUE_SPACES = 'spaces';

var stats = {
  bytes: 0,
  validCount: 0,
  badCounts: INIT_COUNTS
};
var fileFd;
var validFiles = INIT_FILES;
var badFiles = INIT_BADS;

function registerTooLong(fullPath) {
  badFiles.tooLong.push(fullPath);
  fs.appendFileSync(fileFd, '' + fullPath);
}

function registerBadChar(fullPath) {
  badFiles.badChars.push(fullPath);
  fs.appendFileSync(fileFd, '' + fullPath);
}

function registerBadFile(fullPath, issues) {
  var badFile = {problems:issues, path: fullPath};
  recordIssues(issues);
  badFiles.push(badFile);
  fs.appendFileSync(fileFd, badFileToString(badFile));
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

function badFileToString(badFile) {
  var issueStr = badFile.problems.reduce(function(str, current) {
    return str + current + ';';
  }, '');

  return issueStr + ':::' + badFile.path + '\n';
}

function isTooLong(filename) {
  if (filename.length > 255) {
    return false;
  }
}

function isInvalidChars(filename) {
  /* Names that will not be supported are those that contain non-printable ascii, / or \, names with
   leading or trailing spaces, and the special names “.” and “..”. */
  return /[^ -~]|[\/\\]/g.test(filename);
}

function badWhitespace(filename) {
  return /^[\s]|[\s]$/g.test(filename);
}

FilenameValidator.init = function() {
  fileFd = undefined;
  validFiles = INIT_FILES;
  badFiles = INIT_BADS;
  stats.bytes = 0;
  stats.validCount = 0;
  stats.badCounts = INIT_COUNTS;
};

FilenameValidator.getStats = function() {
  return stats;
};

FilenameValidator.getFiles = function() {
  return validFiles;
};
FilenameValidator.getBadFiles = function() {
  return badFiles;
};

FilenameValidator.categorizeDirectoryContents = function (path, options, shouldInit) {
  var fileNames = fs.readdirSync(path);
  var self = this;
  if (shouldInit === true) {
    this.init();
  }

  if (options.fd) {
    fileFd = options.fd;
  }

  if (options.onDirectoryStart) {
    options.onDirectoryStart(path);
  }

  fileNames.forEach(function(file) {
    var invalid = false;
    var problems = [];
    var fullPath = path + '/' + file;
    var stat = fs.lstatSync(fullPath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      self.categorizeDirectoryContents(fullPath, options);
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

    if (!invalid && !stat.isDirectory() && !stat.isSymbolicLink()) {
      validFiles.push({path: path, file: file});
      stats.validCount += 1;
      return;
    }

    registerBadFile(fullPath, problems);
  });
};
