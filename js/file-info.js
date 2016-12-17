

function FileInfo (opts) {
  this.localFolderId = opts.localFolderId;
  this.pathStr = opts.path;
  this.name = opts.name;
  this.issues = opts.problems;
  this.line = opts.line;
};

module.exports = FileInfo;

FileInfo.SEP = ':::';

FileInfo.prototype.str = function() {
  return this.pathStr + FileInfo.SEP + this.localFolderId + FileInfo.SEP + this.name;
};

FileInfo.FromStr = function(string) {
  var chunks = string.split(FileInfo.SEP);

  if (chunks.length < 3) {
    console.error("Line in file has wrong chunk count.", chunks.length);
    return;
  }

  return new FileInfo({localFolderId: chunks[1], path: chunks[0], name: chunks[3]});
};
