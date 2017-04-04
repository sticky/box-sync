'use strict';
var sqlite3 = require('sqlite3'); //.verbose();
var async = require('async');
// Making sure that this database is hidden off wherever this script is, and not popping up wherever we randomly
// run.  Plus, we don't have table creation queries.
var db = new sqlite3.Database(__dirname + '/../files-db.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

var TABLE_DIRS = 'Directories';
var TABLE_FILES = 'Files';
var TABLE_VARS = 'Misc_Vars';
var TABLE_DIR_ISSUES = 'Directory_Issues';
var TABLE_DIR_CLASS = 'Directory_Class';
var TABLE_FILE_ISSUES = 'File_Issues';
var TABLE_FILE_CLASS = 'File_Class';
var TABLE_DIR_PROGRESS = 'Directory_Progress';
var TABLE_FILE_PROGRESS = 'Files_Progress';
var TABLE_DIR_ERROR = 'Directory_Failures';
var TABLE_FILE_ERROR = 'File_Failures';

var stmtDir;
var stmtFile;
var queue = async.queue(storeWorker, 100); // This might need to be fiddled with.

var CLASS_ENUM  = {
  'bad': 1,
  'valid': 2,
  'failed': 3,
}

var FilesDb = module.exports;

function setForeignKeysPragma(callback) {
  db.run('PRAGMA foreign_keys = true;', callback);
}
function prepareStatements(callback) {
  function failureCheck(err) {
    if (err) {
      throw new Error("Prepared failed:" + err);
    }
    callback();
  }
  var needTofinal = false;
  if (stmtDir || stmtFile) {
    finalizeStatements(function() {
      finishPreparing(failureCheck);
    });
  } else {
    finishPreparing(failureCheck);
  }
}

function finishPreparing(callback) {
  stmtDir = db.prepare('INSERT OR REPLACE INTO ' + TABLE_DIRS + '(Sys_Id_Num, Parent_Id, Remote_Id, Full_Path, Name, Created, Updated) VALUES ($id, $parentId, $remoteId, $path, $name, $created, $updated);',
  [], function() {
    stmtFile = db.prepare('INSERT OR REPLACE INTO ' + TABLE_FILES + ' (Folder_Id, Full_Path, Name, Remote_Id, Created, Updated, Hash) VALUES ($folderId, $path, $name, $remote, $created, $updated, $hash);', [], callback);
  });
}

function finalizeStatements(callback) {
  if (!stmtFile || !stmtDir) {
    throw new Error("One or more prepared statements do not exist and cannot be finalized.");
  }
  stmtFile.finalize(function() {
    stmtFile = null;
    stmtDir.finalize(function() {
      stmtDir = null;
      callback();
    });
  });
}

function truncateEverything(callback) {
  // Order matters!  Foreign key constraints.
  var tables = [
    TABLE_DIR_ERROR,
    TABLE_FILE_ERROR,
    TABLE_DIR_PROGRESS,
    TABLE_FILE_PROGRESS,
    TABLE_FILE_CLASS,
    TABLE_DIR_CLASS,
    TABLE_FILE_ISSUES,
    TABLE_DIR_ISSUES,
    TABLE_DIRS,
    TABLE_FILES,
  ];
  truncateTables(tables, callback);
}

function truncateProgress(callback) {
  // Order matters!  Foreign key constraints in play.
  var tables = [
    TABLE_DIR_PROGRESS,
    TABLE_FILE_PROGRESS,
  ];
  truncateTables(tables, callback);
}

function truncateErrors(callback) {
  // Order matters!  Foreign key constraints in play.
  var tables = [
    TABLE_DIR_ERROR,
    TABLE_FILE_ERROR,
  ];
  truncateTables(tables, callback);
}

function truncateTables(tables, callback) {
  // There isn't a truncate?  This is close enough.
  var stmt = 'DELETE FROM ';
  var tasks = [];

  setForeignKeysPragma(function(err) {
    tables.forEach(function(tableName) {
      tasks.push(function(callback) {
        db.run(stmt + tableName + ';', [], function(err) {
          if (err) {
            throw new Error("Failed to truncate everything:" + err);
          }
          callback();
        });
      });
    });

    tasks.push(function(callback) {
      db.run('VACUUM', [], function() {
        console.log('VACUUM?');
        if (callback) {
          callback();
        }
      });
    });

    async.series(tasks, function() {
      callback();
    });
  });
}

function storeDirectory(id, parentId, remoteId, fullPath, name, createdStr, updatedStr, onDoneCallback) {
  var updateParams = {
    $id: id,
    $parentId: parentId,
    $remoteId: remoteId,
    $path: fullPath,
    $name: name,
    $created: createdStr,
    $updated: updatedStr,
  };
  setForeignKeysPragma();

  stmtDir.run(updateParams, function(err) {
    if (err) {
      throw new Error("Db.store error: " + err);
    }
    if (onDoneCallback) {

      onDoneCallback();
    }
  });
}

function storeFile(localFolderId, fullPath, name, remoteId, createdStr, updatedStr, hash, onDoneCallback) {

  var updateParams = {
    $folderId: localFolderId,
    $path: fullPath,
    $name: name,
    $remote: remoteId,
    $created: createdStr,
    $updated: updatedStr,
    $hash: hash
  };
  setForeignKeysPragma();

  stmtFile.run(updateParams, function(err) {
    if (err) {
      throw new Error("Db.store error: " + err);
    }
    if (onDoneCallback) {
      onDoneCallback();
    }
  });
}

function loadDirs(classification, onFinish) {
  var stmt = 'SELECT * FROM ' + TABLE_DIRS + ' d INNER JOIN ' + TABLE_DIR_CLASS + ' dc ';
  stmt += 'ON d.Sys_Id_Num = dc.Dir_Id ';
  stmt += 'INNER JOIN ' + TABLE_DIR_ISSUES + ' di ';
  stmt += 'ON d.Sys_Id_Num = di.DirId';

  if (classification) {
    stmt += ' WHERE dc.Class = ' + CLASS_ENUM[classification];
  }
  db.all(stmt, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadDirs error: " + err);
    }
    if (onFinish) {
      onFinish.call(this, rows);
    }
  });
}

function loadDirContents(dirId, what, classification, callback) {
  switch(what) {
    case 'dir':
      loadFromParent('dir', dirId, classification, callback);
      break;
    case 'file':
      loadFromParent('file', dirId, classification, callback);
      break;
    default:
      throw new Error("loadDirContents: unrecognized type.  (" + what + ")");
      break;
  }
}

function loadDirsWithParent(dirId, classification, callback) {
  console.warn("Deprecated: loadDirsWithParent");
  loadFromParent('dir', dirId, classification, callback);
}

function loadFilesWithParent(dirId, classification, callback) {
  console.warn("Deprecated: loadFilesWithParent");
  loadFromParent('file', dirId, classification, callback);
}

function loadFromParent(type, parentId, classification, callback) {
  var stmt = '';
  var params = {};
  var table = TABLE_FILES;
  var classTable = TABLE_FILE_CLASS;
  var issuesTable = TABLE_FILE_ISSUES;
  var itemFolderCol = 'Folder_Id';
  var whereStr = ' WHERE i.Folder_Id = $id';

  switch(type) {
    case 'dir':
      stmt = 'SELECT * FROM ' + TABLE_DIRS + ' d INNER JOIN ' + TABLE_DIR_CLASS + ' dc ';
      stmt += 'ON d.Sys_Id_Num = dc.Dir_Id ';
      stmt += 'INNER JOIN ' + TABLE_DIR_ISSUES + ' di ';
      stmt += 'ON d.Sys_Id_Num = di.DirId';
      stmt += ' WHERE d.Parent_Id = $dirId';
      params = {$dirId:parentId };
      if (classification) {
        stmt += ' AND dc.Class = $class';
        params['$class'] = CLASS_ENUM[classification];
      }
      break;
    case 'file':
      stmt = 'SELECT * FROM ' + TABLE_FILES + ' f INNER JOIN ' + TABLE_FILE_CLASS + ' fc ';
      stmt += 'ON f.Folder_Id = fc.Folder_Id AND f.Name = fc.File_Name ';
      stmt += 'INNER JOIN ' + TABLE_FILE_ISSUES + ' fi ';
      stmt += 'ON f.Folder_Id = fi.Folder_Id AND f.Name = fi.File_Name ';
      stmt += 'WHERE f.Folder_Id = $dirId';
      params = {$dirId:parentId};
      if (classification) {
        stmt += ' AND fc.Class = $class';
        params['$class'] = CLASS_ENUM[classification];
      }
      break;
    default:
      throw new Error('FilesDb:::loadFromParent()  unrecognized type (' + type + ')');

  }

  db.all(stmt, params, function(err, rows) {
    if (err) {
      throw new Error("Db.loadFromParent error: " + err);
    }
    if (callback) {callback(rows);}
  });
}

function loadSingleDir(dirId, onFinish) {
  var stmt = 'SELECT * FROM ' + TABLE_DIRS + ' d INNER JOIN ' + TABLE_DIR_CLASS + ' dc ';
  stmt += 'ON d.Sys_Id_Num = dc.Dir_Id ';
  stmt += 'INNER JOIN ' + TABLE_DIR_ISSUES + ' di ';
  stmt += 'ON d.Sys_Id_Num = di.DirId';

  stmt += ' WHERE d.Sys_Id_Num = $dirId';

  db.get(stmt, {$dirId: dirId}, function(err, row) {
    if (err) {
      throw new Error("Db.loadSingleDir error: " + err);
    }
    if (onFinish) {
      onFinish.call(this, row);
    }
  });
}

function loadFiles(classification, onFinish) {
  var stmt = 'SELECT * FROM ' + TABLE_FILES + ' f INNER JOIN ' + TABLE_FILE_CLASS + ' fc ';
  stmt += 'ON f.Folder_Id = fc.Folder_Id AND f.Name = fc.File_Name ';
  stmt += 'INNER JOIN ' + TABLE_FILE_ISSUES + ' fi ';
  stmt += 'ON f.Folder_Id = fi.Folder_Id AND f.Name = fi.File_Name';

  if (classification) {
    stmt += ' WHERE fc.Class = ' + CLASS_ENUM[classification];
  }
  db.all(stmt, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadFiles error: " + err);
    }

    if (onFinish) {
      onFinish.call(this, rows);
    }
  });
}

function storeDirIssues(idNum, issueArr, onDoneCallback) {
  var mainTable = TABLE_DIR_ISSUES;
  var updateParams = {
    $id: idNum
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (DirId, Long, Chars, Spaces) VALUES ($id, $long, $chars, $spaces);';
  setIssueParams(updateParams, issueArr);
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store issues error: " + err);
    }
    if (onDoneCallback) {
      onDoneCallback();
    }
  });
}

function storeFileIssues(folderId, name, issuesArray, onDoneCallback) {
  var mainTable = TABLE_FILE_ISSUES;
  var updateParams = {
    $folder: folderId,
    $name: name,
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Folder_Id, File_Name, Long, Chars, Spaces) VALUES ($folder, $name, $long, $chars, $spaces);';
  setIssueParams(updateParams, issuesArray);
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store issues error: " + err);
    }
    if (onDoneCallback) {
      onDoneCallback();
    }
  });
}

function setIssueParams(params, issueArr) {
  if (issueArr.indexOf('long') >= 0) {
    params.$long = 1;
  }
  if (issueArr.indexOf('chars') >= 0) {
    params.$chars = 1;
  }
  if (issueArr.indexOf('spaces') >= 0) {
    params.$spaces = 1;
  }

  return params;
}

function storeDirClass(classification, dirId, onDoneCallback) {
  var mainTable = TABLE_DIR_CLASS;
  var updateParams = {
    $id: dirId,
    $class: CLASS_ENUM[classification]
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Dir_Id, Class) VALUES ($id, $class);';
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store class error: " + err);
    }
    if (onDoneCallback) {
      onDoneCallback();
    }
  });
}

function storeFileClass(classification, folderId, name, onDoneCallback) {
  var mainTable = TABLE_FILE_CLASS;
  var updateParams = {
    $folder: folderId,
    $name: name,
    $class: CLASS_ENUM[classification]
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Folder_Id, File_Name, Class) VALUES ($folder, $name, $class);';
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store class error: " + err);
    }
    if (onDoneCallback) {
      onDoneCallback();
    }
  });
}

function loadIncompleteProgress(type, onFinish) {
  var query = 'SELECT * FROM ';
  var countQuery = 'SELECT COUNT(*) FROM ';
  var where = '';
  var totalProgressRows;
  var result;
  switch(type) {
    case 'file':
      query += TABLE_FILE_PROGRESS;
      countQuery += TABLE_FILE_PROGRESS;
      where = ' WHERE Done = 0';
      break;
    case 'dir':
      query += TABLE_DIR_PROGRESS;
      countQuery += TABLE_DIR_PROGRESS;
      where = ' WHERE Done = 0';
      break;
    default:
      throw new Error("Db.loadIncompleteProgress error: unrecognized type '" + type + "'");
  }

  async.series([
    function(callback) {
      db.get(countQuery, function(err, row) {
        if (err) {
          throw new Error("Db.loadIncompleteProgress error: " + err);
        }

        totalProgressRows = row['COUNT(*)'];
        callback();
      });
    },
    function(callback) {
      db.get(query + where, function(err, row) {
        if (err) {
          throw new Error("Db.loadIncompleteProgress error: " + err);
        }
        result = row;
        callback.call(this, row);
      });
    },
  ], function(err) {
    if (totalProgressRows == 0) {
      result = false;
    }
    if (onFinish) {
      onFinish.call(this, result);
    }
  });
}

function storeDirectoryProgress(dirId, done, onFinish) {
  var mainTable = TABLE_DIR_PROGRESS;
  var updateParams = {
    $dir: dirId,
    $done: done,
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Dir_Id, Done) VALUES ($dir, $done);';
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store progress error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function storeFileProgress(dirId, fileName, done, onFinish) {
  var mainTable = TABLE_FILE_PROGRESS;
  var updateParams = {
    $id: dirId,
    $done: done,
    $name: fileName,
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Folder_Id, Name, Done) VALUES ($id, $name, $done);';
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store progress error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function storeDirectoryFailure(dirId, errNum, errTxt, onFinish) {
  var mainTable = TABLE_DIR_ERROR;
  var updateParams = {
    $dir: dirId,
    $num: errNum,
    $txt: errTxt
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Dir_Id_Num, Error_Code, Error_Blob) VALUES ($dir, $num, $txt);';
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store failure error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function removeDirectoryFailure(dirNum, onFinish) {
  console.log("removing dir error");
  var mainTable = TABLE_DIR_ERROR;
  var deleteStr = 'DELETE FROM ';
  var whereStr = ' WHERE Dir_Id_Num IS $dirNum;';
  var params = {
    $dirNum: dirNum
  };

  setForeignKeysPragma();

  db.run(deleteStr + mainTable + whereStr, params, function(err) {
    if (err) {
      throw new Error("Db.delete dir failure error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function removeFileFailure(folderId, filename, onFinish) {
  console.log("removing file error");
  var mainTable = TABLE_FILE_ERROR;
  var deleteStr = 'DELETE FROM ';
  var whereStr = ' WHERE Folder_Id IS $folderId AND Name IS $name;';
  var params = {
    $folderId: folderId,
    $name: filename
  };

  setForeignKeysPragma();

  db.run(deleteStr + mainTable + whereStr, params, function(err) {
    if (err) {
      throw new Error("Db.delete file failure error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function storeFileFailure(dirId, fileName, errNum, errTxt, onFinish) {
  var mainTable = TABLE_FILE_ERROR;
  var updateParams = {
    $dir: dirId,
    $name: fileName,
    $num: errNum,
    $txt: errTxt
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Folder_Id, Name, Error_Code, Error_Blob) VALUES ($dir, $name, $num, $txt);';
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store failure error: [" + updateStr + mainTable + valuesStr + "]" + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function loadDirFailures(onFinish) {
  var query = 'SELECT * FROM Directories d JOIN Directory_Issues di ON d.Sys_Id_Num = di.DirId JOIN Directory_Class dc ON d.Sys_Id_Num = dc.Dir_Id JOIN Directory_Failures df ON d.Sys_Id_Num = df.Dir_Id_Num';
  db.all(query, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadDirFailures failure error: [" + query + "]; " + err);
    }
    if (onFinish) {
      onFinish(rows);
    }
});
}

function loadFileFailures(onFinish) {
  var query = 'SELECT * FROM Files f JOIN File_Failures ff ON f.Folder_Id = ff.Folder_Id AND f.Name = ff.Name JOIN File_Issues fi ON f.Folder_Id = fi.Folder_Id AND f.Name = fi.File_Name JOIN File_Class fc ON f.Folder_Id = fc.Folder_id AND f.Name = fc.File_Name';
  db.all(query, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadDirFailures failure error: [" + query + "]; " + err);
    }
    if (onFinish) {
      onFinish(rows);
    }
  });
}

function loadDirsMissingRemoteIds(onFinish) {
  var query = "SELECT * FROM Directories d JOIN Directory_Issues di ON d.Sys_Id_Num = di.DirId LEFT JOIN Directory_Failures df ON d.Sys_Id_Num = df.Dir_id_Num LEFT JOIN Directory_Progress dp ON d.Sys_Id_Num = dp.Dir_Id WHERE df.Error_Code IS NULL AND d.Remote_ID IS  'unknown' AND (di.Long IS 0 AND di.Chars IS 0 AND di.Spaces IS 0) AND Done IS NOT NULL";
  db.all(query, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadDirsMissingRemoteIds failure error: [" + query + "]; " + err);
    }
    if (onFinish) {
      onFinish(rows);
    }
  });
}

function storeVar(name, value, onFinish) {
  var updateParams = {
    $name: name,
    $val: value,
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Name, Value) VALUES ($name, $val);';
  setForeignKeysPragma();

  db.run(updateStr + TABLE_VARS + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store vars error: [" + updateStr + TABLE_VARS + valuesStr + "]" + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function loadVars(onFinish) {
  var query = 'SELECT * FROM ' + TABLE_VARS;

  db.all(query, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadVars error: " + err);
    }
    if (onFinish) {
      onFinish.call(this, rows);
    }
  });
}

FilesDb.startOver = function(callback) {
  truncateEverything(callback);
};

FilesDb.purgeProgress = function(callback) {
  truncateProgress(callback);
};

FilesDb.purgeErrors = function(callback) {
  truncateErrors(callback);
};

FilesDb.beginTransaction = function(callback) {
  db.run('BEGIN TRANSACTION;', [], function() {
    // Prepared statements inherit the transaction context; if they're prepared before a transaction, they don't gain
    // the (at least performance) benefits of the transaction.
    prepareStatements(callback);
  });
};

FilesDb.endTransaction = function(callback) {
  db.run('END TRANSACTION;', [], callback);
};

function storeWorker(properties, doneCallback) {
  var type = properties.type;
  var classification = properties.classification;
  var itemInfo = properties.itemInfo;

  switch (type) {
    case 'dir':
      async.series([
        function(callback) {
          storeDirectory(itemInfo.localId, itemInfo.parentId, itemInfo.remoteId, itemInfo.pathStr, itemInfo.name, itemInfo.created, itemInfo.updated, callback);
        },
        function(callback) {
          storeDirIssues(itemInfo.localId, itemInfo.issues, callback);
        },
        function(callback) {
          storeDirClass(classification, itemInfo.localId, callback);
        }
      ], function(err) {
        if (doneCallback) {doneCallback()};
      });
      break;
    case 'file':
      async.series([
        function(callback) {
          storeFile(itemInfo.localFolderId, itemInfo.pathStr, itemInfo.name, itemInfo.remoteId, itemInfo.created, itemInfo.updated, itemInfo.hash, callback);
        },
        function(callback) {
          storeFileIssues(itemInfo.localFolderId, itemInfo.name, itemInfo.issues, callback);
        },
        function(callback) {
          storeFileClass(classification, itemInfo.localFolderId, itemInfo.name, callback);
        }
      ], function(err) {
        if (doneCallback) {doneCallback()};
      });
      break;
    case 'var':
      storeVar(itemInfo.name, itemInfo.value, doneCallback);
      break;
    default:
      throw Error("FilesDb.store::: Invalid type.");
  }
}

// This is not very parallel safe.  Or, rather, "prepareStatements" isn't very safe.
FilesDb.store = function(type, classification, itemInfo, doneCallback) {
  if (!stmtDir || !stmtFile) {
    prepareStatements(function(err) {
      queue.push({type: type, classification: classification, itemInfo: itemInfo}, doneCallback);
    });
  } else {
    queue.push({type: type, classification: classification, itemInfo: itemInfo}, doneCallback);
  }
};

FilesDb.loadSingleDirProgress = function(callback) {
  loadIncompleteProgress('dir', function(row) {
    //console.log("load single progress", row);
    if (row && row.Dir_Id) {
      loadSingleDir(row.Dir_Id, callback);
    } else {
      callback(row);
    }
  });
};

FilesDb.loadFilesWithRemoteIds = function(callback) {
  var stmt = 'SELECT * FROM ' + TABLE_FILES + ' f INNER JOIN ' + TABLE_FILE_CLASS + ' fc ';
  stmt += 'ON f.Folder_Id = fc.Folder_Id AND f.Name = fc.File_Name ';
  stmt += 'INNER JOIN ' + TABLE_FILE_ISSUES + ' fi ';
  stmt += 'ON f.Folder_Id = fi.Folder_Id AND f.Name = fi.File_Name';

  stmt += ' WHERE fc.Class = ' + CLASS_ENUM['valid'] + ' AND f.Remote_Id IS NOT "unknown"';

  db.all(stmt, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadFiles error: " + err);
    }

    if (callback) {
      callback.call(this, rows);
    }
  });
};

FilesDb.loadAll = function(type, classification, callback) {
  switch(type) {
    case 'file':
      loadFiles(classification, callback);
      break;
    case 'dir':
      loadDirs(classification, callback);
      break;
    case 'var':
      loadVars(callback);
      break;
  }
};

FilesDb.loadFailures = function(type, callback) {
  switch(type) {
    case 'dir':
      loadDirFailures(callback);
      break;
    case 'file':
      loadFileFailures(callback);
      break;
    default:
      return callback(new Error("LoadFailures error: Unrecognized type (" + type + ")"));
  }
};

FilesDb.loadRemoteIdForDir = function(dirId, doneCallback) {
  loadSingleDir(dirId, function(row) {
    doneCallback(row.Remote_Id);
  });
};

FilesDb.loadDirsFrom = function(dirId, classification, doneCallback) {
  loadDirContents(dirId, 'dir', classification, doneCallback);
};

FilesDb.loadFilesFrom = function(dirId, classification, doneCallback) {
  loadDirContents(dirId, 'file', classification, doneCallback);
};

// These directories don't have remote Ids... but should have.
FilesDb.loadDirsWithoutRemoteIds = function(callback) {
  loadDirsMissingRemoteIds(callback);
};

FilesDb.storeDirProgress = function(dir, value, callback) {
  storeDirectoryProgress(dir, value, callback);
};

FilesDb.storeFileProgress = function(dirId, fileName, value, callback) {
  storeFileProgress(dirId, fileName, value, callback);
};

FilesDb.storeDirError = function(dirNum, errorNum, errorText, callback) {
  storeDirectoryFailure(dirNum, errorNum, errorText, callback);
};
FilesDb.storeFileError = function(fileFolderId, fileName, errorNum, errorText, callback) {
  storeFileFailure(fileFolderId, fileName, errorNum, errorText, callback);
};

FilesDb.removeDirError = function(dirNum, callback) {
  removeDirectoryFailure(dirNum, callback);
};

FilesDb.removeFileError = function(folderId, filename, callback) {
  removeFileFailure(folderId, filename, callback);
};

process.on('SIGINT', function() {
  console.warn("Caught interrupt signal, trying to close database.");
  if (stmtDir || stmtFile) {
    stmtDir.finalize(function() {
      stmtFile.finalize(function() {
        db.close();
      });
    });
  } else {
    db.close();
  }
});
