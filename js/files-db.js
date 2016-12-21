'use strict';
var sqlite3 = require('sqlite3').verbose();
var async = require('async');
var db = new sqlite3.Database('files-db.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

var TABLE_DIRS = 'Directories';
var TABLE_FILES = 'Files';
var TABLE_DIR_ISSUES = 'Directory_Issues';
var TABLE_DIR_CLASS = 'Directory_Class';
var TABLE_FILE_ISSUES = 'File_Issues';
var TABLE_FILE_CLASS = 'File_Class';
var TABLE_DIR_PROGRESS = 'Directory_Progress';
var TABLE_FILE_PROGRESS = 'Files_Progress';
var CLASS_ENUM  = {
  'bad': 1,
  'valid': 2,
  'failed': 3,
}

var FilesDb = exports;

function setForeignKeysPragma() {
  db.run('PRAGMA foreign_keys = true;');
}

function truncateEverything(callback) {
  // There isn't a truncate?  This is close enough.
  var stmt = 'DELETE FROM ';
  // Order matters!  Foreign key constraints.
  var tables = [
    TABLE_FILE_CLASS,
    TABLE_DIR_CLASS,
    TABLE_FILE_ISSUES,
    TABLE_DIR_ISSUES,
    TABLE_DIRS,
    TABLE_FILES,
  ];
  setForeignKeysPragma();

  db.serialize(function() {
    tables.forEach(function(tableName) {
      db.run(stmt + tableName + ';', [], function(err) {
        if (err) {
          throw new Error("Failed to truncate everything:" + err);
        }
      });
    });
    db.run('VACUUUM', [], function() {
      if (callback) {
        callback();
      }
    });
  });
}

function storeDirectory(id, parentId, remoteId, fullPath, name, onDoneCallback) {
  var mainTable = TABLE_DIRS;
  var updateParams = {
    $id: id,
    $parentId: parentId,
    $remoteId: remoteId,
    $path: fullPath,
    $name: name
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Sys_Id_Num, Parent_Id, Remote_Id, Full_Path, Name) VALUES ($id, $parentId, $remoteId, $path, $name);';
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
    if (err) {
      throw new Error("Db.store error: " + err);
    }
    if (onDoneCallback) {
      onDoneCallback();
    }
  });
}

function storeFile(localFolderId, fullPath, name, onDoneCallback) {
  var mainTable = TABLE_FILES;
  var updateParams = {
    $folderId: localFolderId,
    $path: fullPath,
    $name: name
  };
  var updateStr = 'INSERT OR REPLACE INTO ';
  var valuesStr = ' (Folder_Id, Full_Path, Name) VALUES ($folderId, $path, $name);';
  setForeignKeysPragma();

  db.run(updateStr + mainTable + valuesStr, updateParams, function(err) {
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

function loadDirContents(dirId, what, callback) {
  console.log("loadDirContents", dirId);
  switch(what) {
    case 'dir':
      loadDirsWithParent(dirId, callback);
      break;
    default:
      throw new Error("loadDirContents: unrecognized type.  (" + what + ")");
      break;
  }
}

function loadDirsWithParent(dirId, callback) {
  var stmt = 'SELECT * FROM ' + TABLE_DIRS + ' d INNER JOIN ' + TABLE_DIR_CLASS + ' dc ';
  stmt += 'ON d.Sys_Id_Num = dc.Dir_Id ';
  stmt += 'INNER JOIN ' + TABLE_DIR_ISSUES + ' di ';
  stmt += 'ON d.Sys_Id_Num = di.DirId';

  stmt += ' WHERE d.Parent_Id = $id'
  var params = {$id:dirId };

  console.log("loadDirsWithParent", dirId);

  db.all(stmt, params, function(err, rows) {
    if (err) {
      console.error("DirId: ", dirId);
      throw new Error("Db.loadDirs error: " + err);
    }
    console.log("done with parent", rows);
    if (callback) {callback(rows);}
  });
}

function loadSingleDir(dirId, onFinish) {
  var stmt = 'SELECT * FROM ' + TABLE_DIRS + ' d INNER JOIN ' + TABLE_DIR_CLASS + ' dc ';
  stmt += 'ON d.Sys_Id_Num = dc.Dir_Id ';
  stmt += 'INNER JOIN ' + TABLE_DIR_ISSUES + ' di ';
  stmt += 'ON d.Sys_Id_Num = di.DirId';

  stmt += ' WHERE d.Sys_Id_Num = ' + dirId;

  db.get(stmt, [], function(err, row) {
    if (err) {
      console.log("info searching", dirId);
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
      console.log("first step");
      db.get(countQuery, function(err, row) {
        if (err) {
          throw new Error("Db.loadIncompleteProgress error: " + err);
        }

        console.log("count row?", row['COUNT(*)']);
        totalProgressRows = row['COUNT(*)'];
        callback();
      });
    },
    function(callback) {
      console.log("next step");
      db.get(query + where, function(err, row) {
        if (err) {
          throw new Error("Db.loadIncompleteProgress error: " + err);
        }
        result = row;
        callback.call(this, row);
      });
    },
  ], function() {
    console.log("done");
    if (totalProgressRows == 0) {
      result = false;
    }
    if (onFinish) {
      console.log("calling finish");
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

FilesDb.startOver = function(callback) {
  truncateEverything(callback);
};

//TODO: Figure out a way to make this more like a transaction, since we have multiple statements to complete.
FilesDb.store = function(type, classification, itemInfo, doneCallback) {
  var mainTable;
  var classTable;
  var updateParams = [];
  var tasks = 0;
  switch (type) {
    case 'dir':
      async.series([
        function(callback) {
          storeDirectory(itemInfo.localId, itemInfo.parentId, itemInfo.remoteId, itemInfo.pathStr, itemInfo.name, callback);
        },
        function(callback) {
          storeDirIssues(itemInfo.localId, itemInfo.issues, callback);
        },
        function(callback) {
          storeDirClass(classification, itemInfo.localId, callback);
        }
      ], function() {console.log("DONE DOING THE STORAGE"); doneCallback()});
      break;
    case 'file':
      async.series([
        function(callback) {
          storeFile(itemInfo.localFolderId, itemInfo.pathStr, itemInfo.name, callback);
        },
        function(callback) {
          storeFileIssues(itemInfo.localFolderId, itemInfo.name, itemInfo.issues, callback);
        },
        function(callback) {
          storeFileClass(classification, itemInfo.localFolderId, itemInfo.name, callback);
        }
      ], function() {console.log("DONE DOING THE STORAGE"); doneCallback()});
      break;
    default:
      throw Error("FilesDb.store::: Invalid type.");
  }
};

FilesDb.loadSingleDirProgress = function(callback) {
  loadIncompleteProgress('dir', function(row) {
    console.log("load single progress", row);
    if (row.Dir_Id) {
      loadSingleDir(row.Dir_Id, callback);
    } else {
      callback(row);
    }
  });
}

FilesDb.loadAll = function(type, classification, callback) {
  switch(type) {
    case 'file':
      db.serialize(function() {
        loadFiles(classification, callback);
      });
      break;
    case 'dir':
      db.serialize(function() {
        loadDirs(classification, callback);
      });
      break;
  }
};

FilesDb.loadRemoteIdForDir = function(dirId, doneCallback) {
  loadSingleDir(dirId, function(row) {
    doneCallback(row.Remote_Id);
  });
};

FilesDb.loadDirsFrom = function(dirId, doneCallback) {
  loadDirContents(dirId, 'dir', doneCallback);
};

FilesDb.storeDirProgress = function(dir, value, callback) {
  storeDirectoryProgress(dir, value, callback);
}


