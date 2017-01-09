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

module.exports = DirInfo;
