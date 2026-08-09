# Vault Indexing & Embedding — Review Findings

**Date:** 2026-06-15
**Scope:** `src-tauri/src/features/search/` — embedding generation, HNSW vector
index, vector persistence, and the indexing worker/queue orchestration.
**Files reviewed:** `embeddings.rs`, `hnsw_index.rs`, `vector_db.rs`,
`service.rs` (indexing path), `text_extractor.rs`, `html_extractor.rs`.

The architecture is sound: two-tier block→note composition, HNSW for ANN, SQLite
as source of truth, tombstone-based deletes with a rebuild threshold. The issues
below are concrete bugs and inefficiencies on top of that design, ordered by
severity.

---

## Bugs

### 1. [HIGH] Index dimensionality hardcoded to 384 — one selectable model silently breaks search

`VectorIndex::new(384)` at `service.rs:479-480` and `:848-849`. The embedding
model is user-configurable (`short_id_to_hf_repo`, `service.rs:34-43`), and
`snowflake-arctic-embed-m` emits **768-dim** vectors. When a user selects it:

- `handle_embed_batch` detects the version change, clears, re-embeds →
  `upsert_embedding` stores 768-dim blobs in SQLite (no dim check).
- `VectorIndex::insert` rejects every vector via
  `if vector.len() != self.dims { return }` (`hnsw_index.rs:117-119`) → **the
  in-memory HNSW index stays empty**.
- `search` also early-returns on `query.len() != self.dims` (`:196`).

Result: the entire indexed semantic path returns nothing, silently, with no
error surfaced.

**Fix:** derive `dims` from the loaded model (carry it on `EmbeddingService`)
and build the index with that dimension; recreate the index when the model
changes. Minimum viable fix: expose `EmbeddingService::dims()` from the model
config and thread it through index construction.

### 2. [HIGH] A note's note-level vector is computed two different ways depending on code path

On save, `embed_note_on_save` sets the note vector to
`embed_one(truncated FTS body)` (`service.rs:946-952`). On full rebuild,
`handle_embed_batch` sets it to `mean_pool_normalize(block vectors)`
(`service.rs:1546-1549`). These produce different vectors for the same note, so
ranking/recall drifts depending on whether a note was last touched by an
incremental save or a batch rebuild. The `DL-003` comment declares
composition-from-blocks the design — the save path doesn't honor it.

**Fix (done):** `embed_note_on_save` now embeds blocks first, then composes the
note vector by mean-pooling the note's block vectors (via
`get_block_embeddings_for_note`), falling back to `embed_one(embed_text_for_note)`
only when there are no qualifying sections — identical to `handle_embed_batch`.

### 3. [MED] HNSW search can request more neighbours than `ef`, degrading recall

`hnsw_index.rs:200-203`: `fetch = (limit + stale_count).max(limit*2)` is passed
as `knbn`, but `ef_search = (limit*2).max(32)` is passed as `ef`. HNSW requires
`ef >= knbn`; once `stale_count` is non-trivial, `fetch > ef_search` and recall
silently drops — exactly in the window before `needs_rebuild` triggers at 30%
stale.

**Fix:** `ef_search = fetch.max(32)`.

### 4. [MED] Cancelled model-version upgrade commits the new version but only partially re-embeds

`handle_embed_batch` clears everything, calls `set_model_version(new)`
(`service.rs:1461`) *before* embedding, then embeds. If cancelled/shut down
mid-pass, `get_model_version` reports the new model, but many notes lack
embeddings — and they won't be re-embedded because the next `embed_sync` skips
anything in `already_embedded` (`:1474-1483`).

**Fix:** set the model version only after a fully uncancelled pass.

### 5. [LOW] SQLite/HNSW divergence on dropped errors

`let _ = upsert_embedding(...)` followed by unconditional `ni.insert(...)`
(`service.rs:949-952`, `:995-1001`, `:1559-1564`, `:1778-1786`): if the DB write
fails, the index holds a vector SQLite doesn't, and poisoned `.write()` locks are
silently skipped while the DB write already landed. Recoverable via rebuild, but
worth a `log::error!` so divergence is observable.

---

## Inefficiencies

### 6. [MED] Indexing deliberately runs at ~50% duty cycle

Both embed loops do `thread::sleep(batch_start.elapsed())` — sleeping for exactly
as long as each batch took (`service.rs:1640`, `:1807`). That doubles full-vault
indexing wall-time. The worker already sets background QoS
(`set_current_thread_to_background_qos`), so this is redundant throttling.

**Fix:** sleep a small fraction of the batch time (e.g. `/4`) instead of the full
duration.

### 7. [MED] `knn_search` / `knn_search_batch` bypass the HNSW index entirely

`vector_db.rs:106-202` load *all* embeddings from SQLite and brute-force every
call — and `knn_search_batch` (related-notes graph) is O(n²) with per-pair
`format!` dedup keys (`:192`). For large vaults this defeats the purpose of the
HNSW index.

**Fix:** route these through the in-memory index.

**Investigation (2026-06-15):** The index-backed path already exists and is wired
up — this is a *cleanup*, not new work.

- Every production semantic caller already uses the in-memory index:
  `semantic_search`, `find_similar_notes`, `search_blocks` go through
  `VectorIndex::search` (HNSW); `semantic_search_batch` goes through
  `knn_search_batch_indexed` (`service.rs`), which sources vectors from the
  in-memory index via `get_vector` — no SQLite scan, no per-call deserialize.
- The two brute-force fns are dead: `knn_search` has zero production callers (only
  two in-file tests use it); `knn_search_batch` has zero callers anywhere.
- The metric/threshold concern is a non-issue: `dot_distance = 1 − dot ≡
  DistCosine` for the L2-normalized vectors we store (same order, same scale), and
  no path mixes the two. The batch fn is *intentionally* exhaustive pairwise
  within the selected path set — routing it through `VectorIndex::search` would
  return global NN filtered down to the set and silently drop in-set edges, so it
  must stay as-is.

**Plan:** (a) delete dead `knn_search_batch`; (b) move `knn_search_batch_indexed`
into `vector_db.rs` next to `dot_distance` + the test fixtures, with a doc note on
why it stays pairwise-within-set; (c) gate `knn_search` behind `#[cfg(test)]` as a
brute-force test oracle; (d) add parity/self-exclusion/linked-exclusion/threshold/
symmetric-dedup tests for the index-backed batch fn.

### 8. [MED] `Selector::parse` recompiled per HTML file

`html_extractor.rs:28,35,43` reparse constant `"title"`/`"h1"`/`"body"`
selectors on every file during a full index pass.

**Fix:** hoist to `LazyLock` statics.

### 9. [LOW] `embed_sync` re-scans the full embedded-path set on every invocation; TOCTOU double-enqueue

The `is_embedding` flag is only set when the command is *dequeued*, so two rapid
syncs both enqueue. `get_embedding_status` also hardcodes `is_embedding: false`
(`service.rs:~2727`), so the status surface never reflects an in-flight embed.

---

## Adjacent (not core indexing/embedding)

- `resolve_snippet_page` (`text_extractor.rs:197`) maps a snippet to a page by
  first-substring match, so repeated fragments (PDF headers/TOC) cite the wrong
  page; PDF page offsets are recorded pre-truncation but stored with the
  truncated body (`:147-155`).
- `rebuild_from_sqlite` silently drops any vector whose length ≠ dims
  (`hnsw_index.rs:66,96`) — same hidden failure mode as #1 if a stale-dim DB is
  loaded.

---

## Fix status

- [x] #1 — index dims derived from model
- [x] #3 — `ef_search = fetch.max(32)`
- [x] #6 — sleep a fraction of batch time
- [x] #2 — note-vector consistency (both paths compose from blocks)
- [x] #8 — HTML selectors hoisted to `LazyLock` statics
- [x] #9b — `embed_queued` atomic closes the embed_sync double-enqueue window
- [x] #7 — dead brute-force `knn_search_batch` removed; `knn_search_batch_indexed`
  consolidated into `vector_db.rs` with semantics note; `knn_search` gated to
  tests; parity/exclusion/threshold/dedup tests added (prod path was already
  index-backed)
- [ ] #4, #5 — open
- [ ] #9a — `get_embedding_status` still hardcodes `is_embedding: false` (open)
