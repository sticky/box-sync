# Fixing Issues by Hand

Some issues need to be fixed by hand.  For instance, it is not uncommon at all for a batch of large files to fail during transfer, even after repeated tries.  
There are also some classes of issues that aren't addressed by implementation yet.

Or maybe you don't want some kind of automated error fixing to happen on thousands of files at a time, especially if those fixes involve file renaming.

These are some suggestions for doing some handwork via SQL queries to keep the database in a useful state with valid information, but also manually fix some issues.

## Approaches for known issues
In every case below, you need to be comfortable using SQL and the command line.  Instructions are written specifically for a Mac (or Linux) environment; things like folder ID numbers are very different across operating systems and file systems.

### Directories couldn't be uploaded because of naming problems
Box.com doesn't like it if file or folder names include certain characters or spaces at the beginning or the end.  This can leave hundreds or thousands of directories and files sitting around in an un-uploaded state!


### Fixing Spaces, other invalid Directory Names
This process focuses mainly on manually renaming *Directories* with filename issues.  An automatic approach has already
been done for Files; this approach will still apply in many ways to correcting a File issue, too.

For illustrative purposes, our exmaple row will have the following attributes

| Sys_Id_Num |  Parent_Id | Remote_Id | Full_Path | Name | ... |
|-----------|------| -------|------|-------|----|
|38976107|noparent|manual|/Scripts/development/box/test/test box sync folder| emojic : loc \k misc | ... |

1. Find out what we're dealing with via
   `SELECT * FROM Dirs_Incomplete WHERE Spaces IS 1`

2. Select a directory, and combine the directory name with the Full_Path.  Put it somewhere other than your clipboard, we'll be using it later!
   For example: `/Scripts/development/box/test/test box sync folder/ emojic : loc \k misc ` 
 
3. Remove the leading/trailing whitespace from the directory (the actual directory) name, or make additional corrections.
   E.g: "emojic_loc_misc"
   
   `mv "/Scripts/development/box/test/test box sync folder/ emojic : loc \k misc " "/Scripts/development/box/test/test box sync folder/emojic_loc_misc"`

4. Change the Name column to what you renamed the file to.
   `UPDATE Directories SET Name = 'emojic_loc_misc' WHERE Sys_Id_Num = 38976107`

5. Run the following queries to re-write the Full_Path values of child Directories and Files to reflect the new directory name.

   `UPDATE Directories SET Full_Path = replace( Full_Path, '<PATH_WITH_PROBLEMS>', '<BETTER_PATH>');`
   `UPDATE Files SET Full_Path = replace( Full_Path, '/Scripts/development/box/test/test box sync folder/ emojic : loc \k misc ', '/Scripts/development/box/test/test box sync folder/emojic_loc_misc');`

6. Set the Directory's "Done" state to 0, to flag it as an unprocessed directory.

   `INSERT INTO Directory_Progress('Dir_Id', 'Done') VALUES (38976107, 0);`
   
 7. Remove the "issues" flags from the Directory!
    `UPDATE Directory_Issues SET Long = 0, Chars = 0, Spaces = 0 WHERE DirId = 38976107`
    
 8. Manually create this directory on Box.com in the correct location.
 
 9. Update the Remote_Id value for the directory.
    `UPDATE Directories SET Remote_Id = 26223599818 WHERE Sys_Id_Num = 38976107`
    
You may need to repeat these steps for several child elements; it seemed like usage that created extraneous whitespace in
one directory often created extraneous whitespace in the Directory and File names within that original directory.

### Manually Archiving a File
Some files are best manually archived somewhere.  The most obvious case is files that are just too big to put onto
Box; the Enterprise level has a filesize limit of 5GB for a single file.

1. Find the file you want to archive.  The best source for these kinds of files is probably going to be Files_Failed,
   but you might want to look in other tables depending on your particular reasoning for taking this manual approach.
   
2. Put the file somewhere, and make a note of: The File Name, and Folder Id.

3. Mark the file as "done."
   `UPDATE Files_Progress SET Done = 1 WHERE Folder_Id IS '109143' and Name IS 'clip-2008-06-11 15;52;35.mov';`
   
4. Remove any file errors.
   `DELETE FROM File_Failures WHERE Folder_Id IS '109143' and Name IS 'clip-2008-06-11 15;52;35.mov';`

5. Set the remote ID column to something that gives you a clue as to where it went.
   `UPDATE Files SET Remote_Id = 'archived_elsewhere' WHERE Folder_Id IS '109143' and Name IS 'clip-2008-06-11 15;52;35.mov';`
