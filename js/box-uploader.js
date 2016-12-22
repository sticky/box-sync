'use strict';

var fs = require('fs');
var BoxSDK = require('box-node-sdk');
var async = require('async');

var clientID = require('../files/tokens.env').clientID;
var developerToken = require('../files/tokens.env').developerToken;
var clientSecret = require('../files/tokens.env').clientSecret;

function putFolderOnBox(dir, itemComplete, doneCallback) {
  // We have a directory, but now we need to figure out the Box.com ID we
  // need to make a folder in.
  var self = this;

  if (dir.issues.length !== 0) {
    console.log("BAD DIR, SHOULD NOT SYNC", dir.localId);
    doneCallback();
    return;
  }
  var info = {remoteId: 0, dirId: dir.parentId};
  async.series([
    function(callback) {
      findDirParentRemote(self.rootId, self.diskState, info, callback);
    },
    function(callback) {
      self.client.folders.create(info.remoteId, dir.name, function(err, response) {
        itemComplete(dir, err, response, callback);
      });
    },
  ], function(err) {
    doneCallback(err);
  });
}

function putFileOnBox(file, itemComplete, doneCallback) {
  var self = this;
  if (file.issues.length !== 0) {
    console.log("BAD FILE, SHOULD NOT SYNC", file.localFolderId);
    doneCallback();
    return;
  }

  var info = {dirRemoteId: 0, dirId: file.localFolderId};
  async.series([
    function(callback) {
      findRemoteIdForDirId(self.diskState, info, callback);
    },
    function(callback) {
      var stream = fs.createReadStream(file.pathStr + file.name);
      self.client.files.uploadFile(info.dirRemoteId, file.name, stream, function(err, response) {
        itemComplete(dir, err, response, callback);
      });
    },
  ], function(err) {
    doneCallback(err);
  });

  doneCallback();
}

function findDirParentRemote(rootId, diskState, searchInfo, callback) {
  // Are we at the bottom level of our folder tree?
  if (!searchInfo.dirId || searchInfo.dirId === 'noparent') {
    searchInfo.remoteId = rootId;
    callback();
  } else {
    // Guess we need to find our parent.
    diskState.getRemoteDirId(searchInfo, callback);
  }
}

function findRemoteIdForDirId(rootId, diskState, searchInfo, callback) {
  if (!searchInfo.dirId || searchInfo.dirId === 'noparent') {
    searchInfo.dirRemoteId = rootId;
    callback();
  } else {
    // Guess we need to find our parent.
    diskState.getRemoteDirId(searchInfo, callback);
  }
}

function BoxUploader(diskState, rootRemoteId) {

  this.sdk = new BoxSDK({
    clientID: clientID,
    clientSecret: clientSecret
  });

  this.client = this.sdk.getBasicClient(developerToken);
  this.diskState = diskState;
  this.rootId = rootRemoteId;
}

BoxUploader.prototype.makeDir = function(dir, onFolderComplete, callback) {
  putFolderOnBox.call(this, dir, onFolderComplete, callback);
}
BoxUploader.prototype.makeFile = function(file, onFileComplete, callback) {
  putFileOnBox.call(this, file, onFileComplete, callback);
}

module.exports = BoxUploader;
