---
"carbide": patch
---

Strip a trailing "Let me know if you'd like me to adjust anything!" from AI output

The sanitizer that runs between a model reply and your note removed chatty
_openers_ ("Sure! Here's the rewrite:") but had no counterpart at the end, so a
closing sign-off landed in the document. In source-mode inline runs there is no
accept step to catch it, so the sentence simply appeared in the note.

The trailing rule is deliberately stricter than the leading one, because the two
failure modes are not symmetric: over-stripping at the start costs you a preamble
you never wanted, while over-stripping at the end deletes the last line _you_
wrote — and the whole-document path asks the model to return your entire note, so
the final paragraph is usually yours. A trailing paragraph is therefore only
removed when it is a single line that both opens with an offer ("Let me know",
"Would you like me to", "Feel free to", "Happy to") _and_ offers to revise this
text specifically ("adjust", "expand", "tweak", "rewrite", "any changes"). Both
halves are required.

Ordinary writing that happens to end that way is left alone: "So where does that
leave the migration?", "Let me know if you'd like to grab coffee!" and "Would you
like me to bring anything to the retro?" all survive untouched, as do trailing
lists, tables, blockquotes and fenced code blocks. Where the rule is unsure it
removes nothing.
