var ConsoleOutput = require('./ConsoleOutput');

var processedFiles = [];
var activeFiles = [];
var activeDirs = [];
var finishedCount = 0;
var totalCount = 0;

// Each element of this failure array should be: {file: file object, reason: reason for failure string }
var failures = [];
var MAX_ACTIVE_DISPLAYED = 3;
var MAX_FAILED_DISPLAYED = 5;

var VerifyUploadsUi = {
  start: function() {
    processedFiles = [];
    activeFiles = [];
    finishedCount = 0;
    totalCount = 0;
    failures = [];
    ConsoleOutput.setRenderer(renderVerification);
    ConsoleOutput.startDisplay('custom');
  },
  startingDir: function(dir) {
    activeDirs.push(dir);
    ConsoleOutput.wasUpdated();
  },
  startingFile: function(file) {
    activeFiles.push(file);
    ConsoleOutput.wasUpdated();
  },
  finishedDir: function(dir) {
    removeFromArray(activeDirs, dir);
    finishedCount += 1;
    ConsoleOutput.wasUpdated();
  },
  finishedFile: function(file) {
    removeFromArray(activeFiles, file);
    finishedCount += 1;
    ConsoleOutput.wasUpdated();
  },
  failedDir: function(dir, reason) {
    removeFromArray(activeDirs, dir);
    failures.push({obj: dir, reason: reason});
  },
  failedFile: function(file, reason) {
    removeFromArray(activeFiles, file);
    failures.push({obj: file, reason: reason});
  },
  stop: function() {
    console.log("stopping");
    ConsoleOutput.stopDisplay();
  }
};

function removeFromArray(array, obj) {
  var idx = array.indexOf(obj);
  if (idx > -1) {
    array.splice(idx, 1);
  }
}

function renderVerification(oStream) {
  return;
  oStream.write('\x1Bc');
  oStream.write('Verifying Uploads\n');
  oStream.write('\n\n');

  oStream.write('Progress: ' + finishedCount + '/' + totalCount + '\n');
  oStream.write('Processing: ');

  for(var i = 0; i < activeDirs.length && i <= MAX_ACTIVE_DISPLAYED; ++i) {
    oStream.write('\n' + ' (Dir)  ' + activeDirs[i].pathStr + '/' + activeDirs[i].name);
  }

  for(var j = 0; j < activeFiles.length && i + j <= MAX_ACTIVE_DISPLAYED; ++j) {
    oStream.write('\n' + '  (File)  ' + activeFiles[j].pathStr + '/' + activeFiles[j].name);
  }

  // Consistent spacing between the active list and the potentially longer failed list.
  for (var k = i + j; k <= MAX_ACTIVE_DISPLAYED; ++k) {
    oStream.write('\n');
  }

  oStream.write('Failed: (' + failures.length + ' objects)');
  for(var o = 0; o < failures.length; ++o) {
    oStream.write('\n' + '      ' + failures[o].obj.pathStr + '/' + failures[o].obj.name + ' Issue: ' + failures[o].reason);
  }
}

module.exports = VerifyUploadsUi;
