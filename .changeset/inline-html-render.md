---
"carbide": minor
---

Render inline HTML the way Obsidian does. `<br>` in any spelling (`<br/>`, `<br />`, `<BR>`) shows as a line break, also inside table cells. Paired `<u>`, `<s>`, `<sub>`, `<sup>`, `<kbd>`, `<mark>`, `<span>` and `<font>` tags render their formatting, and inline `style` keeps only `color`, `background-color`, `font-weight`, `font-style`, `font-size` and `text-decoration`. Tags save exactly as written. Unmatched or misnested tags and other tags such as `<script>` still show as source. A `<br>` at the end of a line is no longer rewritten to `\` on load and save, so existing notes keep it. PDF/HTML export renders the same tags.
