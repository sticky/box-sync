var ProgressBar = require('progress');

var ConsoleOutput = module.exports;

var outputStream = process.stdout;

var validStats = {
  time: 0,
  vFiles: 0,
  vDirs: 0,
  iDirs: 0,
  iFiles: 0,
  totalCt: 0,
  savedCt: 0,
  bytes: 0,
  readingStr: '',
  storingStr: ''
}

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

function renderValidation() {
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
}

ConsoleOutput.setReading = function (str) {
  if (str === validStats.readingStr) {
    return;
  }
  validStats.readingStr = str;
  renderValidation();
}

ConsoleOutput.setStoring = function (str) {
  if (str === validStats.storingStr) {
    return;
  }
  validStats.storingStr = str;
  renderValidation();
}

ConsoleOutput.setStats = function (stats) {
  var needsRender = false;
  for (var attrname in stats) {
    if (validStats[attrname] !== stats[attrname]) {
      needsRender = true;
      validStats[attrname] = stats[attrname];
    }
  }
  if (needsRender) {
    renderValidation();
  }
}

ConsoleOutput.getStrWidth = function() {
  return outputStream.columns;
}



