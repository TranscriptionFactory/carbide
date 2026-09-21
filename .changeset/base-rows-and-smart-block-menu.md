---
"carbide": patch
---

A ` ```base ` block now shows each matching note once when its query is a
`sections` query. Section results collapse to one row per note, in the order the
notes first match, and the "Showing N of M" count is the number of distinct
notes rather than the number of section rows.

The slash menu also names the two query-backed blocks for what they render:
`query` is now **Note List** ("Plain list of notes or sections matching a
query") and **Base View** reads "Table, kanban, calendar or tree of notes
matching a query, with properties". Typing `/block` now surfaces Code Block
first.
