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
    var genericError = error.statusCode == 400 || error.statusCode == 'pre-400';
    var responseBody = error.response ? error.response.body : null;
    if (!error.statusCode) {
      error.statusCode = 'SYS';
    }

    // Try to get more information from generic errors like 400s.  "Bad Request" is not an actionable level of detail.
    if (genericError && responseBody && responseBody.context_info) {
      error.message += " Context: [ reason: " + responseBody.context_info.reason + ", message: " + responseBody.context_info.message + " ]";
    }

    // We don't want to keep trying if we're not even authenticated correctly.
    // But try to avoid other random "bad request" messages.
    // It should always be 401, but this was seen as 400 during development, as well.
    var possibleAuthIssue = genericError || error.statusCode == 401 || error.statusCode == 'pre-401';

    var messages = [error.message];
    if (responseBody && responseBody.error) {
      // These always go in pairs.... right?
      messages.push(responseBody.error);
      messages.push(responseBody.error_description);
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

    stream.on('error', function(err) {
      callback(err, null);
    })
  },
  /* Create a new File or Directory object from an existing one, but clean out any values that probably shouldn't be dupe'd. */
  createNewItemFrom: function(originalItem) {
    var newItem = originalItem.duplicate();
    newItem.issues = [];
    newItem.remoteId = null;
    // These timestamps (in current behavior) aren't set until an upload is attempted.
    newItem.created = null;
    newItem.updated = null;

    return newItem;
  },
  itemHasIssues: function(itemObj, callback) {
    if (itemObj.issues.length >= 1) { return true;}

    for (var i = 0; i < itemObj.issues.length; i++) {
      if (itemObj.issues[i] && itemObj.issues[i] != 0) {
        return true;
      }
    }

    return false;
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
