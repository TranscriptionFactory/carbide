---
"carbide": minor
---

Watcher: self-save suppression now keys on note path and covers the `.tmp`
sibling of atomic writes, eliminating the save flicker, file-close lag, and
save/close freezes caused by unsuppressed self-triggered reloads.

Omnibar: Cmd+O no longer inherits a stale all-vaults scope from a previous
Cmd+Shift+O session, and applying filters keeps vault groups expanded instead
of bouncing back to vault selection.

Editor: wikilinks with heading anchors (`[[note#Heading]]`) scroll to the
target heading even when the note is already open.

Graph: renderer teardown no longer races async worker, resize, and RAF
callbacks (`t.geometry` / `_texturePool` unhandled errors).

App: closing the window with unsaved changes now asks before quitting, the
update-installed toast gains a Restart button, and pdf_extract glyph-mapping
warnings are filtered out of logs.
