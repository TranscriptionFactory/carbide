---
"carbide": patch
---

Scope find and replace to the selected text, and keep the match count live

Two find-in-file problems, both of which showed up as "replace doesn't work".

Find now honours a selection. Opening the find bar with several lines selected
scopes the search to exactly that range: the count, the highlights, Replace and
Replace All all stop at its edges, so Replace All no longer rewrites the parts
of the note you deliberately left out. Previously the selection vanished the
moment the bar took focus and the search silently covered the whole document.
The scope follows the text as you edit — replacing inside it keeps it aligned —
and if you delete the scoped passage outright, find falls back to the whole
note rather than searching an empty range. Opening find with a short single-line
selection seeds the query from it instead of scoping, the way you would expect.

The match count no longer goes stale. Typing new matching text into the note
used to leave the counter reading its old value while the new matches were
already highlighted on screen, and if the stale position pointed past the end of
the match list, both Replace buttons greyed out even though matches were plainly
visible. The count and the selected match now update as the document changes.

One thing worth knowing, now noted on the find field itself: find searches the
rendered text, not the Markdown source. Block markers that Carbide renders as
structure rather than text — the `>` of a blockquote, a callout's `[!note]` —
are not part of that text and cannot be found.
