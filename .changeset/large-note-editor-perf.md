---
"carbide": patch
---

Large notes (around 800KB) open and type much faster. Undo now uses ProseMirror's own history instead of Yjs, which also fixes undo being lost after switching away from a note and back, and a note inheriting another note's undo stack. Session-link, heading-fold and drag-handle decorations now update only what an edit touched rather than rebuilding for the whole document on every keystroke. Drag handles now exist only for blocks near the screen, and not at all when the handle setting is off. The outline updates from the blocks an edit touched instead of re-reading every heading, and turning a paragraph into a heading now shows up in the outline. A leftover image-width pass that walked the whole document on every update is gone. An empty diagnostics list no longer triggers a redundant editor update after each save. Browser spellcheck turns off above the existing large-document threshold (400K characters or 8,000 lines).
