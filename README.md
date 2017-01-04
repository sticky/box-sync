# Box Initial Sync Script

If you fall into the category where you have a large number of files (~ terrabyte) to upload but are still too small-fry f
or to send your hard drive to them for them to upload files to you, you're probably running into incomplete file uploads 
or upload failures that happen hours into your transfer.
 
This script is an attempt to make that initial upload easier...


# Installation

If you downloaded the codebase directly, you can use 
`npm install -g` while in this directory.

If we publish this somewhere, you can also use
`npm install -g sticky-box-sync` after you download and install Node.js.

# Development Notes
Use `npm link` to make dev easier.

# Known Issues

* If your system goes to sleep, this program will probably explode.
* NPM has a sorta small default memory limit for the potential amount of information it might be trying to keep track of.
  If you run into this problem (most likely place is during the validation step), you are going to need to use node directly instead of the handy `box-sync` command.
    * EG: `node --max_old_space_size=4096 index.js -- [flags] <folder> <BoxFolderId>`
