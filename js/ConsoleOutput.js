var ProgressBar = require('progress');

var RENDER_INTERVAL_MS = 1000;

var ConsoleOutput = module.exports;

var outputStream = process.stdout;

var dirty = true;
var active = false;
var renderTimer;
var uploadStart = 0;
var displayTime = 0;

var validStats = {
  time: 0,
  vFiles: 0,
  vDirs: 0,
  iDirs: 0,
  iFiles: 0,
  totalCt: 0,
  savedCt: 0,
  bytesDone: 0,
  totalBytes: 0,
  readingStr: '',
  storingStr: ''
};

var uploadStats = {
  time: 0,
  tfiles: 0,
  tDirs: 0,
  sFiles: 0,
  sDirs: 0,
  fDirs: 0,
  fFiles: 0,
  fixedDirs: 0,
  fixedFiles: 0,
  bytes: 0,
  totalBytes: 1978095314944, //Hardcoded for now.
  uploadingStr: '',
  totalUploads: ''
};

var lastStrRendered = '';

var IDX_DIR = 0;

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

function setupRenderInterval(type) {

  switch(type) {
    case 'validate':
      renderTimer = setInterval(renderValidation, 1000);
      break;
    case 'upload':
      renderTimer = setInterval(renderUploading, 1000);
      break;
  }
}

function getEta() {
  var ratio = uploadStats.bytes / uploadStats.totalBytes;
  ratio = Math.min(Math.max(ratio, 0), 1);

  var percent = ratio * 100;
  var elapsed = new Date - uploadStart;
  return (percent == 100) ? 0 : elapsed * (uploadStats.totalBytes / uploadStats.bytes - 1);
}

function renderValidation() {
  if (!dirty || !active) {
    return;
  }
  if (Date.now() - displayTime < RENDER_INTERVAL_MS) {
    return;
  }
  outputStream.write('\x1Bc');

  outputStream.write('Valid Files: ' + validStats.vFiles + '\n');
  outputStream.write('Valid Dirs: ' + validStats.vDirs + '\n');
  outputStream.write('Invalid Dirs: ' + validStats.iDirs + '\n');
  outputStream.write('Invalid Files: ' + validStats.iFiles + '\n');
  outputStream.write('Bytes discovered: ' + validStats.bytes + '\n');

  outputStream.write('\n\n');

  outputStream.write('Reading... (#' + validStats.totalCt + '): ' + validStats.readingStr + '\n');
  outputStream.write('Saved... (#' + validStats.savedCt + '/' + validStats.totalCt + '): ' + validStats.storingStr + '\n');

  outputStream.write('Duration: ' + validStats.time + '\n');

  dirty = false;
  displayTime = Date.now();
}

function renderUploading() {
  return;
  if (!dirty || !active) {
    return;
  }
  if (Date.now() - displayTime < RENDER_INTERVAL_MS) {
    return;
  }

  var eta = getEta();

  outputStream.write('\x1Bc');
  outputStream.write('Uploading Files\n');
  outputStream.write('\n\n');

  outputStream.write('Finished Files: ' + uploadStats.sFiles + '\n');
  outputStream.write('Finished Dirs: ' + uploadStats.sDirs + '\n');
  outputStream.write('Failed Dirs (unhandled): ' + uploadStats.fDirs + '\n');
  outputStream.write('Failed Dirs (auto-fixed): ' + uploadStats.fixedDirs + '\n');
  outputStream.write('Failed Files: ' + uploadStats.fFiles + '\n');
  outputStream.write('Uploaded (bytes): ' + uploadStats.bytes + ' / ' + uploadStats.totalBytes + '\n');
  outputStream.write('Duration (s): ' + (Date.now() - uploadStart) + '\n');
  outputStream.write('ETA: ' + eta + '\n');

  dirty = false;
  displayTime = Date.now();
}

ConsoleOutput.startDisplay = function(displayName) {
  switch(displayName) {
    case 'validate':
      active = true;
      renderValidation();
      displayTime = Date.now();
      setupRenderInterval();
      break;
    case 'upload':
      active = true;
      renderUploading();
      displayTime = Date.now();
      setupRenderInterval();
      break;
    default:
      throw new Error("Unrecognized display request.");
  }
};

ConsoleOutput.stopDisplay = function() {
  clearInterval(renderTimer);
  active = false;
};

ConsoleOutput.setReading = function (str) {
  if (str === validStats.readingStr) {
    return;
  }
  validStats.readingStr = str;
  dirty = true;
  renderValidation();
};

ConsoleOutput.setStoring = function (str) {
  if (str === validStats.storingStr) {
    return;
  }
  validStats.storingStr = str;
  dirty = true;
  renderValidation();
};

ConsoleOutput.setStats = function (stats) {
  var needsRender = false;
  for (var attrname in stats) {
    if (validStats[attrname] !== stats[attrname]) {
      needsRender = true;
      validStats[attrname] = stats[attrname];
    }
  }
  if (needsRender) {
    dirty = true;
    renderValidation();
  }
};

ConsoleOutput.updateUploading = function(stats) {
  var needsRender = false;
  for (var attrname in stats) {
    if (uploadStats[attrname] !== stats[attrname]) {
      needsRender = true;
      uploadStats[attrname] = stats[attrname];
    }
  }
  if (needsRender) {
    dirty = true;
    renderUploading();
  }
}


ConsoleOutput.getStrWidth = function() {
  return outputStream.columns;
};

process.on('SIGINT', function() {
  console.warn("Caught interrupt signal, trying to stop UI.");
  ConsoleOutput.stopDisplay();
});


