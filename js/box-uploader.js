'use strict';

var fs = require('fs');
var BoxSDK = require('box-node-sdk');
var async = require('async');
var Util = require('./util');

var clientID = require('../files/tokens.env').clientID;
var clientSecret = require('../files/tokens.env').clientSecret;

var tokenInfo = {
  accessToken: require('../files/tokens.env').accessToken,
  refreshToken: require('../files/tokens.env').refreshToken,
  accessTokenTTLMS: require('../files/tokens.env').tokenExpires,
  acquiredAtMS: require('../files/tokens.env').tokenRequestedAt,
}

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
    }
  ], function(err) {
    doneCallback(err);
  });
}

function putFileOnBox(file, streamHandlers, itemComplete, doneCallback) {
  var self = this;
  var fullFileName = file.pathStr + '/' + file.name;
  var fsStat = fs.statSync(fullFileName);
  var ctime = new Date(fsStat.ctime);
  var mtime = new Date(fsStat.mtime);

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
          itemComplete(file, err, response, callback);
        } else {
          preCheckGood = true;
          callback();
        }
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

      stream.on('data', streamHandlers.data);
      self.client.files.uploadFile(info.remoteId, file.name, {'content_created_at': Util.dateToBoxDateString(ctime), 'content_modified_at': Util.dateToBoxDateString(mtime) }, stream, function(err, response) {
        itemComplete(file, err, response, callback);
      });
    },
  ], function(err) {
    doneCallback(err);
  });
}

function getFileInfo(file, query, doneCallback) {
  var self = this;
  var info;
  async.series([
    function(cb) {
      self.client.files.get(file.remoteId, query, function(err, response) {
        info = response;
        cb(err);
      });
    },
  ], function(err) {
    doneCallback(err, info);
  });
}

function getBoxFolderContents(boxId, offset, callback) {
  var qs = {
    offset: offset ? offset: 0,
    fields: 'name'
  };
  this.client.folders.getItems(boxId, qs, callback);
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

  this.client = this.sdk.getPersistentClient(tokenInfo);
  this.diskState = diskState;
  this.rootId = rootRemoteId;

  hackTheFileManager(this.client.files);
}

BoxUploader.prototype.makeDir = function(dir, onFolderComplete, callback) {
  putFolderOnBox.call(this, dir, onFolderComplete, callback);
};
BoxUploader.prototype.makeFile = function(file, streamHandlers, onFileComplete, callback) {
  putFileOnBox.call(this, file, streamHandlers, onFileComplete, callback);
};
BoxUploader.prototype.getDirContents = function(boxId, offset, callback) {
  getBoxFolderContents.call(this, boxId, offset, callback);
};
BoxUploader.prototype.getFileInfo = function(file, query, callback) {
  getFileInfo.call(this, file, query, callback);
};

module.exports = BoxUploader;

// This is a big messy hacky pile of nonsense and I'm not sure why this turned out necessary.
// It doesn't seem like a big challenge to handle additional parameters during an upload, but they're not supporting
// it via the SDK.  Seems like a really important feature, too!
function hackTheFileManager(fileManager) {
  /**
   * Returns the multipart form value for file upload metadata.
   * @param {string} parentFolderID - the ID of the parent folder to upload to
   * @param {string} filename - the file name that the uploaded file should have
   * @returns {Object} - the form value expected by the API for the 'metadata' key
   * @private
   */
  function createFileMetadataFormData(parentFolderID, filename, createdAt, modifiedAt) {
    // Although the filename and parent folder ID can be specified without using a
    // metadata form field, Platform has recommended that we use the metadata form
    // field to specify these parameters (one benefit is that UTF-8 characters can
    // be specified in the filename).
    return JSON.stringify({
      name: filename,
      parent: { id: parentFolderID },
      content_created_at: createdAt,
      content_modified_at: modifiedAt,
    });
  }

  /**
   * Returns the multipart form value for file upload content.
   * @param {string|Buffer|Stream} content - the content of the file being uploaded
   * @returns {Object} - the form value expected by the API for the 'content' key
   * @private
   */
  function createFileContentFormData(content) {
    // The upload API appears to look for a form field that contains a filename
    // property and assume that this form field contains the file content. Thus,
    // the value of name does not actually matter (as long as it does not conflict
    // with other field names). Similarly, the value of options.filename does not
    // matter either (as long as it exists), since the upload API will use the
    // filename specified in the metadata form field instead.
    return {
      value: content,
      options: { filename: 'unused' }
    };
  }

  // TODO: Write a "Better file uploader" plugin and use that instead of this really bad approach.
  fileManager.uploadFile = function(parentFolderID, filename, params, content, callback) {
    var apiPath = '/files/content',
      multipartFormData = {
        attributes: createFileMetadataFormData(parentFolderID, filename, params.content_created_at, params.content_modified_at),
        content: createFileContentFormData(content)
      };
    this.client.upload(apiPath, params, multipartFormData, this.client.defaultResponseHandler(callback));
  };
}
