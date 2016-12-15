
function DirInfo (opts) {
  this.localId = opts.inode;
  this.parentId = opts.parent;
  this.remoteId = 'unknown';
  this.pathStr = opts.path;
  this.name = opts.name;
  this.issues = opts.problems;
};

module.exports = DirInfo;

DirInfo.SEP = ':::';

DirInfo.prototype.str = function() {
  return this.localId + DirInfo.SEP + this.parentId + DirInfo.SEP + this.remoteId + DirInfo.SEP + this.pathStr + DirInfo.SEP + this.name;
};
