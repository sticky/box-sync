'use strict';

var BoxSDK = require('box-node-sdk');
var clientID = require('../files/tokens.env').clientID;
var developerToken = require('../files/tokens.env').developerToken;
var clientSecret = require('../files/tokens.env').clientSecret;
var async = require('async');

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
  doneCallback();
}

function findDirParentRemote(rootId, diskState, searchInfo, callback) {
  // Are we at the bottom level of our folder tree?
  //console.log("search info", searchInfo);
  if (!searchInfo.dirId || searchInfo.dirId === 'noparent') {
    searchInfo.remoteId = rootId;
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
  callback();
  return;
  putFileOnBox(this, file, callback);
}

module.exports = BoxUploader;
