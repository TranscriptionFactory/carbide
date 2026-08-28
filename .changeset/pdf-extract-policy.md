---
"carbide": patch
---

Stop indexing the `.tmpfiles/` scratch dir and stop re-paying PDF extraction failures. The scratch dir's placeholder PDFs (`fig.pdf` with invalid headers) produced a WARN flood from the indexer; they are now builtin-ignored (`.claude/` stays indexed). Font-heavy journal PDFs that exceed the old 30 s subprocess timeout stalled every `linked_source_extract_file` call for 31 s; the timeout is now 120 s for this background path, and a failed extraction is negative-cached per file identity (path + len + mtime) so re-linking an unchanged file doesn't retry it.
