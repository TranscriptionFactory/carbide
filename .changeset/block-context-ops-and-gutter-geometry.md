---
"carbide": patch
---

fix(editor): block context-menu ops and gutter geometry

- **Right-click targets the block under the pointer**: the context menu resolved its target from the caret, which the menu itself had just moved, so Delete and Duplicate silently no-oped. The menu now captures the pointer-resolved block position plus a fresh block-selection snapshot when it opens, and routes single-block ops through position-taking transforms.
- **Copy works again**: the block-context copy path no longer falls back to `execCommand("copy")` (which copied nothing once the menu took focus). Selected blocks — or the right-clicked one — are serialized into a rich `data-pm-slice` payload and written through the clipboard service, so failures raise the existing clipboard toast.
- **Handles stay in the gutter**: editor padding now reads `--editor-gutter-inline` per element instead of resolving it once at `:root`, so the wide width mode no longer pushes the block handle into the text column. The insert button and grip grew to 24px targets.
