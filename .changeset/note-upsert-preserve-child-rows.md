---
"carbide": patch
---

Preserve a note's indexed child rows and cross-path columns on every save

Saving a note deleted and re-inserted its database row, which cascaded away the
note's tags, sections, code blocks and task rows before they could be rebuilt.
Task lines that had not changed were rewritten anyway, so every save churned the
tasks table even when nothing differed. Note saving now updates the row in
place: child rows survive, unchanged task lines are left alone, and the note's
page offsets and source are no longer reset when a note crosses between the
markdown and plain-content indexing paths.
