# Box Initial Sync Script

This script does only one thing: reviews an entire directory and uploads its contents to a Box.com
folder.  

If you have a large file archive dating back years, filled with hundreds/thousands of files 
of a gajillion different formats, the Box Uploader is probably going to fail several times and not
really provide you a clue why.
 
This script was built to try to anticipate some of these errors, try to fix them, and not completely
fail if a few hundred files or directories are getting rejected by Box.com for some reason.

This *not* meant to replace Box Sync or some other syncing utility.  Once you are done (or close enough
to done) with your initial gigantic upload, this script is done, too.

## Important
This script is intended to be used by advanced users who know how to read a SQLite Database
or run things on the command line.  You'll be able to read why a file didn't make it, or why a file
might not have been attempted at all.

This script is also very much an alpha.  It was a tool we wanted to make, we used it to do what we
needed it to do, and it might not cover scenarios specific to your massive upload.  Especially if you
are not a Mac user!

People who try to use this should be:
* Able to modify Javascript files.
* Use the command line
* Willing to install and run Node
* Be able to create a Box.com App using a developer account (https://developer.box.com/)

# Requirements
## Box.com App
This script is not associated with a particular web app, so you will need to create your own.

# Installation

If you downloaded the codebase directly, you can use 
`npm install` while in this directory.

# Authentication
This script uses the web-based three-legged OAuth2 process which is quite nice if you've got a web browser but not
so great if you're trying to run a command line script.  It is hard to display Box.com's HTML login form
on a terminal!

Maybe it will support the more server-oriented approach sometime, but that requires more user management and
private key configuration in addition to the App creation steps we already needed to take.

## Oauth Script Configuration
Update the tokens.env file with information about your app.

![Dev Console Oauth Information][Dev Oauth Info]

```
exports.clientID = 'your-really-long-client-id-number';
exports.clientSecret = 'your-really-long-client-secret-number';
exports.redirectUri = 'https://your-redirect-url-here';
```

### Note about your redirect URL
This doesn't have to be a functional server page that will act on the URL parameters provided to them.
It could even be something like "localhost" if you want.  You will be redirected here after authorizing
your Box.com app, and you will be copying a URL parameter into your terminal window.

# Usage

Run: node --max_old_space_size=4096 index.js flags] <folder> <BoxFolderId>

When the script starts, it will prompt you to visit a URL and authorize the app to use your credentials.

You are also directed to copy a portion of the URL you were directed to back into the terminal to complete
authentication.

EG: https://your-redirect-url-here?state=stringstring&code=*LONG-NUMBER-AND-LETTER-STRING*

The code we want is `LONG-NUMBER-AND-LETTER-STRING`

# Known Issues

* If your system goes to sleep, this program will probably explode.
* Not all cases of failure are accounted for.
* Feel free to contribute your own issues you had, or ways you fixed them,

[Dev Oauth Info]: docs/dev_console_info.png
