---
"carbide": minor
---

Add a "Today" period to Recents, and make non-markdown files visible and filterable

Recents gained a **Today** chip alongside All / Week / Month / Quarter. It cuts
off at local midnight rather than a rolling 24 hours, so a file you touched
yesterday evening does not linger in "Today" just because it was under 24 hours
ago.

The period window also filtered the wrong column. Whatever you sorted by, the
window was always applied to _created_, so a note written last month and edited
this morning fell outside "Today" — invisible at 90 days, wrong at one. The
window now constrains the same column the list is ordered by. Sorting by title
has no timestamp to window, so recency falls back to modified rather than
comparing a date against a title.

Non-markdown files were already being returned by Recents; they were simply
indistinguishable, because every row drew the same document icon. Rows now take
an icon from their file type, and a new toggle in the Recents header hides
everything that is not a note. The setting is global and survives a restart.
PDFs, e-books and canvases each read differently at a glance — in the file tree
too, where a PDF previously looked identical to a `.txt`.

Filtering a base on `file_type` used to return nothing at all. The column was
never registered as a real column, so the filter fell through to the frontmatter
lookup and produced valid SQL that matched zero rows, with no error to show for
it. Sorting by it had the same problem. Both work now, and filters gained an
`in` operator so a set of values can be matched in one clause.
