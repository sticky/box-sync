'use strict';

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

    if (possibleAuthIssue) {
      if (error.message.includes('Auth') || error.message.includes('auth')) {
        throw new Error("Possible authentication failure  Server response: " + error.message);
      }
    }
  }
};
