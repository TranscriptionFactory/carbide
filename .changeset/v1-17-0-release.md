---
"carbide": minor
---

### New Features

- **Speech-to-text (STT):** Full dictation support with configurable Whisper model, custom model path, keyboard shortcut, and settings UI with expandable model catalog
- **Block drag-and-drop:** Drag handles on editor blocks with section-aware positioning and baseline alignment per block type
- **Block embeddings & semantic search:** Section embedding pipeline, HNSW vector index for O(log n) approximate nearest-neighbor search, `block_knn_search`, and `find_similar_blocks` command via smart links

### Fixes

- **Embeddings:** Off-by-two tokenizer truncation crash, N+1 query in block similarity, stale data and tag regression, proportional throttle in dev, include last line of section in embedding text
- **Logging:** Crash-proof logging and console cleanup, silence settings/HNSW debug spam, replace `console.error` with `create_logger` in STT adapter
- **Editor:** Drag grip opacity, CLI sidecar resolution from correct bundle location
