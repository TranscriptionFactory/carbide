---
"carbide": patch
---

Semantic search no longer returns or stores corrupted embeddings when two searches, or a search and background indexing, run at the same time on Apple Silicon. Overlapping GPU passes produced vectors that were NaN or effectively random; encoder passes now run one at a time.
