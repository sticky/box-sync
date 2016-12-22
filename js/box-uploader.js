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
  var fullFileName = file.pathStr + '/' + file.name;
  var fsStat = fs.statSync(fullFileName);
  if (!fsStat.isFile()) {
    throw new Error('Uploader.putFileOnBox::: Not a file. (' + fullFileName + ')');
  }

  var info = {dirRemoteId: 0, dirId: file.localFolderId};
  var preCheckGood = false;
  async.series([
    function(callback) {
      findRemoteIdForDirId(self.rootId, self.diskState, info, callback);
    },
    // The API response doesn't happen until after a post is made.  This could mean we don't know we failed until sending a ton of data...
    function(callback) {
      // Note: only checking file name for now because it seems like any value of "size" is telling me there's no room.
      self.client.files.preflightUploadFile(info.remoteId, {'name': file.name}, null, function(err, response) {
        if (err) {
          preCheckGood = false;
          err.statusCode = 'pre-' + err.statusCode;
        } else {
          preCheckGood = true;
        }
        itemComplete(file, err, response, callback);
      });
    },
    function(callback) {
      var stream;
      if (!preCheckGood) {
        callback();
        return;
      }
      stream = fs.createReadStream(fullFileName);
      // This catches any errors that happen while creating the readable stream (usually invalid names)
      stream.on('error', function(err) {
        throw new Error("Stream error: " + err);
      });
      self.client.files.uploadFile(info.remoteId, file.name, stream, function(err, response) {
        itemComplete(file, err, response, callback);
      });
    },
  ], function(err) {
    doneCallback(err);
  });
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
