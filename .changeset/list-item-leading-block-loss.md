---
"carbide": patch
---

Saving a note no longer damages list items that start with something other than plain text. Before this fix, a code block, heading, quote, table, HTML block, horizontal rule, reference definition or footnote definition at the start of a list item was flattened into plain text or deleted. These blocks now stay intact through repeated saves.
