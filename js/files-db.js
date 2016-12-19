'use strict';
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('files-db.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

var TABLE_DIRS = 'Directories';
var TABLE_FILES = 'Files';
var TABLE_DIR_ISSUES = 'Directory_Issues';
var TABLE_DIR_CLASS = 'Directory_Class';
var TABLE_FILE_ISSUES = 'File_Issues';
var TABLE_FILE_CLASS = 'File_Class';
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
  var totalTruncs = tables.length;
  setForeignKeysPragma();
  tables.forEach(function(tableName) {
    db.run(stmt + tableName + ';', [], function(err) {
      if (err) {
        throw new Error("Failed to truncate everything:" + err);
      }
      totalTruncs -= 1;
      if (totalTruncs <= 0) {
        console.log("Done truncating");
        callback();
      }
    });
  });
}

function storeDirectory(id, parentId, remoteId, fullPath, name) {
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

    /*console.log("lastId", this.lastID);
    console.log("changes", this.changes); */

  });
}

function storeFile(localFolderId, fullPath, name) {
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

    /*console.log("lastId", this.lastID);
     console.log("changes", this.changes); */

  });
}

function storeDirIssues(idNum, issueArr) {
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

    /*console.log("lastId", this.lastID);
    console.log("changes", this.changes); */

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

function storeDirClass(classification, dirId) {
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

    /*console.log("lastId", this.lastID);
     console.log("changes", this.changes); */

  });
}

/* function FileInfo (opts) {
 this.localFolderId = opts.localFolderId;
 this.pathStr = opts.path;
 this.name = opts.name;
 this.issues = opts.problems;
 this.line = opts.line;
 }; */

FilesDb.startOver = function(callback) {
  truncateEverything(callback);
};

//TODO: Figure out a way to make this more like a transaction, since we have multiple statements to complete.
FilesDb.store = function(type, classification, itemInfo) {
  var mainTable;
  var classTable;
  var updateParams = [];
  switch(type) {
    case 'dir':
      storeDirectory(itemInfo.localId, itemInfo.parentId, itemInfo.remoteId, itemInfo.pathStr, itemInfo.name);
      storeDirIssues(itemInfo.localId, itemInfo.issues);
      storeDirClass(classification, itemInfo.localId);
      break;
    case 'file':
      storeFile(itemInfo.localFolderId, itemInfo.pathStr, itemInfo.name);
      break;
    default:
      throw Error("FilesDb.store::: Invalid type.");
  }
};


