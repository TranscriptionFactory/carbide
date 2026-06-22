---
"carbide": minor
---

Add editable note properties and a CSV table viewer, and harden the vault search index against drift.

- The properties rail is now fully editable: add, edit, and delete frontmatter properties with combobox key/value pickers whose fuzzy-ranked suggestions blend a curated Carbide field catalog with the keys and values already used across your vault. List-valued properties (keywords, aliases, etc.) render as chips instead of raw `["a","b"]` text and stay lists when edited. Edits write straight to the note's frontmatter.
- `.csv` files now open in a sortable, virtualized table with click-to-copy cells instead of falling through to the plain-text editor.
- Externally edited notes now re-embed automatically: every index sync (including the vault-open background sync) chases its work with an embed pass, so notes changed outside the app no longer keep stale vectors until an unrelated trigger fires.
- Vector search no longer returns deleted or renamed notes — they are evicted from the in-memory HNSW indices on path sync instead of lingering until the next full rebuild — and changed content re-embeds via a content hash so edits actually update their vectors.
- HNSW indices now compact once dead nodes pass a staleness threshold, reclaiming the space left by re-embeds that previously grew the graph unbounded until restart.
- Search indexing is faster: larger per-transaction batches on full rebuild, `PRAGMA optimize` after rebuild/sync to keep the query planner sound as the vault grows, and a capped embedding yield to reclaim idle time.
- Collapsible sections (callouts, collapsible blocks, and other nested wrappers) are preserved across save and tab-switch syncs instead of being unwrapped and hoisted out.
- Bundled plugins now resolve correctly under Tauri's `_up_` resource prefix.
