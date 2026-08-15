---
"carbide": patch
---

Make inline AI runs show up in history and open when you click them

Inline AI edits were recorded only when you accepted one, and even then the row
in the assistant panel's history did nothing when clicked. Everything else
vanished: a suggestion you rejected, a run that errored partway, one whose menu
you closed while it was still streaming, and every inline edit made in source
mode left no trace at all.

An inline run now opens its ⌁ history entry the moment it starts, and fills in
the reply when it settles — accepted, rejected, failed, or cut short. Clicking
any entry in the history opens its transcript, where before only chat sessions
responded and everything else was a dead click. The ⌁ group in the history list
also starts open rather than collapsed, so inline runs are visible without
finding the disclosure first.

Live runs in the assistant status popover now carry the note they belong to and
the transcript they produced, so the run you are watching can be traced back to
what asked for it.

The toast that follows an accepted inline edit now says "View transcript",
which is what its button has always done. It was labelled "Continue in chat"
and never opened the chat.
