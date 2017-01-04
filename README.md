# Box Initial Sync Script

If you fall into the category where you have a large number of files (~ terrabyte) to upload but are still too small-fry
to send your hard drive to them to let them to upload files for you, you're probably running into incomplete file uploads 
or upload failures that happen hours into your transfer while using Box's official uploader with little to no explanation 
of what the problem might be.

## Important
This script is an attempt to make that initial upload easier... but it's still pretty rough, so you're going to need
to get your hands dirty in the command line.

People who try to use this should be:
* Able to modify Javascript files.
* Use the command line
* Willing to install and run Node
* Is familiar with HTTP requests such as POST and GET (and have made those requests manually)

# Installation

If you downloaded the codebase directly, you can use 
`npm install -g` while in this directory.

If we publish this somewhere, you can also use
`npm install -g sticky-box-sync` after you download and install Node.js.

# Authentication
Yuck.
This script doesn't have a nice authentication process yet.
You will need to do some handwork and know how to POST and GET from/to URLs.

Fortunately, almost every browser has a plugin that will let you manually create HTTP requests,  e.g [Postman](https://www.getpostman.com)

Follow the steps at [Box.com's OAuth documentation](https://docs.box.com/docs/oauth-20)!

After step 5 ("5. Getting the Access Token"), you're ready to update the tokens.env file.

Token information you get during this process goes into `files/tokens.env` and looks like the following...

```
exports.accessToken = 'ACCESS_TOKEN_GIBBERISH';
exports.refreshToken = 'REFRESH_TOKEN_GIBBERISH';
exports.tokenExpires = parseInt(RESPONSE_VALUE_HERE, 10) * 1000;
exports.tokenRequestedAt = The value of [Date.now()](https://jsfiddle.net/Razoras/h4aptgq3/4/) when this token was requested.;
```

This information will be sufficient to allow this script to proceed for more than an hour and intelligently refresh
the access token while it runs for an extended period of time.


# Usage
Optimally, you can use `box-sync [flags] <source directory> <Box.com folderID>` and just watch progress bars fill in.

Unfortunately, due to limits in Node's default heap size, this probably won't be enough.  See the [known issues](#known-issues) section.

# Development Notes
Use `npm link` to make dev easier.

# Known Issues

* If your system goes to sleep, this program will probably explode.
* NPM has a sorta small default memory limit for the potential amount of information it might be trying to keep track of.
  If you run into this problem (most likely place is during the validation step), you are going to need to use node directly instead of the handy `box-sync` command.
    * EG: `node --max_old_space_size=4096 index.js -- [flags] <folder> <BoxFolderId>`
