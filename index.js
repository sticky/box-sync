#!/usr/bin/env node
'use strict';
var fs = require('fs');
var program = require('commander');
var ProgressBar = require('progress');
var BoxSDK = require('box-node-sdk');
var clientID = require('./tokens.env').clientID;
var developerToken = require('./tokens.env').developerToken;
var clientSecret = require('./tokens.env').clientSecret;
var fields = 'name,size,sync_state';

var validator = require('./js/filename-validator');

var outputStream = process.stdout;
var lastStrRendered = '';
var sdk = new BoxSDK({
  clientID: clientID,
  clientSecret: clientSecret
});

// Create a basic API client
var client = sdk.getBasicClient(developerToken);

// File descriptors
var badCharFd;
var validFiles;
var processedFiles;

var fileBar = new ProgressBar('  uploading [:name] [:bar] :rate/bps :percent :etas', {
  width: 10,
  clear: true,
  total: 0
});
var overallBar = new ProgressBar('  progress [:bar] :rate/bps :percent :etas', {
  width: 10,
  clear: true,
  total: 0
});

program
  .version('0.0.1')
  .arguments('<local-dir> <box-folder>')
  .action(function(source, dest) {

    badCharFd = fs.openSync('BadFiles.txt', 'w');
    validFiles = fs.openSync('GoodFiles.txt', 'w');
    processedFiles = fs.openSync('GoodFiles.txt', 'w');

    validator.categorizeDirectoryContents(source, {fd: badCharFd, onDirectoryStart: onDirectoryStarted}, true);

    writeGoodFiles(validFiles);

    uploadFiles(validator.getFiles());

    outputStream.write('\n');
    var stats = validator.getStats();
    console.log("# validFiles", stats.validCount);
    console.log("# bad file lengths", stats.badCounts.long);
    console.log("# bad file chars", stats.badCounts.unprintable);
    console.log("# bad whitespace", stats.badCounts.spaces);
    console.log("# bytes", stats.bytes);

    fs.closeSync(badCharFd);

  })
  .parse(process.argv);

function writeGoodFiles(files) {
  console.log("Unimplemented: Writing the files to process to a list.");
}


function onDirectoryStarted(path) {
  var progressStr = formatPathProgress(path, outputStream);
  if (lastStrRendered !== progressStr) {
    outputStream.cursorTo(0);
    outputStream.write(progressStr);
    outputStream.clearLine(1);
    lastStrRendered = progressStr;
  }
}

function formatPathProgress(path, stream) {
  var label = "Reading ";
  var pathStart;
  var pathEnd;

  outputStream.columns;

  pathStart = path.substring(0, outputStream.columns / 3);
  pathEnd = path.substring(path.length - outputStream.columns / 3, path.length);

  return label + pathStart + '...' + pathEnd;
}

function uploadFiles(uploadFileList) {
  uploadFileList.forEach(uploadFile);
}

function uploadFile(fileInfo) {
  var name = fileInfo.file;
  var path = fileInfo.path;
  var fullPath = path + '/' + name;
  console.log(path + name);
  var stream = fs.createReadStream(fullPath);
  var filestat = fs.statSync(fullPath);
  var fileSize = filestat.size;

  var folderId = 14324972774;
  fileBar.total = fileSize;
  fileBar.tick(0);

  //client.files.preflightUploadFile('' + folderId, {name: name, size: 10000}, null, onPreFileComplete);
  console.log("name", name);
  client.files.uploadFile('' + folderId, name, stream, onPreFileComplete);

  stream.on('data', function(chunk) {
    fileBar.tick(chunk.length);
  });
}

function onPreFileComplete(error, response) {
  if (error) {
    console.log("error status code:", error.statusCode);
    console.log("error message:", error.message);
    //console.log("error response:", error.response);
  }
  if (response) {
    console.log(response);
  }
}






