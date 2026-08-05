---
"carbide": patch
---

Saving a note no longer waits for search indexing: the save replies as soon as the file is written, while the FTS/embedding/HNSW upsert drains asynchronously on the vault's writer thread (with `metadata-changed` now emitted after the index commit, and the types UI and plugin `write_note` RPC explicitly opting into waiting since they read the index right after). Format-on-save now runs before the write inside the save pipeline — one disk write per save instead of the old format-then-resave double save — with a guard that keeps keystrokes typed during formatting. Backlinks and graph refresh key off the index-commit event instead of the editor's dirty-flag edge, so they also pick up external and frontmatter-driven changes.
