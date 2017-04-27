# Using the 'test box sync folder' for testing

There is minimal initial setup you'll need to do to test using the "test box sync folder".

Simply make sure that your destination folder on Box.com has an "emojiclock" folder with the "testfolderconflict" file stored there.

## Example commands to run
Read the usage section in the primary readme for more details on usage.

* Initial validation step
  * `node --max_old_space_size=4096 index.js /Volumes/6TB\ Volume\ 02/Archive/Projects 13540453251`
* Fix errors:
	* `node --max_old_space_size=4096 index.js -f "test/test box sync folder" 1234567890`