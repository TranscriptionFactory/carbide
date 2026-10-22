---
"carbide": minor
---

With Reveal Syntax on, the bold, italic, strikethrough, highlight or inline-code run under the caret in a top-level paragraph now turns into its Markdown source: the `**`, `*`, `~~`, `==` and backtick delimiters are real characters you can step through, select and delete, and the caret can rest directly after a closing delimiter. Leaving the run re-reads the source, so deleting one `*` from `**bold**` gives italic text followed by a literal `*`, as in Obsidian. Moving the caret alone never marks the note as changed or adds an undo step. Headings, lists, blockquotes, tables and runs containing inline nodes keep the previous reveal. Formatting commands, undo/redo and internal copy/paste preserve the underlying Markdown while source is revealed.
