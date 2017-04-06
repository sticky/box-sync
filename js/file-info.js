'use strict;'

function FileInfo (opts) {
  this.localFolderId = opts.localFolderId;
  this.pathStr = opts.path;
  this.name = opts.name;
  this.remoteId = opts.remote;
  this.issues = opts.problems;
  this.line = opts.line;
  this.updated = opts.updated;
  this.created = opts.created;
  this.hash = opts.hash;
}

FileInfo.prototype.duplicate = function() {
  return new FileInfo({
    localFolderId: this.localFolderId,
    path: this.pathStr,
    name: this.name,
    remote: this.remoteId,
    problems: this.issues,
    line: this.line,
    updated: this.updated,
    created: this.created,
    hash: this.hash
  });
};

module.exports = FileInfo;
