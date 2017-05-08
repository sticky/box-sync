'use strict';
var sqlite3 = require('sqlite3'); //.verbose();
var async = require('async');

// Capitalizing Query here because it's very easy to, when writing a SQL query, to use a local 'query' variable which
// just overwrote the global builder object.
var Query = require('./query-builder');

// Making sure that this database is hidden off wherever this script is, and not popping up wherever we randomly
// run.  Plus, we don't have table creation queries.
var db = new sqlite3.Database(__dirname + '/../files-db.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

//db.on('trace', function(sql) {
//  console.log("QUERY", sql);
//});

var stmtDir;
var stmtFile;
var queue = async.queue(storeWorker, 100); // This might need to be fiddled with.

var CLASS_ENUM  = {
  'bad': 1, // TODO: Phase out 'bad'
  'invalid': 2, // 'Bad' is kinda a dumb choice and not the obvious opposite of 'valid'
  'valid': 2,
  'failed': 3
};

var FilesDb = module.exports;

FilesDb.CLASS = {
  VALID: 'valid',
  INVALID: 'bad',
  FAILED: 'failed'
};

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
  stmtDir = db.prepare(Query.insert.dir.dir(),
  [], function(err) {
    if (err) {
      throw err;
    }
    stmtFile = db.prepare(Query.insert.file.file(), [], callback);
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
  var tables = Query.tables.all();
  truncateTables(tables, callback);
}

function truncateProgress(callback) {
  // Order matters!  Foreign key constraints in play.
  var tables = Query.tables.progress();
  truncateTables(tables, callback);
}

function truncateErrors(callback) {
  // Order matters!  Foreign key constraints in play.
  var tables = Query.tables.errors();
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
  var stmt = Query.load.dir.full();

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

function loadFromParent(type, parentId, classification, callback) {
  var stmt = '';
  var params = {};

  switch(type) {
    case 'dir':
      stmt = Query.load.dir.dir();
      stmt += ' WHERE d.Parent_Id = $dirId';
      params = {$dirId:parentId };
      if (classification) {
        stmt += ' AND dc.Class = $class';
        params['$class'] = CLASS_ENUM[classification];
      }
      break;
    case 'file':
      stmt = Query.load.file.file();
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
  var stmt = Query.load.dir.dir();
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

function loadSingleFile(dirId, name, onFinish) {
  var stmt = Query.load.file.file();
  stmt += ' WHERE f.Folder_Id = $dirId AND f.Name = $name';

  db.get(stmt, {$dirId: dirId, $name: name}, function(err, row) {
    if (err) {
      throw new Error("Db.loadSingleFile error: " + err);
    }
    if (onFinish) {
      onFinish.call(this, row);
    }
  });
}

function loadFiles(classification, onFinish) {
  var stmt = Query.load.file.full();

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
  var updateParams = {
    $id: idNum
  };
  setIssueParams(updateParams, issueArr);
  setForeignKeysPragma();

  db.run(Query.insert.dir.issue(), updateParams, function(err) {
    if (err) {
      throw new Error("Db.store issues error: " + err);
    }
    if (onDoneCallback) {
      onDoneCallback();
    }
  });
}

function storeFileIssues(folderId, name, issuesArray, onDoneCallback) {
  var updateParams = {
    $folder: folderId,
    $name: name,
  };
  setIssueParams(updateParams, issuesArray);
  setForeignKeysPragma();

  db.run(Query.insert.file.issue(), updateParams, function(err) {
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
  var updateParams = {
    $id: dirId,
    $class: CLASS_ENUM[classification]
  };
  setForeignKeysPragma();

  db.run(Query.insert.dir.class(), updateParams, function(err) {
    if (err) {
      throw new Error("Db.store class error: " + err);
    }
    if (onDoneCallback) {
      onDoneCallback();
    }
  });
}

function storeFileClass(classification, folderId, name, onDoneCallback) {
  var updateParams = {
    $folder: folderId,
    $name: name,
    $class: CLASS_ENUM[classification]
  };
  setForeignKeysPragma();

  db.run(Query.insert.file.class(), updateParams, function(err) {
    if (err) {
      throw new Error("Db.store class error: " + err);
    }
    if (onDoneCallback) {
      onDoneCallback();
    }
  });
}

function storeDirectoryProgress(dirId, done, onFinish) {
  var updateParams = {
    $dir: dirId,
    $done: done
  };
  setForeignKeysPragma();

  db.run(Query.insert.dir.progress(), updateParams, function(err) {
    if (err) {
      throw new Error("Db.store progress error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function storeFileProgress(dirId, fileName, done, onFinish) {
  var updateParams = {
    $id: dirId,
    $done: done,
    $name: fileName
  };
  setForeignKeysPragma();

  db.run(Query.insert.file.progress(), updateParams, function(err) {
    if (err) {
      throw new Error("Db.store progress error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function storeDirectoryFailure(dirId, errNum, errTxt, onFinish) {
  var updateParams = {
    $dir: dirId,
    $num: errNum,
    $txt: errTxt
  };
  setForeignKeysPragma();

  db.run(Query.insert.dir.error(), updateParams, function(err) {
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
  var params = {
    $dirNum: dirNum
  };

  setForeignKeysPragma();

  db.run(Query.delete.dir.error(), params, function(err) {
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
  var params = {
    $folderId: folderId,
    $name: filename
  };

  setForeignKeysPragma();

  db.run(Query.delete.file.error(), params, function(err) {
    if (err) {
      throw new Error("Db.delete file failure error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function storeFileFailure(dirId, fileName, errNum, errTxt, onFinish) {
  var updateParams = {
    $dir: dirId,
    $name: fileName,
    $num: errNum,
    $txt: errTxt
  };
  setForeignKeysPragma();

  db.run(Query.insert.file.error(), updateParams, function(err) {
    if (err) {
      throw new Error("Db.store failure error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function loadDirFailures(onFinish) {
  var sql = Query.load.dir.dir();
  sql += ' JOIN Directory_Failures df ON d.Sys_Id_Num = df.Dir_Id_Num';
  db.all(sql, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadDirFailures failure error: [" + sql + "]; " + err);
    }
    if (onFinish) {
      onFinish(rows);
    }
});
}

function loadFileFailures(onFinish) {
  var sql = Query.load.file.file();
  sql += ' JOIN File_Failures ff ON f.Folder_Id = ff.Folder_Id AND f.Name = ff.Name';
  db.all(sql, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadDirFailures failure error: [" + sql + "]; " + err);
    }
    if (onFinish) {
      onFinish(rows);
    }
  });
}

function loadDirsMissingRemoteIds(onFinish) {
  var sql = Query.load.dir.dir();
  sql += ' LEFT JOIN Directory_Failures df ON d.Sys_Id_Num = df.Dir_Id_Num';
  sql += ' LEFT JOIN Directory_Progress dp ON d.Sys_Id_Num = dp.Dir_Id';
  sql += " WHERE df.Error_Code IS NULL AND d.Remote_ID IS  'unknown' AND (di.Long IS 0 AND di.Chars IS 0 AND di.Spaces IS 0) AND Done IS NOT NULL";
  db.all(sql, [], function(err, rows) {
    if (err) {
      throw new Error("Db.loadDirsMissingRemoteIds failure error: [" + sql + "]; " + err);
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
  setForeignKeysPragma();

  db.run(Query.insert.var.var(), updateParams, function(err) {
    if (err) {
      throw new Error("Db.store vars error: " + err);
    }
    if (onFinish) {
      onFinish();
    }
  });
}

function loadVars(onFinish) {
  var stmt = Query.load.var.var();

  db.all(stmt, [], function(err, rows) {
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

/**
 *  Get progress rows for a file or a directory.
 *
 * @param type
 *  One of either 'file' or 'dir'.
 * @param limit
 *  An optional numeral that indicates how many rows to grab.  Specify as a false value to get everything.
 * @param fullJoins
 *  If true, loadProgress will return complete file or dir entities instead of just progress values.
 * @param callback
 *  Results can be an array of rows, or it can be a boolean.  False signifies that there aren't any progress rows
 *  to speak of, that we're totally fresh.
 */
FilesDb.loadProgress = function(type, limit, fullJoins, callback) {
  var sql;
  var countQuery;
  var where = '';
  var limit = limit ? ' LIMIT ' + limit : '';

  switch(type) {
    case 'file':
      sql = fullJoins === true ? Query.load.file.full() : Query.load.file.progress();
      countQuery = Query.count.file.progress();
      where = ' WHERE Done = 0';
      break;
    case 'dir':
      sql = fullJoins === true ? Query.load.dir.full() : Query.load.dir.progress();
      countQuery = Query.count.dir.progress();
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

        callback(null, row['COUNT(*)']);
      });
    },
    function(callback) {
      db.all(sql + where + limit, function(err, rows) {
        if (err) {
          throw new Error("Db.loadIncompleteProgress error: " + err);
        }
        callback(err, rows);
      });
    },
  ], function(err, res) {
    var totalProgressRows;
    var result;

    if (err) {
      throw err;
    }

    totalProgressRows = res[0];
    result = res[1];

    // Not only did we get no results, there were no results to give.  Tell external code we're totally fresh.
    if (totalProgressRows == 0) {
      result = false;
    }
    if (callback) {
      callback(err, result);
    }
  });
};

FilesDb.loadFilesWithRemoteIds = function(callback) {
  var stmt = Query.load.file.file();

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
