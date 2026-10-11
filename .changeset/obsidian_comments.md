---
"carbide": minor
---

Support Obsidian comments. `%%inline%%` comments (also across bold or italic text) and block comments that start on a line beginning with `%%` show dimmed in the editor and are hidden in read-only mode and in PDF/HTML export; an unclosed block comment hides the rest of the note. Comments save byte-for-byte, and backslash-escaped `\%%` markers keep their backslash on save. Export also hides `<!-- -->` HTML comments. `%%` inside inline code and code blocks is left alone.
