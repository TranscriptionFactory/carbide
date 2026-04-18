# Block Embeddings: Follow-up Fixes

Branch: `feat/block-embeddings-clean` (cherry-picked from `feat/block-embeddings`)

## Done

- [x] **N+1 query in `query_block_semantic_similarity`** — hoisted `get_block_embeddings_for_note` outside inner loop (5138b050)
- [x] **Dead code** — removed `vector_key_map` table, `dirty` field, `block_knn_search` (5138b050)
- [x] **MCP tool count tests** — updated for `reindex` tool already on main (4306e202)
- [x] **`config` field on SmartLinkRule** — removed reference from plugin branch (4306e202)

## Remaining

### 1. HNSW auto-compaction (robustness)

**Problem:** `VectorIndex::remove()` marks entries as stale but can't remove them from the HNSW graph. `needs_rebuild()` and `compact_from_vectors()` exist but are never called automatically. Over long editing sessions, stale entries accumulate unbounded.

**Location:** `src-tauri/src/features/search/hnsw_index.rs:225-246`

**Fix:** After embed batch completes in `handle_embed_batch` / `handle_block_embed_batch` (service.rs), check `needs_rebuild()` on both `note_index` and `block_index`, and call `compact_from_vectors()` if true. The threshold is already set at >30% stale with >100 entries.

```rust
// After batch embedding loop in service.rs
if let Ok(mut ni) = note_index.write() {
    if ni.needs_rebuild() {
        ni.compact_from_vectors();
    }
}
```

### 2. RwLock poisoning silent no-op (robustness)

**Problem:** Every `note_index.write()` and `block_index.write()` call (26 sites in service.rs) uses `if let Ok(mut ni) = ...` which silently drops the error if the lock is poisoned. If a panic occurs while holding the write lock, the in-memory HNSW index silently diverges from SQLite — all subsequent writes no-op.

**Location:** `src-tauri/src/features/search/service.rs` — all `if let Ok(mut ni) = note_index.write()` / `block_index.write()` patterns

**Fix:** At minimum, add `else { log::error!("note_index/block_index lock poisoned"); }` to each site. Better: extract a helper that logs on poison and consider recovering by rebuilding the index from SQLite.

### 3. Integration tests for orchestration layer (coverage)

**Missing tests for:**
- `find_similar_blocks` (Tauri command, `service.rs`) — end-to-end block similarity search
- `knn_search_batch_indexed` (`service.rs`) — batch KNN using in-memory HNSW
- `rebuild_from_sqlite` — HNSW index reconstruction from persisted embeddings
- `handle_block_embed_batch` (`service.rs`) — the block embedding orchestration function

**Note:** Unit coverage on `vector_db.rs` (13 tests) and `hnsw_index.rs` (10 tests) is solid. The gap is at the integration/orchestration level.

### 4. Body cloning per section (performance nit)

**Problem:** In `handle_block_embed_batch`, each section extraction clones the full note body via `fts_cache`:

```rust
let body = match fts_cache.entry(path.to_string()).or_insert_with(|| ...) {
    Some(b) => b.clone(),  // full body clone per section
    None => continue,
};
```

For a note with 10 sections, that's 10 full-body string clones.

**Location:** `src-tauri/src/features/search/service.rs`, inside `handle_block_embed_batch`

**Fix:** Store `Arc<String>` in the cache, or restructure to extract all sections from a note in one pass before moving to the next note.

### 5. Remove planning doc from branch

The file `carbide/2026-04-08_block_embeddings_fixes_plan.md` was cherry-picked in from the `improved block embeddings` commit. It's a planning artifact, not source code. Remove it before merge.

### 6. `Hnsw<'static, f32, DistCosine>` lifetime contract (documentation)

**Location:** `src-tauri/src/features/search/hnsw_index.rs:14`

The `'static` lifetime works because `hnsw_rs` clones inserted data internally. This is an implicit contract with the library. Add a comment explaining this so future maintainers don't assume the data must outlive the index.
