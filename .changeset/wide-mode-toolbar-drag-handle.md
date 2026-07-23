---
"carbide": patch
---

fix(editor): correct table toolbar and drag handle positioning in wide mode

The table toolbar jumped to the top-left of the window when a table was switched to full-width layout: toggling the `layout` attr replaces the `<table>` element, but the floating-ui `autoUpdate` kept its now-detached anchor, so `computePosition` collapsed to ~(0,0). The toolbar now rebinds its anchor whenever the underlying table element is swapped.

Block drag handles were invisible when a note used wide width mode: `.ProseMirror` fills the pane (`max-width: none`), so the handle's `left: -1.75rem` gutter offset fell off the pane edge. In wide mode the handle is now anchored inside the padding gutter instead.
