---
"carbide": patch
---

Fix four ways saving a note changed its markdown:

- A `#tag` at the start of a line is no longer saved as `\#tag`.
- A linked image such as a README badge, `[![badge](img.svg)](https://ci)`, keeps its link.
- A callout title with bold, code, or a link, such as `> [!note] **Bold** title`, stays the title instead of moving into the body. Formatting added to a title in the editor is now saved.
- Escaped text stays literal: `\[a](b)`, `` \`a\` ``, `\==a==`, `\<b>` and `&lt;div&gt;` no longer turn into a link, code, highlight, or HTML.
