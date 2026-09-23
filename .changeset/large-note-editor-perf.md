---
"carbide": patch
---

Large notes (around 800KB) open and type much faster. Undo now uses ProseMirror's own history instead of Yjs, which also fixes undo being lost after switching away from a note and back, and a note inheriting another note's undo stack. Session-link, heading-fold and drag-handle decorations now update only what an edit touched rather than rebuilding for the whole document on every keystroke. Drag handles are aligned only for blocks on screen. An empty diagnostics list no longer triggers a redundant editor update after each save. Browser spellcheck turns off above the existing large-document threshold (400K characters or 8,000 lines).
