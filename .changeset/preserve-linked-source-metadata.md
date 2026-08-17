---
"carbide": patch
---

Preserve linked-source metadata when a source is re-indexed

Re-indexing a linked source with a sparse metadata update cleared values that
only enrichment could provide, including citekeys, authors, DOI, journal and
abstract. Linked-source indexing now updates the fields it computed without
replacing the existing note row, so previously enriched metadata survives.
