'use strict';

var fs = require('fs');
var readline = require('readline');
var StickyFile = require('./file-info');

var INIT_VALID_FILES = {files: [], dirs: []};
var INIT_BADS = {files: [], dirs: [], ignores: []};

function FileState() {
  this.valid = INIT_VALID_FILES;
  this.bad = INIT_BADS;
}

FileState.prototype.getCounts = function() {
  var stats = {
    validFiles: this.valid.files.length,
    validDirs: this.valid.dirs.length,
    badFiles: this.bad.files.length,
    badDirs: this.bad.dirs.length,
    ignores: this.bad.ignores.length,
  };

  return stats;
}

FileState.prototype.loadFromBadFile = function(path, completeCallback) {
  var rd = readline.createInterface({
    input: fs.createReadStream(path, {autoClose: false})
  });
  var self = this;
  console.log("self", self);
  rd.on("line", function(string) {fileFromLine(string, self.bad.files, true)});
  rd.on("close", completeCallback);
};
FileState.prototype.loadFromBadDirs = function(path, completeCallback) {
  var rd = readline.createInterface({
    input: fs.createReadStream(path, {autoClose: false})
  });
  rd.on("line", function(string) {dirFromLine(string, self.bad.dirs, true)});
  rd.on("close", completeCallback);
};
FileState.prototype.loadFromGoodFiles = function(path, completeCallback) {
  var rd = readline.createInterface({
    input: fs.createReadStream(path, {autoClose: false})
  });
  rd.on("line", function(string) {fileFromLine(string, self.valid.files)});
  rd.on("close", completeCallback);
};
FileState.prototype.loadFromGoodDirs = function(path, completeCallback) {
  var rd = readline.createInterface({
    input: fs.createReadStream(path, {autoClose: false})
  });
  rd.on("line", function(string) {dirFromLine(string, self.valid.dirs)});
  rd.on("close", completeCallback);
};

function fileFromLine(lineStr, fileArray, stripIssues) {
  var noIssuesStr = lineStr;
  if (stripIssues) {
    noIssuesStr = stripIssuesListFromLine(lineStr);
  }
  var file = StickyFile.FromStr(noIssuesStr);
  if (file) {
    fileArray.push(file);
  }
}

function stripIssuesListFromLine(lineStr) {
  // Issues were appended to FileInfo's baseline string output.  Remove it but keep the rest.
  var newline = lineStr.split(/:::(.+)/)[1];
  return newline;
}

module.exports = FileState;
