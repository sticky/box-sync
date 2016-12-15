

function FileInfo (opts) {
  this.localFolderId = opts.localFolderId;
  this.pathStr = opts.path;
  this.name = opts.name;
  this.issues = opts.problems;
};

module.exports = FileInfo;

FileInfo.SEP = ':::';

FileInfo.prototype.str = function() {
  return this.pathStr + FileInfo.SEP + this.localFolderId + FileInfo.SEP + this.name;
};
