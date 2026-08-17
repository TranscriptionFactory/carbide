---
"carbide": patch
---

Tick a checkbox and see it in the tasks panel straight away

Editing a note kept every part of the index up to date except one. Saving
refreshed the note's tags, headings, sections, code blocks and links, but never
touched the tasks table. So a checkbox you ticked, a task you added, or a task
line you deleted stayed at its old state everywhere tasks are read from —
the tasks panel, task queries and task smart blocks — until the next vault sync
or a full index rebuild happened to pass over the file. Everything else about
the same note updated immediately, which made tasks look randomly frozen rather
than pending.

The cause was placement: task extraction ran only inside the vault indexer, on
the path that walks files from disk, and not in the shared note-upsert that
every editor save goes through. Tasks are now synced alongside the tags,
headings, sections and links in that shared upsert, so a save updates them the
same way and at the same moment as everything else. The indexer keeps working
as before, because it goes through the same upsert.

Task rows stay limited to markdown files, unchanged from before: a checkbox in
a canvas card is not indexed as a task, because its line number would not point
anywhere in the file on disk.

Separately, saving tasks now skips the write entirely when a note's tasks are
identical to what is already stored. Ticking one box in a long list previously
deleted and reinserted every task row in the note.
