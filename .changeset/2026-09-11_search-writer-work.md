---
"carbide": patch
---

Semantic search saves upserts in a single transaction, skips re-embedding content refused this session, and skips the full vault walk when git HEAD matches the last indexed commit, cutting redundant writer-thread work on save, embed, and sync.
