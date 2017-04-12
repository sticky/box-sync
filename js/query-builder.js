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


var DIR_INSERT = 'INSERT OR REPLACE INTO ' + TABLE_DIRS + '(Sys_Id_Num, Parent_Id, Remote_Id, Full_Path, Name, Created, Updated) VALUES ($id, $parentId, $remoteId, $path, $name, $created, $updated;';
var FILE_INSERT = 'INSERT OR REPLACE INTO ' + TABLE_FILES + ' (Folder_Id, Full_Path, Name, Remote_Id, Created, Updated, Hash) VALUES ($folderId, $path, $name, $remote, $created, $updated, $hash);';
var DIR_ISSUE_INSERT = 'INSERT OR REPLACE INTO ' + TABLE_DIR_ISSUES + ' (DirId, Long, Chars, Spaces) VALUES ($id, $long, $chars, $spaces);';
var FILE_ISSUE_INSERT = 'INSERT OR REPLACE INTO ' + TABLE_FILE_ISSUES + ' (Folder_Id, File_Name, Long, Chars, Spaces) VALUES ($folder, $name, $long, $chars, $spaces);';

var COLS = {
  DIR: {
    FULL: 'd.Sys_Id_Num, d.Parent_Id, d.Remote_Id, d.Full_Path, d.Name, d.Created, d.Updated, dc.Class, de.Error_Code, de.Error_Blob, di.Long, di.Chars, di.Spaces, dp.Done'
  },
  FILE: {
    FULL: 'f.Folder_Id, f.Full_Path, f.name, f.Remote_Id, f.Created, f.Updated, f.Hash, fc.Class, fe.Error_Code, fe.Error_Blob, fi.Long, fi.Chars, fi.Spaces, fp.Done'
  }
};

var Query = {};

Query.insert = {
  dir: {
    dir: function() { return DIR_INSERT; },
    issue: function() { return DIR_ISSUE_INSERT; },
    class: function() { return 'INSERT OR REPLACE INTO ' + TABLE_DIR_CLASS + ' (Dir_Id, Class) VALUES ($id, $class);'; },
    progress: function() { return 'INSERT OR REPLACE INTO ' + TABLE_DIR_PROGRESS + ' (Dir_Id, Done) VALUES ($dir, $done);'; },
    error: function() { return 'INSERT OR REPLACE INTO ' + TABLE_DIR_ERROR + '(Dir_Id_Num, Error_Code, Error_Blob) VALUES ($dir, $num, $txt);'; }
  },
  file: {
    file: function() { return FILE_INSERT; },
    issue: function() { return FILE_ISSUE_INSERT; },
    class: function() { return 'INSERT OR REPLACE INTO ' + TABLE_FILE_CLASS + ' (Folder_Id, File_Name, Class) VALUES ($folder, $name, $class);'; },
    progress: function() { return 'INSERT OR REPLACE INTO ' + TABLE_FILE_PROGRESS + ' (Folder_Id, Name, Done) VALUES ($id, $name, $done);'; },
    error: function() { return 'INSERT OR REPLACE INTO ' + TABLE_FILE_ERROR + ' (Folder_Id, Name, Error_Code, Error_Blob) VALUES ($dir, $name, $num, $txt);'; }
  },
  issue: {
    issue: function() { return DIR_ISSUE_INSERT}
  },
  var: {
    var: function() { return 'INSERT OR REPLACE INTO ' +  TABLE_VARS + '(Name, Value) VALUES ($name, $val);' }
  }
};

Query.load = {};

Query.load.dir = {
  full: function() {
    var stmt = 'SELECT ' + COLS.DIR.FULL + ' FROM ' + TABLE_DIRS + ' d LEFT JOIN ' + TABLE_DIR_CLASS + ' dc ';
    stmt += 'ON d.Sys_Id_Num = dc.Dir_Id ';
    stmt += 'LEFT JOIN ' + TABLE_DIR_ISSUES + ' di ';
    stmt += 'ON d.Sys_Id_Num = di.DirId ';
    stmt += 'LEFT JOIN ' + TABLE_DIR_PROGRESS + ' dp ';
    stmt += 'ON d.Sys_Id_Num = dp.Dir_Id ';
    stmt += 'LEFT JOIN ' + TABLE_DIR_ERROR + ' de ';
    stmt += 'ON d.Sys_Id_Num = de.Dir_Id_Num';

    return stmt;
  },
  dir: function(colsStr) {
    var stmt;
    if (!colsStr) {
      colsStr = '*';
    }
    stmt = 'SELECT ' + colsStr + ' FROM ' + TABLE_DIRS + ' d INNER JOIN ' + TABLE_DIR_CLASS + ' dc ';
    stmt += 'ON d.Sys_Id_Num = dc.Dir_Id ';
    stmt += 'INNER JOIN ' + TABLE_DIR_ISSUES + ' di ';
    stmt += 'ON d.Sys_Id_Num = di.DirId';

    return stmt;
  },
  progress: function(colsStr) {
    var stmt;
    if (!colsStr) {
      colsStr = '*';
    }
    stmt = 'SELECT ' + colsStr + ' FROM ' + TABLE_DIR_PROGRESS;
    return stmt;
  }
};

Query.load.file = {
  full: function() {
    var stmt = 'SELECT ' + COLS.FILE.FULL + ' FROM ' + TABLE_FILES + ' f LEFT JOIN ' + TABLE_FILE_CLASS + ' fc ';
    stmt += 'ON f.Folder_Id = fc.Folder_Id AND f.Name = fc.File_Name ';
    stmt += 'LEFT JOIN ' + TABLE_FILE_ISSUES + ' fi ';
    stmt += 'ON f.Folder_Id = fi.Folder_Id AND f.Name = fi.File_Name ';
    stmt += 'LEFT JOIN ' + TABLE_FILE_PROGRESS + ' fp ';
    stmt += 'ON f.Folder_Id = fp.Folder_Id AND f.Name = fp.Name ';
    stmt += 'LEFT JOIN ' + TABLE_FILE_ERROR + ' fe ';
    stmt += 'ON f.Folder_Id = fe.Folder_Id AND f.Name = fe.Name';

    return stmt;
  },
  file: function(colsStr) {
    var stmt;
    if (!colsStr) {
      colsStr = '*';
    }
    stmt = 'SELECT ' + colsStr + ' FROM ' + TABLE_FILES + ' f INNER JOIN ' + TABLE_FILE_CLASS + ' fc ';
    stmt += 'ON f.Folder_Id = fc.Folder_Id AND f.Name = fc.File_Name ';
    stmt += 'INNER JOIN ' + TABLE_FILE_ISSUES + ' fi ';
    stmt += 'ON f.Folder_Id = fi.Folder_Id AND f.Name = fi.File_Name ';

    return stmt;
  },
  progress: function(colsStr) {
    var stmt;
    if (!colsStr) {
      colsStr = '*';
    }
    stmt = 'SELECT ' + colsStr + ' FROM ' + TABLE_FILE_PROGRESS;
    return stmt;
  }
};

Query.load.var = {
  var: function(colsStr) {
    var stmt;
    if (!colsStr) {
      colsStr = '*';
    }
    return 'SELECT ' + colsStr + ' FROM ' + TABLE_VARS;
  },
};

Query.delete = {};

Query.delete.dir = {
  error: function() {
    return 'DELETE FROM ' + TABLE_DIR_ERROR + ' WHERE Dir_Id_Num IS $dirNum;'
  }
};
Query.delete.file = {
  error: function() {
    return 'DELETE FROM ' + TABLE_FILE_ERROR + ' WHERE Folder_Id IS $folderId AND Name IS $name;'
  }
};

Query.tables = {};
Query.tables.all = function() {
  return[
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
};

Query.tables.progress = function() {
  return [
    TABLE_DIR_PROGRESS,
    TABLE_FILE_PROGRESS];
};

Query.tables.errors = function() {
  return [
    TABLE_DIR_ERROR,
    TABLE_FILE_ERROR];
};

Query.count = {};
Query.count.dir = {
  progress: function() {
    return 'SELECT COUNT(*) FROM ' + TABLE_DIR_PROGRESS;
  }
};

Query.count.file = {
  progress: function() {
    return 'SELECT COUNT (*) FROM ' + TABLE_FILE_PROGRESS;
  }
};


module.exports = Query;
