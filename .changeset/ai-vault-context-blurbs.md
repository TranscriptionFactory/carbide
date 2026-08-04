---
"carbide": patch
---

AI vault context now names related notes with a one-line gist instead of nothing.

Search-index results carried no note summary at all, so the related-notes sections of an
AI prompt — similar notes, backlinks, outlinks — assembled to nothing once the
`undefined` that used to crash them was cleaned up. The index has stored a summary for
every note all along, in `notes.content_snippet`; it simply was not on the struct the
frontend receives. It is now, and it flows through backlinks, outlinks, single-note
lookups, similar notes, search hits and wiki-link suggestions.

The summary is the same 80-character gist shown in the file tree and peek tooltip, so
related-note lines read `- Title (path): first line of the note`. No reindex is needed —
the column is already populated for anything indexed recently. A note indexed before the
column existed shows no gist until its next index run.
