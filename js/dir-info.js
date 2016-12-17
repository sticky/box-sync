
function DirInfo (opts) {
  this.localId = opts.inode;
  this.parentId = opts.parent;
  this.remoteId = opts.remote;
  this.pathStr = opts.path;
  this.name = opts.name;
  this.issues = opts.problems;
  this.line = opts.line;
};

module.exports = DirInfo;

DirInfo.SEP = ':::';

DirInfo.prototype.str = function() {
  return this.localId + DirInfo.SEP + this.parentId + DirInfo.SEP + this.remoteId + DirInfo.SEP + this.pathStr + DirInfo.SEP + this.name;
};

DirInfo.FromStr = function(string) {
  var chunks = string.split(DirInfo.SEP);

  if (chunks.length < 5) {
    console.error("Line in file has wrong chunk count.", chunks.length);
    return;
  }

  return new DirInfo({inode: chunks[0], parent: chunks[1], remote: chunks[2], path: chunks[3], name: chunks[4]});
};
