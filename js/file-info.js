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

module.exports = FileInfo;
