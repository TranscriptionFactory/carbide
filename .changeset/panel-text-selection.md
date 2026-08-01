---
"carbide": patch
---

fix(ui): make chat and problems panel content selectable

Text in the AI chat panel and the Problems panel could not be selected or copied. A global `user-select: none` default-deny meant content regions that were never allow-listed — the user bubble, reasoning body, tool-call rows, and error rows — simply inherited it, while citation chips and diagnostic rows are `<button>`-like elements that a later, equally-specific re-deny rule re-blocked on source order.

- Content regions now declare selectability where it outranks the deny rule by construction, leaving the app-wide "controls stay non-selectable" intent intact.
- Drag-selection can start in the panel's padding and gutters, not just directly on text.
- The Copy button routes through the clipboard service instead of calling `navigator.clipboard.writeText` directly, so a failed copy raises a toast rather than an unhandled rejection.
- The same treatment is applied to the inline AI assistant panel.
