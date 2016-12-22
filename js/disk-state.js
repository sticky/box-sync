'use strict';

var fs = require('fs');
var readline = require('readline');
var StickyFile = require('./file-info');
var StickyDir = require('./dir-info');
var FileDb = require('./files-db');

var INIT_VALID_FILES = {files: [], dirs: []};
var INIT_BADS = {files: [], dirs: [], ignores: []};

// Will be a dictonary of local ID numbers keying to remote ID number values.
var folderIdMap = {};

var dirCache = {id: 0, dir: new StickyDir({})};
var fileCache = {id: 0, dir: new StickyFile({})};

// Try to uniquely ID a file.
function fileHash(file) {
  return '' + file.name + file.localFolderId;
}

function dbRowToFile(row, shouldCache) {
  var fileOpts = {
    localFolderId: row.Folder_Id,
    path: row.Full_Path,
    name: row.Name,
    problems: getRowIssues(row)
  };
  var newFile = new StickyFile(fileOpts);

  if (shouldCache) {
    fileCache[fileHash(newFile)] = newFile;
  }

  return newFile;
}

function dbRowToDir(row, shouldCache) {
  var fileOpts = {
    inode: row.Sys_Id_Num,
    parent: row.Parent_Id,
    remote: row.Remote_Id,
    path: row.Full_Path,
    name: row.Name,
    problems: getRowIssues(row)
  };
  var newDir = new StickyDir(fileOpts);

  if (shouldCache) {
    dirCache[newDir.inode] = newDir;
  }

  return newDir;
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

function dbProgressToDir(row, callback) {
  callback(dbRowToDir);
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

DiskState.clearProgress = function(callback) {
  FileDb.purgeProgress(callback);
};

DiskState.prototype.storeDir = function(classification, dirInfo, doneCallback) {
  FileDb.store('dir', classification, dirInfo, doneCallback);
};

DiskState.prototype.storeFile = function(classification, fileInfo, doneCallback) {
  FileDb.store('file', classification, fileInfo, doneCallback);
};

DiskState.prototype.storeDirError = function(dir, err, response, callback) {
  FileDb.storeDirError(dir.localId, err.statusCode, err.message, callback);
};

DiskState.prototype.storeFileError = function(file, err, response, callback) {
  if (!err.statusCode || !err.message) {
    throw new Error("Unrecognized error format, can't store" + err);
  }
  FileDb.storeFileError(file.localFolderId, file.name, err.statusCode, err.message, callback);
};

DiskState.prototype.loadDirs = function(classification, completeCallback) {
  var self = this;
  FileDb.loadAll('dir', classification, function(rows) {
    rows.forEach(function(row) {
      var dir = dbRowToDir(row);
      switch(row.Class) {
        case 1:
          self.bad.dirs.push(dir);
          break;
        case 2:
          self.valid.dirs.push(dir);
          break;
      }
    });
    completeCallback();
  });
};

DiskState.prototype.getIncompleteDirs = function(completeCallback) {
  var self = this;
  FileDb.loadSingleDirProgress(function(row) {
    var dir;
    if (row === false) {
      completeCallback(false);
      return;
    } else if(!row) {
      // Undefined or null?  Probably nothing unfinished on the list.
      completeCallback();
      return;
    }
    dir = [dbRowToDir(row)];
    completeCallback(dir);
  });
};

DiskState.prototype.loadFiles = function(classification, completeCallback) {
  var self = this;
  FileDb.loadAll('file', classification, function(rows) {
    rows.forEach(function(row) {
      var file = dbRowToFile.bind(self);

      switch(row.Class) {
        case 1:
          self.bad.files.push(file);
          break;
        case 2:
          self.valid.files.push(file);
          break;
      }
    });
    completeCallback();
  });
};

DiskState.prototype.addRemoteId = function(localDirId, remoteId) {
  folderIdMap[localDirId] = remoteId;
}
DiskState.prototype.getRemoteDirId = function(searchInfo, onDoneCallback) {
  console.log("search info to get remote id", searchInfo);
  // Hopefully this has been requested before so we can avoid slower DB hits.
  if (folderIdMap[searchInfo.dirId]) {
    searchInfo.remoteId = folderIdMap[searchInfo.dirId];
    console.log("already had remote id", searchInfo.remoteId);
    onDoneCallback();
  } else {
    FileDb.loadRemoteIdForDir(searchInfo.dirId, function(folderId) {
      console.log("Found folder id :", folderId);
      folderIdMap[searchInfo.dirId] = folderId;
      searchInfo.remoteId = folderId;
      onDoneCallback();
    });
  }
}

DiskState.prototype.getDirsInDir = function(dir, callback) {
  var self = this;
  FileDb.loadDirsFrom(dir.localId, function(rows) {
    var dirs = [];

    rows.forEach(function(row) {
      dirs.push(dbRowToDir(row));
    });
    callback(dirs);
  });
};

DiskState.prototype.getFilesInDir = function(dir, callback) {
  var self = this;
  FileDb.loadFilesFrom(dir.localId, function(rows) {
    var files = [];

    rows.forEach(function(row) {
      files.push(dbRowToFile(row));
    });
    callback(files);
  });
};

DiskState.prototype.recordStart = function(type, item, callback) {
  switch(type) {
    case 'dir':
      FileDb.storeDirProgress(item.localId, 0, callback);
      break;
    case 'file':
      FileDb.storeFileProgress(item.localFolderId, item.name, 0, callback);
      break;
    default:
      throw new Error('DiskState.recordStart::: Unrecognized type (' + type + ')');
  }
};

DiskState.prototype.recordCompletion = function(type, item, callback) {
  switch(type) {
    case 'dir':
      FileDb.storeDirProgress(item.localId, 1, callback);
      break;
    case 'file':
      FileDb.storeFileProgress(item.localFolderId, item.name, 1, callback);
      break;
    default:
      throw new Error('DiskState.recordStart::: Unrecognized type (' + type + ')');
  }
};

module.exports = DiskState;
