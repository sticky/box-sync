'use strict';
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('files-db.sqlite');

var TABLE_DIRS = 'Directories';
var TABLE_FILES = 'Files';
var DIR_ISSUES = 'Dir_Issues';
var FILE_ISSUES = 'File_Issues';
var TABLE_BAD_DIRS = 'Bad_Directories';
var TABLE_VALID_DIRS = 'Validated_Directories';

/*db.serialize(function() {
  db.run("CREATE TABLE lorem (info TEXT)");

  var stmt = db.prepare("INSERT INTO lorem VALUES (?)");
  for (var i = 0; i < 10; i++) {
    stmt.run("Ipsum " + i);
  }
  stmt.finalize();

  db.each("SELECT rowid AS id, info FROM lorem", function(err, row) {
    console.log(row.id + ": " + row.info);
  });
}); */

var FilesDb = exports;

//TODO: Figure out a way to make this more like a transaction, since we have multiple statements to complete.
FilesDb.store = function(type, classification, sysId, parentId, remoteId, path, name, issuesStr) {
  var mainTable;
  var classTable;
  switch(type) {
    case 'dir':
      mainTable = TABLE_DIRS;
      break;
    case 'file':
      mainTable = TABLE_FILES;
      break;
    default:
      throw Error("FilesDb.store::: Invalid type.");
  }
  db.run('');
};
