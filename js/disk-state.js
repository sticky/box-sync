'use strict';

var fs = require('fs');
var readline = require('readline');
var StickyFile = require('./file-info');
var StickyDir = require('./dir-info');
var FileDb = require('./files-db');

var INIT_VALID_FILES = {files: [], dirs: []};
var INIT_BADS = {files: [], dirs: [], ignores: []};

function dbRowToFile(row) {
  var fileOpts = {
    localFolderId: row.Folder_Id,
    path: row.Full_Path,
    name: row.Name,
    problems: getRowIssues(row)
  };
  var newFile = new StickyFile(fileOpts);

  switch(row.Class) {
    case 1:
      this.bad.files.push(newFile);
      break;
    case 2:
      this.valid.files.push(newFile);
      break;
  }
}

function dbRowToDir(row) {
  var fileOpts = {
    inode: row.Sys_Id_Num,
    parent: row.Parent_Id,
    remote: row.Remote_Id,
    path: row.Full_Path,
    name: row.Name,
    problems: getRowIssues(row)
  };
  var newDir = new StickyDir(fileOpts);

  switch(row.Class) {
    case 1:
      this.bad.dirs.push(newDir);
      break;
    case 2:
      this.valid.dirs.push(newDir);
      break;
  }
}

function getRowIssues(row) {
  var issueArr = [];
  if (row.Long) {
    issueArr.push('long');
  }
  if (row.Chars) {
    issueArr.push('chars');
  }
  if (row.Spaces) {
    issueArr.push('spaces');
  }
  return issueArr;
}

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

DiskState.prototype.storeDir = function(classification, dirInfo, doneCallback) {
  FileDb.store('dir', classification, dirInfo, doneCallback);
};

DiskState.prototype.storeFile = function(classification, fileInfo, doneCallback) {
  FileDb.store('file', classification, fileInfo, doneCallback);
};

DiskState.prototype.loadDirs = function(classification, completeCallback) {
  var self = this;
  FileDb.loadAll('dir', classification, function(rows) {
    rows.forEach(dbRowToDir.bind(self));
    completeCallback();
  });
};

DiskState.prototype.loadFiles = function(classification, completeCallback) {
  var self = this;
  FileDb.loadAll('file', classification, function(rows) {
    rows.forEach(dbRowToFile.bind(self));
    completeCallback();
  });
};

DiskState.prototype.getRemoteId = function(folderId) {
  console.error("getRemoteId unimplemented");
  return 0;
}

module.exports = DiskState;
