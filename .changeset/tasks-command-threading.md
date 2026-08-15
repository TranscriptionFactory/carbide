---
"carbide": patch
---

Stop the app freezing when you edit a note while the index is rebuilding

Rebuilding the index while continuing to type would beachball the whole window
for ten seconds at a stretch, over and over, until the rebuild finished. Nothing
in the UI responded — not the editor, not the sidebar, not the menus.

Editing a note is what triggered it. Every markdown change refreshes the task
list, and the five commands behind that refresh ran on the thread that draws the
app rather than on a background one. Each of them opened its own database
connection, and opening one during a rebuild meant waiting on the rebuild's write
lock — with the app's own event loop stuck behind that wait.

Those commands now run in the background, so a rebuild can hold the database for
as long as it needs without the window stopping. Two things go with it: your own
saves no longer trigger a task-list refresh they never needed, and a save that
lands while a folder is being re-indexed is written straight away instead of
queueing behind the rest of the pass.

The lint rule meant to catch exactly this class of mistake could not see those
five commands, because it only recognised one of the two ways to write the
attribute. It now recognises both, and covers ten further commands it had also
been missing.
