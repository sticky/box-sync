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
  }
};
