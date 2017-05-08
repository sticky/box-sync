'use strict;'

function DirInfo (opts) {
  this.localId = opts.inode;
  this.parentId = opts.parent;
  this.remoteId = opts.remote;
  this.pathStr = opts.path;
  this.name = opts.name;
  this.issues = opts.problems;
  this.line = opts.line;
  this.updated = opts.updated;
  this.created = opts.created;
}

DirInfo.prototype.duplicate = function() {
  return new DirInfo({
    inode: this.localId,
    parent: this.parentId,
    remote: this.remoteId,
    path: this.pathStr,
    name: this.name,
    problems: this.issues,
    line: this.line,
    updated: this.updated,
    created: this.created
  });
};

module.exports = DirInfo;
