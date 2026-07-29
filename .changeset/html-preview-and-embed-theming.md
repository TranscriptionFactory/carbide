---
"carbide": patch
---

fix(editor): readable HTML previews and embeds in both themes

- **Author-styled documents render neutral**: fenced ` ```html preview ` blocks and `![[file.html]]` embeds that carry their own colors now render on a neutral light surface (`color-scheme: light`, white page, dark default text) in both app themes, so author colors compose as designed instead of landing light-on-light or dark-on-dark. Content that declares no colors keeps the token-themed surface.
- **No more background flattening**: the dark-mode `body :where(*) { background: transparent !important }` reset, which destroyed author backdrops in HTML embeds, is gone.
- **Theme toggle**: fenced HTML previews re-render on theme change instead of staying on the previous theme's tokens, matching the embed path.
- **Token alignment**: fenced preview styles now use the same `--editor-*` tokens as the embed path.
