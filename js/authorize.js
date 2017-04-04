var tokens = require('../files/tokens.env');
var oauth2 = require('simple-oauth2');
var async = require('async');
var inquirer = require('inquirer');

var token;
var code;

var authParams = {
  response_type: 'code',
  client_id: tokens.clientID,
  redirect_uri: tokens.redirectUri,
  state: 'needCsrf', /* TODO: Need to properly deal with CSRF state string */
};

var authUrl = "https://account.box.com/api/oauth2/authorize?client_id=" + authParams.client_id + "&response_type=" + authParams.response_type +
  "&state=" + authParams.state;

// Set the configuration settings
var credentials = {
  client: {
    id: tokens.clientID,
    secret: tokens.clientSecret
  },
  auth: {
    tokenHost: 'https://api.box.com',
    tokenPath: '/oauth2/token'
  }
};

var oauthCreds = oauth2.create(credentials);

exports.getBoxTokens = function(callback) {
  token = undefined;
  code = undefined;
  async.series([
      function(cb) {
        promptRedirect(function(answers) {
          code = answers.code;
          cb();
        });
      },
      requestTokens
    ],
    function(err) {
      callback(err, token);
  });
}

function promptRedirect(callback) {
  var questions = [
    {
      name: 'code',
      type: 'input',
      message: 'Visit ' + authUrl + 'and give this app access.  Copy the "code" in the URL you get redirected to into this window.',
      validate: function( value ) {
        if (value.length) {
          return true;
        } else {
          return 'Please enter the code component of the URL you arrived at.';
        }
      }
    }
  ];

  inquirer.prompt(questions).then(callback);
}

function requestTokens(callback) {

  // Authorization oauth2 URI
// Get the access token object (the authorization code is given from the previous step).
  const tokenConfig = {
    grant_type: 'authorization_code',
    client_id: tokens.clientId,
    client_secret: tokens.clientSecret,
    code: code,
    redirect_uri: tokens.redirectUri
  };

  oauthCreds.authorizationCode.getToken(tokenConfig, function(error, result) {
    if (error) {
      // No point in continuing...
      return callback(error);
    }

    token = oauthCreds.accessToken.create(result);
    callback();
  });
}



