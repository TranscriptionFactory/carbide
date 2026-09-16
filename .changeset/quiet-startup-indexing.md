---
"carbide": patch
---

Startup does less redundant work: HNSW vector indexes are persisted on app exit (the next launch no longer reconciles and rewrites them), the bulk embedding pass no longer re-arms itself through the model-loaded event, the git fast path skips the vault walk only when the working tree was and is clean, the toolchain list loads only when Settings opens and never downloads from a status list, base counts refresh only on vault change and index completion, and assistant sessions hydrate from the index with bodies loaded on demand (legacy `rag/` sessions migrate on first read).
