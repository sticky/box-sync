var ProgressBar = require('progress');

var ConsoleOutput = module.exports;

var outputStream = process.stdout;

var lastStrRendered = [
  ''
];

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

ConsoleOutput.displayDirProgress = function (str) {
  if (lastStrRendered !== str) {
    outputStream.clearLine();
    outputStream.cursorTo(0);
    outputStream.write(str);
    lastStrRendered[IDX_DIR] = str;
  }
}

ConsoleOutput.getStrWidth = function() {
  return outputStream.columns;
}



