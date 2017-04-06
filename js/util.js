'use strict';
var crypto = require('crypto');
var fs = require('fs');
function pad(number) {
  if (number < 10) {
    return '0' + number;
  }
  return number;
}

module.exports = {
  // Similar, but not quite, to Date.toISOString().
  // The API will reject the milliseconds portion.
  dateToBoxDateString: function(date) {
    return date.getUTCFullYear() +
      '-' + pad(date.getUTCMonth() + 1) +
      '-' + pad(date.getUTCDate()) +
      'T' + pad(date.getUTCHours()) +
      ':' + pad(date.getUTCMinutes()) +
      ':' + pad(date.getUTCSeconds()) +
      'Z';
  },
  generalErrorTouchup: function(error) {
    if (!error.statusCode) {
      error.statusCode = 'SYS';
    }


    // We don't want to keep trying if we're not even authenticated correctly.
    // But try to avoid other random "bad request" messages.
    // It should always be 401, but this was seen as 400 during development, as well.
    var possibleAuthIssue = error.statusCode == 400 || error.statusCode == 'pre-400' || error.statusCode == 401 || error.statusCode == 'pre-401';

    var messages = [error.message];
    if (error.response.body && error.response.body.error) {
      // These always go in pairs.... right?
      messages.push(error.response.body.error);
      messages.push(error.response.body.error_description);
    }

    if (possibleAuthIssue) {

      messages.forEach(function(errorMsg) {
        if (errorMsg.includes('Auth') || errorMsg.includes('auth') || errorMsg.includes('credentials')) {
          throw new Error("Possible authentication failure  Server response: " + errorMsg);
        }
      });
    }
  },
  makeFileHash: function(file, callback) {
    var hash = crypto.createHash('sha1');
    var fullFileName = file.pathStr + '/' + file.name;
    var stream = fs.createReadStream(fullFileName);
    stream.on('data', function (data) {
      hash.update(data, 'utf8');
    });

    stream.on('end', function () {
      var sha1 = hash.digest('hex');
      callback(null, sha1);
    });
  },
  /* Box only supports file names of 255 characters or less. Names that will not be supported are those that
    contain non-printable ascii, / or \, names with leading or trailing spaces, and the special
    names “.” and “..”
   */
  /* Wesnote: I originally interpereted this as needing to restrict filenames to only the limited "printable ascii" (32 - 127)
     character set.  However, that isn't quite what the docs are saying.  Excluding the non-printable ASCII means
     everything else "should" work (except for the specific exclusions mentioned in the doc).
   */
  validators: {
    badLength: function (filename) {
      if (filename.length > 255) {
        return false;
      }
    },
    badChars: function (filename) {
      // "." and ".." aren't explicitly checked because functionality is already ignoring those special files.
      return /[\x00-\x1F]|[\/\\]/g.test(filename);
    },
    badWhitespace: function (filename) {
      return /^[\s]|[\s]$/g.test(filename);
    },
    ignored: function (name) {
      // Very specific names...
      switch (name) {
        case '.Trash':
        case '.DS_Store':
        case '.cache':
          return true;
          break;
      }

      return false;
    }
  }
};
