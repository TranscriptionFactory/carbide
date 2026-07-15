---
"carbide": minor
---

Context rail: the right context rail is docked beside the editor instead of
floating over it, and reopening the docked outline from the rail works again.

Editor: per-note normal/wide width toggle persisted in frontmatter; session
transitions are serialized and teardown is hardened against throwing destroys,
fixing the duplicated toolbar left behind by an overlapping recreate_session
via the lazy port.

Outline: the docked outline is now the default with persisted pane width, and
clicking a heading moves the active marker to the clicked heading.

Explorer: dragging OS files onto the file tree imports them into the vault —
Markdown becomes indexed notes with client-side uniquify, other files reuse the
pasted-asset pipeline, folder rows target that folder, and per-file errors log
and continue.

Graph: inferred edges are shown by default and the vault-size cap is dropped.

AI: the streaming CLI provider runs in the vault directory, and CLI prompt
serialization no longer injects `<system>`/`<user>` role tags (with a
regression guard test).

Themes: all 28 confirmed theme-audit findings applied — statusbar fg/bg
pairing, layout-variant scope prefixes, radius/size token fixes, and dead CSS
archived.
