---
"carbide": patch
---

fix(editor): stop the caret jumping when walking through formatted text

Arrow-keying across `**bold**`, `==highlight==`, `` `code` `` or `***both***` skipped columns and recoiled at the end of a run. The revealed delimiters were rendered as text-bearing zero-width widgets, so ProseMirror's node-skipping and the browser's native cursor movement compounded into multi-column jumps.

Delimiters are now inline decorations drawn with CSS pseudo-elements — the same approach the heading markers already use — so they occupy no selectable positions. Every caret position across a formatted run is reachable in exactly one keypress in each direction.

Reveal is also per-textblock rather than per-run, so line layout stays stable while walking, and mark escaping happens in `appendTransaction` instead of dispatching mid-keydown.
