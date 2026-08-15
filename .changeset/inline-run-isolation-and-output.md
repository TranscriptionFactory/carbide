---
"carbide": patch
---

Keep inline AI edits in the note they started in, and out of the model's chatter

Two problems with inline AI (Cmd-K in the editor), both of which put text in
your note that you never asked for.

An inline run remembered only one note at a time, app-wide. Start an edit in one
note, switch to another, then accept, and the accept was aimed at the note now
on screen while still carrying the _other_ note's text — a change that reads as
"delete everything here, paste everything from there". Accepting into a
different note than the one the run started in is now refused outright, with a
message naming the note to go back to.

Nothing filtered what the model said. If it replied "Here is your response:" or
wrapped its answer in a code fence, that went straight into the document —
visibly in the visual editor, and irreversibly in source mode, which has no
review step. Inline output is now cleaned once the reply is complete: a leading
preamble and a fence wrapping the whole answer are removed, while fenced code
that is itself the answer, and prose that merely opens like a preamble, are left
alone. A free-form inline prompt also carries the same "output only the result,
no commentary, no code fences" instruction the built-in commands always had —
previously typing your own prompt replaced it.
