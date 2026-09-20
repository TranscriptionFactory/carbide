---
"carbide": minor
---

The Marquee can scroll heading sections alongside your tasks. A **Sections query** group in its settings filters by heading title, heading level, or the heading path to sit under; matching sections join the task rows in the same scroll, showing their level, title and heading path. Clicking a section row opens its note scrolled to that heading. The section pool stays off until one of those three settings is set, so a task-only Marquee behaves exactly as it did.

Plugins gain `sections.query` behind a new `sections:read` permission, for reading the heading index with the same structured filter the `sections` query noun takes. Its `start_line` values are the 0-based markdown lines `note.open`'s `line` argument accepts, so a plugin can open a note at a heading directly.
