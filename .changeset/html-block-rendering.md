---
"carbide": patch
---

fix(editor): unfreeze the HTML preview and drop its phantom padding

- **The preview was permanently frozen, not slow**: `update()` recorded the new source as "last rendered" _before_ the 250ms debounce fired, so the render then early-returned forever and only a theme change could refresh it. Bookkeeping now happens after a successful render, so edits re-render as you type.
- **Loose HTML no longer renders inside a code-block box**: a bare `<div>` paragraph is styled as plain content instead of inheriting code-block chrome.
- **Previews size to their content**: the frame no longer reserves a fixed 18rem for a one-line preview — the iframe reports its measured content height and the parent clamps it to a sane range. The always-mounted resize strip collapses until hover.

Preview theme tokens are cached per theme change rather than recomputed on every render.
