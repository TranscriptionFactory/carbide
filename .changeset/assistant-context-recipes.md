---
"carbide": minor
---

feat(assistant): one context assembler behind every AI surface, and question chips you can edit

The four places Carbide builds context for a model — the inline AI menu in the visual
editor, the same menu in source mode, the AI panel, and vault chat — each had their own
idea of what "context" meant. They ordered it differently, deduplicated it differently
(or not at all), and only chat had a budget. All four now declare which context sources
they want and hand them to one assembler that orders, deduplicates, budgets and
truncates them the same way.

A recipe now carries a policy — which context sources it reads, what it may do with
tools, and how its output is applied — so the same recipe means the same thing whether
you run it inline or from the panel. Built-in recipes keep their existing behaviour
exactly; they simply inherit each surface's defaults.

Chat question chips ("Summarize", "Action items", "Open questions", "Timeline") are now
editable in Settings → AI, alongside the inline commands. Override a built-in's label or
wording, reset it, or add your own; write `{scope}` wherever the active scope should
appear.

Five behaviour changes came with the consolidation, all deliberate:

- **Retrieved context is ordered deterministically.** Chat previously broke score ties by
  whatever order search happened to return results in, so the same question against an
  unchanged vault could send different context. Ties now break on the note itself.
- **A truncated note can no longer come back longer than the original.** The old chat
  assembler had an off-by-one that, when a note was cut to exactly its head, appended the
  entire note after the truncation marker and blew the context budget.
- **Pinned `@mentions` reserve their budget explicitly** rather than relying on a sentinel
  score to sort first. Same result, but it no longer depends on an arbitrary large number.
- **A whitespace-only selection is ignored.** Selecting a few blank lines and running an
  inline command or a panel edit used to send that whitespace as the prompt; it now falls
  back to the surrounding context, as it does when nothing is selected.
- **Chat reports a pinned note's score as 0** in the sources list instead of a sentinel.

The AI panel still sends the whole note uncapped — consolidating the assemblers did not
change that, and capping it is a separate decision.
