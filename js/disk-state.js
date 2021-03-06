'use strict';

var fs = require('fs');
var readline = require('readline');
var async = require('async');
var Util = require('./util');
var StickyFile = require('./file-info');
var StickyDir = require('./dir-info');
var FileDb = require('./files-db');

var INIT_VALID_FILES = {files: [], dirs: []};
var INIT_BADS = {files: [], dirs: [], ignores: []};

var CLASS = {
  VALID: 'valid',
  INVALID: 'bad',
  UNKNOWN: 0
};

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
    updated: row.Updated,
    created: row.Created,
    remote: row.Remote_Id,
    problems: getRowIssues(row),
    hash: row.Hash
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
    updated: row.Updated,
    created: row.Created,
    problems: getRowIssues(row),
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

DiskState.prototype.CLASS = {
  UNKNOWN: CLASS.UNKNOWN,
  INVALID: CLASS.INVALID,
  VALID: CLASS.VALID
};

DiskState.prototype.getCurrentValidatorCounts = function() {
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
  async.parallel([
    function(cb) {
      FileDb.purgeProgress(cb);
    },
    function(cb) {
      FileDb.purgeErrors(cb);
    }
  ], function(err) {
    if (err) {
      throw new Error(err);
    }
    callback();
  });
};

DiskState.prototype.prepareForInserts = function(callback) {
  FileDb.beginTransaction(callback);
};

DiskState.prototype.completeInserts = function(callback) {
  FileDb.endTransaction(callback);
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


  // Since there is no uniqueness being enforced in our arrays of files and dirs, we need to
  // purge the lists and start from scratch.
  switch(classification) {
    case CLASS.VALID:
      self.valid.dirs = [];
      break;
    case 'invalid':
      self.bad.dirs = [];
      break;
    case null:
    case undefined:
      self.valid.dirs = [];
      self.bad.dirs = [];
      break;
    default:
      completeCallback(new Error("DiskState.loadFiles:: Invalid classification:" + classification));
      return;
  }

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

DiskState.prototype.getDirFailures = function(completeCallback) {
  var self = this;
  var failures = {};
  FileDb.loadFailures('dir', function(rows) {
    rows.forEach(function(row) {
      var dir = dbRowToDir(row);
      // Add some additional informational pieces to the default dir info.
      dir.errCode = row.Error_Code;
      dir.errText = row.Error_Blob;

      if (!failures[dir.errCode]) {
        failures[dir.errCode] = [];
      }
      failures[dir.errCode].push(dir);

    });
    completeCallback(null, failures);
  });
};

DiskState.prototype.getFileFailures = function(completeCallback) {
  var failures = {};
  FileDb.loadFailures('file', function(rows) {
    rows.forEach(function(row) {
      var file = dbRowToFile(row);
      // Add some additional informational pieces to the default dir info.
      file.errCode = row.Error_Code;
      file.errText = row.Error_Blob;

      if (!failures[file.errCode]) {
        failures[file.errCode] = [];
      }
      failures[file.errCode].push(file);
    });
    completeCallback(null, failures);
  });
};

DiskState.prototype.removeDirError = function(dirId, callback) {
  FileDb.removeDirError(dirId, callback);
};

DiskState.prototype.removeFileError = function(folderId, name, callback) {
  FileDb.removeFileError(folderId, name, callback);
};

DiskState.prototype.getFirstIncomplete = function(type, completeCallback) {
  getIncomplete(type, true, completeCallback);

};

DiskState.prototype.getAllIncomplete = function(type, completeCallback) {
  getIncomplete(type, false, completeCallback);
};

function getIncomplete(type, onlySingle, completeCallback) {
  // We've got a progress query to do, and we need follow up with doing a full dir/file DB query
  // from the unfinished query result.
  // Code outside of DiskState doesn't deal with raw rows, either, so we need to convert to
  // a FileInfo or a DirInfo.
  async.waterfall([
      function(cb) {
        var limit;
        if (onlySingle) {
         limit = 1;
        }
        FileDb.loadProgress(type, limit, true, cb);
      },
      function(fullRows, cb) {
        var items;

        // This could be null or false, which needs to be passed to the final callback because the difference
        // between false and null/undefined is important to external code.
        if (!fullRows) {
          cb(null, fullRows);
          return;
        }

        items = getRealObjectsFromDbRows(type, fullRows);
        cb(null, items);
      }
    ],
    function(err, results) {
      completeCallback(err, results);
  });
}

function getIdsFromProgressRow(progressRow, type) {
  switch(type) {
    case 'file':
      return {'folder': progressRow.Folder_Id, 'name': progressRow.Name};
      break;
    case 'dir':
      return {'id': progressRow.Dir_Id};
      break;
  }
}

function getRealObjectsFromDbRows(type, rows) {
  var rowProcessFunc;
  var objects = [];

  switch(type) {
    case 'dir':
      rowProcessFunc = dbRowToDir;
      break;
    case 'file':
      rowProcessFunc = dbRowToFile;
      break;
    default:
      throw new Error("getRealObjectsFromDbRows:: Unrecognized type requested. (" + type + ")");
  }

  rows.forEach(function(row) {
    objects.push(rowProcessFunc(row));
  });

  return objects;
}

DiskState.prototype.getUnfinishedInvalidFiles = function(completeCallback) {
  FileDb.loadAll('file', FileDb.CLASS.INVALID, function(rows) {
    var files = [];
    if (!rows) {
      completeCallback(null);
      return;
    }

    rows.forEach(function(row) {
      var file = dbRowToFile(row);
      if (!row.Done) {
        files.push(file);
      }
    });
    completeCallback(null, files);
  });
};

// Are there perfectly valid, error-free directories without a remote ID?
DiskState.prototype.getRemotelessDirs = function(completeCallback) {
  var self = this;
  FileDb.loadDirsWithoutRemoteIds(function(rows) {
    var dirs = [];
    if (!rows) {
      completeCallback(null);
      return;
    }

    rows.forEach(function(row) {
      dirs.push(dbRowToDir(row));
    });
    completeCallback(null, dirs);
  });
};

DiskState.prototype.getUnverifiedDirs = function(completeCallback) {
  FileDb.loadUnverifiedDirsWithRemoteIds(function(rows) {
    var dirs = [];
    if (!rows) {
      completeCallback(null);
      return;
    }

    rows.forEach(function(row) {
      dirs.push(dbRowToDir(row));
    });
    completeCallback(dirs);
  });
};

DiskState.prototype.getUnverifiedFiles = function(completeCallback) {
  FileDb.loadUnverifiedFilesWithRemoteIds(function(rows) {
    var files = [];
    if (!rows) {
      completeCallback(null);
      return;
    }

    rows.forEach(function(row) {
      files.push(dbRowToFile(row));
    });
    completeCallback(files);
  });
};

DiskState.prototype.loadFiles = function(classification, completeCallback) {
  var self = this;

  // Since there is no uniqueness being enforced in our arrays of files and dirs, we need to
  // purge the lists and start from scratch.
  switch(classification) {
    case CLASS.VALID:
      self.valid.files = [];
      break;
    case 'invalid':
      self.bad.files = [];
      break;
    case null:
    case undefined:
      self.valid.files = [];
      self.bad.files = [];
      break;
    default:
      completeCallback(new Error("DiskState.loadFiles:: Invalid classification:" + classification));
      return;
  }

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
  // Hopefully this has been requested before so we can avoid slower DB hits.
  if (folderIdMap[searchInfo.dirId]) {
    searchInfo.remoteId = folderIdMap[searchInfo.dirId];
    onDoneCallback();
  } else {
    FileDb.loadRemoteIdForDir(searchInfo.dirId, function(folderId) {
      folderIdMap[searchInfo.dirId] = folderId;
      searchInfo.remoteId = folderId;
      onDoneCallback();
    });
  }
}

DiskState.prototype.getDirsInDir = function(dir, callback) {
  var self = this;
  FileDb.loadDirsFrom(dir.localId, 'valid', function(rows) {
    var dirs = [];

    rows.forEach(function(row) {
      dirs.push(dbRowToDir(row));
    });
    callback(dirs);
  });
};

DiskState.prototype.getFilesInDir = function(dir, callback) {
  var self = this;
  FileDb.loadFilesFrom(dir.localId, 'valid', function(rows) {
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

DiskState.prototype.recordVar = function(name, value, callback) {
  FileDb.store('var', '', {name: name, value: value}, callback);
};
DiskState.prototype.getVars = function(callback) {
  FileDb.loadAll('var', '', callback);
};

DiskState.prototype.recordVerifyComplete = function(type, item, callback) {
  switch(type) {
    case 'dir':
      FileDb.storeDirVerify(item.localId, 1, callback);
      break;
    case 'file':
      FileDb.storeFileVerify(item.localFolderId, item.name, 1, callback);
      break;
    default:
      throw new Error('DiskState.recordVerifyComplete::: Unrecognized type (' + type + ')');
  }
};

DiskState.prototype.recordVerifyInComplete = function(type, item, callback) {
  switch(type) {
    case 'dir':
      FileDb.storeDirVerify(item.localId, 0, callback);
      break;
    case 'file':
      FileDb.storeFileVerify(item.localFolderId, item.name, 0, callback);
      break;
    default:
      throw new Error('DiskState.recordVerifyInComplete::: Unrecognized type (' + type + ')');
  }
};

module.exports = DiskState;
