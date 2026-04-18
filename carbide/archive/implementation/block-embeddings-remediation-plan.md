# Block Embeddings Remediation Plan

## Context

`feat/block-embeddings-clean` adds block-level semantic embeddings using `snowflake-arctic-embed-xs` (384 dims, local CPU inference via `candle`), HNSW in-memory index, and SQLite persistence. The feature works but has six issues to address before or shortly after merging.

## Issues (ordered by impact)

### 1. Embeddings not auto-triggered on save

**Problem:** `handle_upsert` / `handle_upsert_with_content` delete the note's embeddings from SQLite and HNSW but never re-embed. The index silently goes stale after every edit until the user manually calls `embed_sync`.

**Fix:** After the upsert completes on the writer thread, enqueue a new `EmbedNote { note_id }` command that re-embeds just that note (note-level + its block sections). This keeps it serialized on the writer thread, avoiding races.

**Implementation:**
- Add `DbCommand::EmbedNote { note_id: String }` variant
- In `handle_upsert` / `handle_upsert_with_content`, after removing old embeddings, send `EmbedNote` to the writer channel (self-enqueue via a clone of the sender)
- `handle_embed_note` fetches the note body from FTS, embeds it (1 inference call for note-level + 1 batch for its sections), inserts into SQLite + HNSW
- No debounce needed — the writer thread is already serialized, so rapid saves just queue up. The HNSW insert for a single note is sub-millisecond

**Files:** `service.rs` (add command variant + handler), pass `tx: Sender<DbCommand>` clone into upsert handlers

**Risk:** Low. Single-note embedding is ~10-50ms on CPU, well within acceptable latency for a background writer thread.

---

### 2. No truncation guard on tokenizer

**Problem:** Truncation is explicitly disabled (`with_truncation(None)`). `snowflake-arctic-embed-xs` has `max_position_embeddings: 512`. Sequences exceeding 512 tokens will panic or produce garbage.

**Fix:** Enable truncation before padding in `EmbeddingService::new`:

```rust
tokenizer
    .with_truncation(Some(TruncationParams {
        max_length: 512,
        strategy: TruncationStrategy::LongestFirst,
        ..Default::default()
    }))
    .map_err(|e| format!("tokenizer truncation config: {e}"))?
    .with_padding(Some(PaddingParams {
        strategy: PaddingStrategy::BatchLongest,
        ..Default::default()
    }))
    .map_err(|e| format!("tokenizer padding config: {e}"))?;
```

**Files:** `embeddings.rs`

**Risk:** None. This is a correctness fix.

---

### 3. Startup HNSW rebuild blocks calling thread

**Problem:** `ensure_worker` calls `VectorIndex::rebuild_from_sqlite` synchronously on the Tauri command handler thread. For large vaults (thousands of notes), this blocks the first command for seconds.

**Fix:** Initialize both indexes as empty, then rebuild asynchronously on the writer thread.

**Implementation:**
- In `ensure_worker`, create empty indexes: `VectorIndex::new(384)` for both note and block
- Add `DbCommand::RebuildIndex` variant
- Immediately after spawning the writer thread, send `RebuildIndex` through the channel
- `handle_rebuild_index` does the `rebuild_from_sqlite` on the writer thread
- Queries before rebuild completes return empty results (acceptable — they'd return empty anyway before first `embed_sync`)

**Files:** `service.rs`, `hnsw_index.rs`

**Risk:** Low. Queries during rebuild return empty, same as current behavior on a fresh vault.

---

### 4. N+1 queries in `query_block_semantic_similarity`

**Problem:** Two N+1 patterns:
1. `get_block_embeddings_for_note(conn, candidate_path)` called per candidate (up to 50 queries)
2. `SELECT title FROM notes WHERE path = ?` called per hit (up to 50 queries)

**Fix:** Batch both queries.

**Implementation:**
- Add `get_block_embeddings_for_notes(conn, paths: &[&str]) -> HashMap<String, Vec<(String, Vec<f32>)>>` to `vector_db.rs`:
  ```sql
  SELECT path, heading_id, embedding
  FROM block_embeddings
  WHERE path IN (?, ?, ...)
  ```
- Add `get_note_titles_batch(conn, paths: &[&str]) -> HashMap<String, String>` to `search_db.rs`:
  ```sql
  SELECT path, title FROM notes WHERE path IN (?, ?, ...)
  ```
- Replace the per-candidate loop and per-hit title lookup in `query_block_semantic_similarity`

**Files:** `vector_db.rs`, `search_db.rs`, `smart_links/rules.rs`

**Risk:** None. Pure optimization, same results.

---

### 5. Enable Metal/Accelerate for Apple Silicon

**Problem:** All candle crates use `default-features = false` with no backend features. Inference runs on naive CPU loops, ~5-10x slower than necessary on Apple Silicon.

**Fix:** Enable `accelerate` (CPU BLAS, zero risk) and optionally `metal` (GPU) behind a feature flag.

**Implementation:**
- Phase 1 (safe): Add `accelerate` feature to all three candle crates in `Cargo.toml`. No code changes needed — candle auto-dispatches BLAS ops.
  ```toml
  candle-core = { version = "0.9", features = ["accelerate"] }
  ```
- Phase 2 (optional): Add `metal` feature and probe at runtime:
  ```rust
  let device = if cfg!(target_os = "macos") {
      Device::new_metal(0).unwrap_or(Device::Cpu)
  } else {
      Device::Cpu
  };
  ```

**Files:** `Cargo.toml`, `embeddings.rs` (phase 2 only)

**Risk:** Low for `accelerate` (CPU-only, well-tested). Medium for `metal` — needs testing for correctness, and Metal context creation can fail on CI/headless environments.

---

### 6. Vector duplication in HNSW sidecar

**Problem:** Every vector is stored in both the HNSW graph and a `HashMap<String, Vec<f32>>` sidecar because `hnsw_rs` has no retrieval API. At 50k blocks this is ~73 MB duplicated.

**Fix:** Accept as-is. The sidecar is intentional — only two call sites use `get_vector` (to fetch the source note's own vector for HNSW queries). Alternatives:
- Fetch from SQLite instead: adds I/O latency to every smart-links query
- Switch HNSW library: high effort, low payoff

**Recommendation:** Do not fix. ~73 MB is acceptable for a desktop app. Document the tradeoff. Revisit only if targeting mobile or if vault sizes exceed 100k blocks.

---

## Execution order

| Priority | Issue | Effort | Merge-blocking? |
|----------|-------|--------|-----------------|
| P0 | 2. Truncation guard | 10 min | Yes — correctness bug |
| P0 | 1. Auto-embed on save | 1-2 hr | Yes — feature is broken without it |
| P1 | 4. N+1 batch queries | 30 min | No — perf only |
| P1 | 3. Lazy HNSW rebuild | 30 min | No — perf only |
| P2 | 5. Metal/Accelerate | 15 min (phase 1) | No — perf only |
| — | 6. Vector duplication | — | No — accepted tradeoff |

**Recommendation:** Fix P0 items (truncation + auto-embed) before merging. Ship P1/P2 as fast follow-ups.
