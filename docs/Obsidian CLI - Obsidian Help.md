# Obsidian CLI

Obsidian CLI is a command line interface that lets you control Obsidian from your terminal for scripting, automation, and integration with external tools.

Anything you can do in Obsidian you can do from the command line. Obsidian CLI even includes developer commands to access developer tools, inspect elements, take screenshots, reload plugins, and more.

### Requires Obsidian 1.12 installer

Using the CLI requires the Obsidian 1.12 installer. See the installer version update guide.

# Install Obsidian CLI

Upgrade to the latest Obsidian installer version (1.11.7) and the latest early access version (1.12.x).

Enable Obsidian CLI in Obsidian:

- 1. Go to Settings → General.
- 2. Enable Command line interface.
- 3. Follow the prompt to register Obsidian CLI.

If you run into issues installing Obsidian CLI see Troubleshooting.

# Get started

Obsidian CLI supports both single commands and a terminal user interface (TUI) with interactive help and autocomplete.

#### Obsidian app must be running

Obsidian CLI requires the Obsidian app to be running. If Obsidian is not running, the first command you run launches Obsidian.

Looking to sync without the desktop app? See Obsidian Headless.

# Run a command

Run an individual command without opening the TUI:

```
# Run the help command
obsidian help
```

# Use the terminal interface

Use the TUI by entering obsidian . Subsequent commands can be entered without obsidian .

```
# Open the TUI, then run help
obsidian
help
```

The TUI supports autocomplete, command history, and reverse search. Use Ctrl+R to search your command history. See Keyboard shortcuts for all available shortcuts.

# Examples

Here are a few examples of what Obsidian CLI can do.

# Everyday use

# Read the active file

```
# Open today's daily note
obsidian daily
# Add a task to your daily note
obsidian daily:append content="- [ ] Buy groceries"
# Search your vault
obsidian search query="meeting notes"
```

```
obsidian read
# List all tasks from your daily note
obsidian tasks daily
# Create a new note from a template
obsidian create name="Trip to Paris" template=Travel
# List all tags in your vault with counts
obsidian tags counts
# Compare two versions of a file
obsidian diff file=README from=1 to=3
```

# For developers

Many Developer commands are available for plugin and theme development. These commands allow agentic coding tools to automatically test and debug.

```
# Open developer tools
obsidian devtools
# Reload a community plugin you're developing
obsidian plugin:reload id=my-plugin
# Take a screenshot of the app
obsidian dev:screenshot path=screenshot.png
# Run JavaScript in the app console
obsidian eval code="app.vault.getFiles().length"
```

# How to

# Use parameters and flags

Commands can use parameters and flags. Most commands do not require any parameters or flags. Required parameters are marked as required . For example:

```
# Create a new note using the default "Untitled" name
obsidian create
```

A parameter takes a value, written as parameter=value . If the value has spaces, wrap it in quotes:

```
# Create a new note called "Note" with content "Hello world"
obsidian create name=Note content="Hello world"
```

A flag is a boolean switch with no value. Include it to turn it on, for example open and overwrite are flags:

```
# Create a note and open it
obsidian create name=Note content="Hello" open overwrite
```

For multiline content use \n for newline. Use \t for tab.

obsidian create name=Note content="# Title\n\nBody text"

# Target a vault

If your terminal's current working directory is a vault folder, that vault is used by default. Otherwise, the currently active vault is used.

Use vault=<name> or vault=<id> to target a specific vault. This must be the first parameter before your command:

```
obsidian vault=Notes daily
```

```
obsidian vault="My Vault" search query="test"
```

In the TUI, use vault:open <name> or <id> to switch to a different vault.

# Target a file

Many commands accept file and path parameters to target a specific file. If neither is provided, the command defaults to the active file.

- file=<name> resolves the file using the same link resolution as wikilinks, matching by file name without requiring the full path or extension.
- path=<path> requires the exact path from the vault root, e.g. folder/note.md .

```
# These are equivalent if "Recipe.md" is the only file with that
name
obsidian read file=Recipe
obsidian read path="Templates/Recipe.md"
```

# Copy output

Add --copy to any command to copy the output to the clipboard:

```
read --copy
search query="TODO" --copy
```

# General commands

### help

Show list of all available commands.

| Parameter  | Description                       |
| ---------- | --------------------------------- |
| <command/> | Show help for a specific command. |

### version

Show Obsidian version.

# reload

Reload the app window.

#### restart

Restart the app.

# Bases

Commands for Bases.

bases

List all .base files in the vault.

### base:views

List views in the current base file.

### base:create

Create a new item in a base. Defaults to the active base view if no file is specified.

| path= <path></path>    | # base file path           |
| ---------------------- | -------------------------- |
| view= <name></name>    | # view name                |
| name= <name></name>    | # new file name            |
| content= <text></text> | # initial content          |
| open                   | # open file after creating |
|                        | # open in new tab          |

### base:query

Query a base and return results.

| file= <name></name>          | # base file name                |
| ---------------------------- | ------------------------------- |
| path= <path></path>          | # base file path                |
| view= <name></name>          | # view name to query            |
| format=json csv tsv md paths | # output format (default: json) |

# Bookmarks

Commands for Bookmarks.

#### bookmarks

List bookmarks.

| total               | # return bookmark count        |
| ------------------- | ------------------------------ |
| verbose             | # include bookmark types       |
| format=json tsv csv | # output format (default: tsv) |

#### bookmark

Add a bookmark.

| subpath= <subpath><br/>folder=<path></path></subpath>                                                         | # subpath (heading or block) within file<br># folder to bookmark |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| search= <query></query>                                                                                       | # search query to bookmark                                       |
| url= <url></url>                                                                                              | # URL to bookmark                                                |
| title= <title>&lt;/th&gt;&lt;td&gt;# bookmark title&lt;/td&gt;&lt;/tr&gt;&lt;/tbody&gt;&lt;/table&gt;</title> |                                                                  |

# Command palette

Commands for Command palette and Hotkeys. This includes all commands registered by plugins.

commands

List available command IDs.

filter=<prefix> # filter by ID prefix

#### command

Execute an Obsidian command.

```
id=<command-id> # (required) command ID to execute
```

# hotkeys

List hotkeys for all commands.

| total               | # return hotkey count          |
| ------------------- | ------------------------------ |
| verbose             | # show if hotkey is custom     |
| format=json tsv csv | # output format (default: tsv) |

hotkey

Get hotkey for a command.

| id= <command-id></command-id> | # (required) command ID     |
| ----------------------------- | --------------------------- |
| verbose                       | # show if custom or default |

# Daily notes

Commands for Daily notes.

# daily

Open daily note.

```
paneType=tab|split|window # pane type to open in
```

# daily:path

Get daily note path. Returns the expected path even if the file hasn't been created yet.

# daily:read

Read daily note contents.

### daily:append

Append content to daily note.

```
content=<text> # (required) content to append
paneType=tab|split|window # pane type to open in
inline # append without newline
open # open file after adding
```

# daily:prepend

Prepend content to daily note.

| paneType=tab split window | # pane type to open in    |     |
| ------------------------- | ------------------------- | --- |
| inline                    | # prepend without newline |     |
| open                      | # open file after adding  |     |

# File history

# diff

List or compare versions from local File recovery and Sync. Versions are numbered from newest to oldest.

```
file=<name> # file name
path=<path> # file path
from=<n> # version number to diff from
to=<n> # version number to diff to
filter=local|sync # filter by version source
```

#### Examples:

```
# List all versions of the active file
diff
# List all versions of a specific file
diff file=Recipe
# Compare the latest version to the current file
diff file=Recipe from=1
# Compare two versions
diff file=Recipe from=2 to=1
# Only show Sync versions
diff filter=sync
```

# history

List versions from File recovery only. See sync:history for the equivalent Sync command.

| file= <name></name> | # file name |     |
| ------------------- | ----------- | --- |
| path= <path></path> | # file path |     |

# history:list

List all files with local history.

# history:read

Read a local history version.

| file= <name></name> | # file name                   |
| ------------------- | ----------------------------- |
| path= <path></path> | # file path                   |
| version= <n></n>    | # version number (default: 1) |

### history:restore

#### Restore a local history version.

| file= <name><br/>path=<path></path></name> | # file name<br># file path  |     |     |
| ------------------------------------------ | --------------------------- | --- | --- |
| version= <n></n>                           | # (required) version number |     |     |

# history:open

#### Open file recovery.

| file= <name></name> | # file name |
| ------------------- | ----------- |
| path= <path></path> | # file path |

# Files and folders

# file

Show file info (default: active file).

| file= <name></name> | # file name |     |
| ------------------- | ----------- | --- |
| path= <path></path> | # file path |     |

#### Example:

| extension<br>md                          |     |
| ---------------------------------------- | --- |
| size<br>1024<br>created<br>1700000000000 |     |
| modified<br>1700001000000                |     |

# files

#### List files in the vault.

| folder= <path></path>        | # filter by folder    |
| ---------------------------- | --------------------- |
| ext= <extension></extension> | # filter by extension |
| total                        | # return file count   |

### folder

#### Show folder info.

| path= <path></path>     | # (required) folder path    |     |
| ----------------------- | --------------------------- | --- |
| info=files folders size | # return specific info only |     |

### folders

List folders in the vault.

| folder= <path></path> | # filter by parent folder |
| --------------------- | ------------------------- |
| total                 | # return folder count     |

#### open

#### Open a file.

| file= <name></name> | # file name       |
| ------------------- | ----------------- |
| path= <path></path> | # file path       |
| newtab              | # open in new tab |

#### create

Create or overwrite a file.

| name= <name></name>     | # file name                |
| ----------------------- | -------------------------- |
| path= <path></path>     | # file path                |
| content= <text></text>  | # initial content          |
| template= <name></name> | # template to use          |
|                         |                            |
|                         |                            |
| overwrite               | # overwrite if file exists |
| open                    | # open file after creating |
| newtab                  | # open in new tab          |

### read

Read file contents (default: active file).

| file= <name></name> | # file name |     |
| ------------------- | ----------- | --- |
| path= <path></path> | # file path |     |

# append

Append content to a file (default: active file).

| file= <name></name>    | # file name                    |
| ---------------------- | ------------------------------ |
| path= <path></path>    | # file path                    |
| content= <text></text> | # (required) content to append |
|                        |                                |
| inline                 | # append without newline       |

### prepend

Prepend content after frontmatter (default: active file).

| file= <name></name>    | # file name                     |
| ---------------------- | ------------------------------- |
| path= <path></path>    | # file path                     |
| content= <text></text> | # (required) content to prepend |
| inline                 | # prepend without newline       |

#### move

Move or rename a file (default: active file). This will automatically update internal links if turned on in your vault settings.

| file= <name><br/>path=<path></path></name> | # file name<br># file path |                                         |     |     |
| ------------------------------------------ | -------------------------- | --------------------------------------- | --- | --- |
| to= <path></path>                          |                            | # (required) destination folder or path |     |     |

#### rename

Rename a file (default: active file). The file extension is preserved automatically if omitted from the new name. Use move to rename and move a file at the same time. This will automatically update internal links if turned on in your vault settings.

| file= <name></name> | # file name |                            |     |     |
| ------------------- | ----------- | -------------------------- | --- | --- |
| path= <path></path> | # file path |                            |     |     |
| name= <name></name> |             | # (required) new file name |     |     |

### delete

Delete a file (default: active file, trash by default).

| file= <name></name> | # file name                      |     |
| ------------------- | -------------------------------- | --- |
| path= <path></path> | # file path                      |     |
|                     |                                  |     |
| permanent           | # skip trash, delete permanently |     |

# Links

Commands for Backlinks and Outgoing links.

# backlinks

List backlinks to a file (default: active file).

```
file=<name> # target file name
path=<path> # target file path
counts # include link counts
total # return backlink count
format=json|tsv|csv # output format (default: tsv)
```

# links

List outgoing links from a file (default: active file).

| path= <path></path> | # file path         |
| ------------------- | ------------------- |
| total               | # return link count |

# unresolved

List unresolved links in vault.

| total               | # return unresolved link count |
| ------------------- | ------------------------------ |
| counts              | # include link counts          |
| verbose             | # include source files         |
| format=json tsv csv | # output format (default: tsv) |

# orphans

List files with no incoming links.

total # return orphan count

# deadends

List files with no outgoing links.

total # return dead-end count

# Outline

#### Commands for Outline.

# outline

Show headings for the current file.

```
file=<name> # file name
path=<path> # file path
format=tree|md|json # output format (default: tree)
total # return heading count
```

# Plugins

Commands for Core plugins and Community plugins.

# plugins

List installed plugins.

```
filter=core|community # filter by plugin type
versions # include version numbers
format=json|tsv|csv # output format (default: tsv)
```

# plugins:enabled

List enabled plugins.

filter=core|community # filter by plugin type

| versions            |     | # include version numbers      |     |
| ------------------- | --- | ------------------------------ | --- |
| format=json tsv csv |     | # output format (default: tsv) |     |

### plugins:restrict

Toggle or check restricted mode.

| on  | # enable restricted mode  |
| --- | ------------------------- |
| off | # disable restricted mode |

# plugin

#### Get plugin info.

|--|

# plugin:enable

#### Enable a plugin.

| id= <id></id>         | # (required) plugin ID |
| --------------------- | ---------------------- |
| filter=core community | # plugin type          |

# plugin:disable

#### Disable a plugin.

id=<id> # (required) plugin ID filter=core|community # plugin type

### plugin:install

#### Install a community plugin.

| id= <id></id> | # (required) plugin ID |
| ------------- | ---------------------- |
| enable        | # enable after install |

# plugin:uninstall

Uninstall a community plugin.

|     | plugin:reload |
| --- | ------------- |
|     |               |

Reload a plugin (for developers).

| id= <id></id>   | # (required) plugin ID   |     |
| --------------- | ------------------------ | --- |
| --------------- | ------------------------ | --  |

# Properties

Commands related to Properties.

### aliases

List aliases in the vault. Use active or file / path to show aliases for a specific file.

file=<name> # file name path=<path> # file path

| total   | # return alias count |                                |
| ------- | -------------------- | ------------------------------ |
| verbose | # include file paths |                                |
| active  |                      | # show aliases for active file |

### properties

List properties in the vault. Use active or file / path to show properties for a specific file.

| file= <name></name>  | # show properties for file        |
| -------------------- | --------------------------------- |
| path= <path></path>  | # show properties for path        |
| name= <name></name>  | # get specific property count     |
| sort=count           | # sort by count (default: name)   |
| format=yaml json tsv | # output format (default: yaml)   |
|                      |                                   |
| total                | # return property count           |
| counts               | # include occurrence counts       |
| active               | # show properties for active file |

### property:set

Set a property on a file (default: active file).

| name<br>value= <value></value>                        | # (required) property |
| ----------------------------------------------------- | --------------------- |
| value<br>type=text list number checkbox date datetime | # property type       |
| file= <name></name>                                   | # file name           |
| path= <path></path>                                   | # file path           |

#### property:remove

Remove a property from a file (default: active file).

| name= <name></name> |             | # (required) property name |     |
| ------------------- | ----------- | -------------------------- | --- |
| file= <name></name> | # file name |                            |     |
| path= <path></path> | # file path |                            |     |

#### property:read

Read a property value from a file (default: active file).

| name= <name></name> | # (required) property name |     |
| ------------------- | -------------------------- | --- |
| file= <name></name> | # file name                |     |
| path= <path></path> | # file path                |     |

# Publish

Commands for Obsidian Publish.

# publish:site

Show publish site info (slug, URL).

# publish:list

#### List published files.

total # return published file count

#### publish:status

#### List publish changes.

| total<br>new | # return change count<br># show new files only |
| ------------ | ---------------------------------------------- |
| changed      | # show changed files only                      |
| deleted      | # show deleted files only                      |

# publish:add

Publish a file or all changed files (default: active file).

| file= <name></name> | # file name                 |
| ------------------- | --------------------------- |
| path= <path></path> | # file path                 |
| changed             | # publish all changed files |

# publish:remove

Unpublish a file (default: active file).

| file= <name></name> | # file name |     |
| ------------------- | ----------- | --- |
| path= <path></path> | # file path |     |

# publish:open

Open file on published site (default: active file).

|     | file= <name><br/>path=<path></path></name>   |     | # file name<br># file path   |     |
| --- | -------------------------------------------- | --- | ---------------------------- | --- |
| --  | -------------------------------------------- | --  | ---------------------------- | --  |

# Random notes

Commands for Random note.

### random

Open a random note.

| folder= <path></path> | # limit to folder |
| --------------------- | ----------------- |
| newtab                | # open in new tab |

### random:read

Read a random note (includes path).

folder=<path> # limit to folder

# Search

Commands for Search.

### search

Search vault for text. Returns matching file paths.

```
query=<text> # (required) search query
path=<folder> # limit to folder
limit=<n> # max files
format=text|json # output format (default: text)
```

total # return match count case # case sensitive

### search:context

Search with matching line context. Returns grep-style path:line: text output.

| query= <text><br/>path=<folder></folder></text> | # (required) search query<br># limit to folder |
| ----------------------------------------------- | ---------------------------------------------- |
| limit= <n></n>                                  | # max files                                    |
| format=text json                                | # output format (default: text)                |
| case                                            | # case sensitive                               |

### search:open

Open search view.

# Sync

Commands for Obsidian Sync.

#### Sync without the desktop app

These commands control Sync within the running Obsidian app. To sync vaults from the command line without the desktop app, see Headless Sync.

![](_page_25_Picture_13.jpeg)

#### Pause or resume sync.

| on  | # resume sync |     |
| --- | ------------- | --- |
| off | # pause sync  |     |

### sync:status

Show sync status and usage.

### sync:history

List sync version history for a file (default: active file).

| file= <name></name> | # file name            |
| ------------------- | ---------------------- |
| path= <path></path> | # file path            |
|                     |                        |
| total               | # return version count |

#### sync:read

Read a sync version (default: active file).

| file= <name><br/>path=<path></path></name> | # file name<br># file path  |
| ------------------------------------------ | --------------------------- |
| version= <n></n>                           | # (required) version number |

### sync:restore

Restore a sync version (default: active file).

file=<name> # file name

| path= <path></path> | # file path                 |     |
| ------------------- | --------------------------- | --- |
| version= <n></n>    | # (required) version number |     |

#### sync:open

Open sync history (default: active file).

| file= <name></name> | # file name |     |
| ------------------- | ----------- | --- |
| path= <path></path> | # file path |     |

### sync:deleted

#### List deleted files in sync.

| # return deleted file count   | total   |     |     |     |     |     |     |     |
| ----------------------------- | ------- | --- | --- | --- | --- | --- | --- | --- |
| ----------------------------- | ------- | --  | --  | --  | --  | --  | --  | --  |

# Tags

#### Commands for Tags.

#### tags

List tags in the vault. Use active or file / path to show tags for a specific file.

| file= <name></name> | # file name                     |
| ------------------- | ------------------------------- |
| path= <path></path> | # file path                     |
| sort=count          | # sort by count (default: name) |
|                     |                                 |
| total               | # return tag count              |
| counts              | # include tag counts            |
| format=json tsv csv | # output format (default: tsv)  |

### tag

Get tag info.

| name= <tag></tag> | # (required) tag name         |
| ----------------- | ----------------------------- |
| total             | # return occurrence count     |
| verbose           | # include file list and count |

# Tasks

Commands for task management.

### tasks

List tasks in the vault. Use active or file / path to show tasks for a specific file.

```
file=<name> # filter by file name
path=<path> # filter by file path
status="<char>" # filter by status character
total # return task count
done # show completed tasks
todo # show incomplete tasks
verbose # group by file with line numbers
format=json|tsv|csv # output format (default: text)
active # show tasks for active file
daily # show tasks from daily note
```

#### Examples:

```
# List all tasks in the vault
tasks
# List incomplete tasks in the vault
tasks todo
# List completed tasks from a specific file
tasks file=Recipe done
# List tasks from today's daily note
tasks daily
# Count tasks in daily note
tasks daily total
# List tasks with file paths and line numbers
tasks verbose
# Filter by custom status (quote special chars)
tasks 'status=?'
```

#### task

Show or update a task.

```
ref=<path:line> # task reference (path:line)
file=<name> # file name
path=<path> # file path
line=<n> # line number
status="<char>" # set status character
toggle # toggle task status
daily # daily note
```

| done | # mark as done |     |
| ---- | -------------- | --- |
| todo | # mark as todo |     |

#### Examples:

```
# Show task info
task file=Recipe line=8
task ref="Recipe.md:8"
# Toggle task completion
task ref="Recipe.md:8" toggle
# Toggle task in daily note
task daily line=3 toggle
# Set task status
task file=Recipe line=8 done # → [x]
task file=Recipe line=8 todo # → [ ]
task file=Recipe line=8 status=- # → [-]
task daily line=3 done # Mark daily note task as done
```

# Templates

Commands for Templates.

templates

List templates.

total # return template count

#### template:read

#### Read template content.

| name= <template></template>                                                                                                                                                                                                                                                                   | # (required) template name |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| title= <title>&lt;/td&gt;&lt;td&gt;# title for variable resolution&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;&lt;/td&gt;&lt;td&gt;&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;resolve&lt;/td&gt;&lt;td&gt;# resolve template variables&lt;/td&gt;&lt;/tr&gt;&lt;/tbody&gt;&lt;/table&gt;</title> |                            |

### template:insert

Insert template into active file.

name=<template> # (required) template name

Notes:

- resolve option processes {{date}} , {{time}} , {{title}} variables
- Use create path=<path> template=<name> to create a file with a template

# Themes and snippets

Commands for Themes and CSS snippets.

#### themes

List installed themes.

versions # include version numbers

![](_page_31_Picture_16.jpeg)

#### Show active theme or get info.

| name= <name></name> |     |     | # theme name for details |
| ------------------- | --- | --- | ------------------------ |
|                     |     |     |                          |

theme:set

Set active theme.

| name= <name></name> | # (required) theme name (empty for default) |     |     |     |
| ------------------- | ------------------------------------------- | --- | --- | --- |
|                     |                                             |     |     |     |

theme:install

#### Install a community theme.

| name= <name></name> | # (required) theme name  |
| ------------------- | ------------------------ |
| enable              | # activate after install |

# theme:uninstall

#### Uninstall a theme.

```
name=<name> # (required) theme name
```

# snippets

List installed CSS snippets.

# snippets:enabled

List enabled CSS snippets.

# snippet:enable

Enable a CSS snippet.

| name= <name></name>   | # (required) snippet name   |     |
| --------------------- | --------------------------- | --- |
| --------------------- | --------------------------- | --  |

# snippet:disable

Disable a CSS snippet.

| name= <name></name> | # (required) snippet name |     |     |
| ------------------- | ------------------------- | --- | --- |
|                     |                           |     |     |

# Unique notes

Commands for Unique note creator.

#### unique

Create unique note.

name=<text> # note name content=<text> # initial content paneType=tab|split|window # pane type to open in open # open file after creating

# Vault

### vault

Show vault info.

info=name|path|files|folders|size # return specific info only

### vaults

List known vaults.

| total   | # return vault count  |     |
| ------- | --------------------- | --- |
| verbose | # include vault paths |     |

### vault:open

Switch to a different vault (TUI only).

name=<name> # (required) vault name

# Web viewer

Commands for Web viewer.

#### web

#### Open URL in web viewer.

| url= <url></url> | # (required) URL to open |
| ---------------- | ------------------------ |
| newtab           | # open in new tab        |

# Wordcount

Commands for Word count.

### wordcount

Count words and characters (default: active file).

# Workspace

Commands for Workspace and the Workspaces plugin.

#### workspace

Show workspace tree.

ids # include workspace item IDs

#### workspaces

#### List saved workspaces.

total # return workspace count

#### workspace:save

#### Save current layout as workspace.

name=<name> # workspace name

workspace:load

Load a saved workspace.

name=<name> # (required) workspace name

workspace:delete

Delete a saved workspace.

#### tabs

#### List open tabs.

ids # include tab IDs

### tab:open

#### Open a new tab.

| group= <id></id>    |     | # tab group ID |     |
| ------------------- | --- | -------------- | --- |
| file= <path></path> |     | # file to open |     |

view=<type> # view type to open

#### recents

List recently opened files.

total # return recent file count

# Developer commands

Commands to help you develop Community plugins and Themes. Learn more by heading to the Obsidian Developer Documentation.

#### devtools

Toggle Electron dev tools.

#### dev:debug

Attach/detach Chrome DevTools Protocol debugger.

| on  |     | # attach debugger |
| --- | --- | ----------------- |
| off |     | # detach debugger |

### dev:cdp

Run a Chrome DevTools Protocol command.

```
method=<CDP.method> # (required) CDP method to call
params=<json> # method parameters as JSON
```

#### dev:errors

#### Show captured JavaScript errors.

clear # clear the error buffer

### dev:screenshot

Take a screenshot (returns base64 PNG).

```
path=<filename> # output file path
```

#### dev:console

Show captured console messages.

```
limit=<n> # max messages to show (default 50)
level=log|warn|error|info|debug # filter by log level
clear # clear the console buffer
```

#### dev:css

Inspect CSS with source locations.

| selector= <css></css> | # (required) CSS selector |     |     |
| --------------------- | ------------------------- | --- | --- |
| prop= <name></name>   | # filter by property name |     |     |

### dev:dom

Query DOM elements.

| selector= <css><br/>attr=<name></name></css> | # (required) CSS selector<br># get attribute value |
| -------------------------------------------- | -------------------------------------------------- |
| css= <prop></prop>                           | # get CSS property value                           |
|                                              |                                                    |
| total                                        | # return element count                             |
| text                                         | # return text content                              |
| inner                                        | # return innerHTML instead of outerHTML            |
| all                                          | # return all matches instead of first              |
|                                              |                                                    |

# dev:mobile

#### Toggle mobile emulation.

| on  | # enable mobile emulation  |     |
| --- | -------------------------- | --- |
| off | # disable mobile emulation |     |

### eval

#### Execute JavaScript and return result.

```
code=<javascript> # (required) JavaScript code to execute
```

# Keyboard shortcuts

These shortcuts are available in the TUI.

# Navigation

| Action           | Shortcut   |
| ---------------- | ---------- |
| Move cursor left | ← / Ctrl+B |

| Move cursor right (accepts suggestion at end of line) | → / Ctrl+F |
| ----------------------------------------------------- | ---------- |
| Jump to start of line                                 | Ctrl+A     |
| Jump to end of line                                   | Ctrl+E     |
| Move back one word                                    | Alt+B      |
| Move forward one word                                 | Alt+F      |

# Editing

| Action<br>Delete to start of line | Shortcut<br>Ctrl+U     |
| --------------------------------- | ---------------------- |
| Delete to end of line             | Ctrl+K                 |
| Delete previous word              | Ctrl+W / Alt+Backspace |

# Autocomplete

| Action                                             | Shortcut  |
| -------------------------------------------------- | --------- |
| Enter suggestion mode / accept selected suggestion | Tab       |
| Exit suggestion mode                               | Shift+Tab |
| Enter suggestion mode (from fresh input)           | ↓         |
| Accept first/selected suggestion (at end of line)  | →         |

# History

| Action                                                   | Shortcut   |
| -------------------------------------------------------- | ---------- |
| Previous history entry / navigate suggestions up         | ↑ / Ctrl+P |
| Next history entry / navigate suggestions down           | ↓ / Ctrl+N |
| Reverse history search (type to filter, Ctrl+R to cycle) | Ctrl+R     |

# Other

| Action                                                                                         | Shortcut        |
| ---------------------------------------------------------------------------------------------- | --------------- |
| Execute command or accept suggestion<br>Undo autocomplete / exit suggestion mode / clear input | Enter<br>Escape |
| Clear screen                                                                                   | Ctrl+L          |
| Exit                                                                                           | Ctrl+C / Ctrl+D |

# Troubleshooting

If you are having trouble running Obsidian CLI:

- Make sure you are using the latest Obsidian installer version (1.12.4 or above).
- Restart your terminal after registering the CLI for the PATH changes to take effect.
- Obsidian must be running. The CLI connects to the running Obsidian instance. If Obsidian is not running, the first CLI command should launch the app.

# Windows

Obsidian CLI on Windows requires the Obsidian 1.12.4+ installer. See Installer version update.

Windows uses a terminal redirector that connects Obsidian to stdin/stdout properly. This is necessary because Obsidian normally runs as a GUI app which is incompatible with terminal outputs on Windows. When you install Obsidian 1.12.4+ the Obsidian.com terminal redirector will be added in the folder where you installed the Obsidian.exe file.

# macOS

The CLI registration adds the Obsidian binary directory to your PATH via ~/.zprofile . If you are having trouble, check the following:

Your ~/.zprofile file should contain the following line. If it's missing, you can add it manually:

export PATH="\$PATH:/Applications/Obsidian.app/Contents/MacOS"

# Alternate shells

The CLI registration only modifies ~/.zprofile , which is used by zsh (the default macOS shell). If you use a different shell, add the Obsidian binary directory to your shell's configuration file manually:

- Bash: add export PATH="\$PATH:/Applications/Obsidian.app/Contents/MacOS" to ~/.bash_profile
- Fish: run fish_add_path /Applications/Obsidian.app/Contents/MacOS

# Linux

The CLI registration creates a symlink at /usr/local/bin/obsidian pointing to the Obsidian binary (requires sudo).

# AppImage

For AppImage installs, the symlink points to the .AppImage file instead of the internal binary, since the mount path changes each launch. If sudo fails, the symlink is created at ~/.local/bin/obsidian as a fallback. If you are having trouble, check the following.

Check that the symlink exists and points to the correct binary:

ls -l /usr/local/bin/obsidian

If the symlink is missing, create it manually:

```
sudo ln -s /path/to/obsidian /usr/local/bin/obsidian
```

I the symlink was created in ~/.local/bin/ instead, make sure that directory is in your PATH. Add the following to your ~/.bashrc or ~/.zshrc :

```
export PATH="$PATH:$HOME/.local/bin"
```

If the symlink breaks after moving or renaming the .AppImage file, re-register the CLI or update the symlink manually.

### Snap

The Snap package stores insider build data in its own user data directory. If the CLI doesn't detect the insider .asar , set XDG_CONFIG_HOME to point to the Snap config path:

export XDG_CONFIG_HOME="\$HOME/snap/obsidian/current/.config"

Add this to your ~/.bashrc or ~/.zshrc to make it persistent.

### Flatpak

Obsidian tries to do this automatically, but below are the manual instructions. If it is a system install:

```
ln -s /var/lib/flatpak/exports/bin/md.obsidian.Obsidian
~/.local/bin/obsidian
```

If it is a user install:

```
ln -s ~/.local/share/flatpak/exports/bin/md.obsidian.Obsidian
~/.local/bin/obsidian
```

#### LINKS TO THIS PAGE

Home

Obsidian Headless
