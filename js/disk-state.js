'use strict';

var fs = require('fs');
var readline = require('readline');
var StickyFile = require('./file-info');
var StickyDir = require('./dir-info');
var FileDb = require('./files-db');

var INIT_VALID_FILES = {files: [], dirs: []};
var INIT_BADS = {files: [], dirs: [], ignores: []};

function DiskState() {
  this.valid = INIT_VALID_FILES;
  this.bad = INIT_BADS;
}

DiskState.prototype.getCounts = function() {
  var stats = {
    validFiles: this.valid.files.length,
    validDirs: this.valid.dirs.length,
    badFiles: this.bad.files.length,
    badDirs: this.bad.dirs.length,
    ignores: this.bad.ignores.length,
  };

  return stats;
};

DiskState.clear = function(callback) {
  FileDb.startOver(callback);
};

DiskState.prototype.storeDir = function(classification, dirInfo) {
  FileDb.store('dir', classification, dirInfo);
};

DiskState.prototype.storeFile = function(classification, fileInfo) {
  FileDb.store('file', classification, fileInfo);
};


DiskState.prototype.loadFilesFromDisk = function(classification, path, completeCallback) {
  var self = this;
  var line = -1;
  var fileArray = classification === 'bad' ? self.bad.files : self.valid.files;
  var shouldStripIssues = classification === 'bad' ? true : false;
  var rd = readline.createInterface({
    input: fs.createReadStream(path, {autoClose: false})
  });
  rd.on("line", function(string) {
    fileFromLine(string, fileArray, shouldStripIssues)
  });
  rd.on("close", completeCallback);
};

DiskState.prototype.loadDirsFromDisk = function(classification, path, completeCallback) {
  console.log("Trying to load...", path);
  var self = this;
  var line = -1;
  var fileArray = classification === 'bad' ? self.bad.dirs : self.valid.dirs;
  var shouldStripIssues = classification === 'bad' ? true : false;
  var rd = readline.createInterface({
    input: fs.createReadStream(path, {autoClose: false})
  });
  rd.on("line", function(string) {
    line += 1;
    dirFromLine(string, fileArray, shouldStripIssues, line)
  });
  rd.on("close", completeCallback);
};

function fileFromLine(lineStr, fileArray, stripIssues, line) {
  var noIssuesStr = lineStr;
  if (stripIssues) {
    noIssuesStr = stripIssuesListFromLine(lineStr);
  }
  var file = StickyFile.FromStr(noIssuesStr);
  if (file) {
    file.line = line;
    fileArray.push(file);
  }
}

function dirFromLine(lineStr, dirArray, stripIssues, line) {
  var noIssuesStr = lineStr;
  if (stripIssues) {
    noIssuesStr = stripIssuesListFromLine(lineStr);
  }

  var dir = StickyDir.FromStr(noIssuesStr);
  if (dir) {
    dir.line = line;
    dirArray.push(dir);
  }
}

function stripIssuesListFromLine(lineStr) {
  // Issues were appended to FileInfo's baseline string output.  Remove it but keep the rest.
  var newline = lineStr.split(/:::(.+)/)[1];
  return newline;
}

module.exports = DiskState;
