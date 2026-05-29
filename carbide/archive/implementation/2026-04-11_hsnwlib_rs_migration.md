# Plan: Migrate vector index from hnsw_rs to hnswlib-rs

## Context

Carbide's `VectorIndex` wraps `hnsw_rs` 0.3 for HNSW approximate nearest neighbor search. `hnswlib-rs` 0.10 is the same author's newer, more actively maintained rewrite with built-in i8 quantization, search-time filtering, and a decoupled vector storage model. This migration swaps the internal HNSW implementation while preserving the exact public API — zero changes to consumers.

## Files to modify

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Swap dependency |
| `src-tauri/src/features/search/hnsw_index.rs` | Rewrite internals |
| `src-tauri/src/app/mod.rs` | Update log filter module name |

**No changes to consumers:** `service.rs`, `hybrid.rs`, `smart_links/rules.rs`, `tests/smart_links_rules.rs`

## Step 1: Cargo.toml dependency swap

```toml
# Remove:
hnsw_rs = "0.3"
# Add:
hnswlib-rs = "0.10"
```

## Step 2: Rewrite hnsw_index.rs internals

### Imports

```rust
// Remove:
use hnsw_rs::anndists::dist::distances::DistCosine;
use hnsw_rs::hnsw::Hnsw;

// Add:
use hnswlib_rs::hnsw::{Hnsw, HnswConfig};
use hnswlib_rs::metric::Cosine;
use hnswlib_rs::vectors::InMemoryVectorStore;
```

### Constants

```rust
const M: usize = 16;               // was MAX_NB_CONNECTION
const EF_CONSTRUCTION: usize = 200; // unchanged value
const EF_SEARCH: usize = 32;        // new: query-time search width
// Remove NB_LAYER (hnswlib-rs manages layers automatically)
```

### Struct — add `store` field, change `hnsw` type

```rust
pub struct VectorIndex {
    dims: usize,
    hnsw: Hnsw<usize, Cosine>,              // was Hnsw<'static, f32, DistCosine>
    store: InMemoryVectorStore<f32>,          // NEW: decoupled vector storage
    key_to_id: HashMap<String, usize>,        // unchanged
    id_to_key: HashMap<usize, String>,        // unchanged
    vectors: HashMap<String, Vec<f32>>,       // unchanged (for get_vector + compaction)
    next_id: usize,                           // unchanged
}
```

### Private helper — `make_hnsw()`

Avoid duplicating construction logic across `new()`, `clear()`, `compact_from_vectors()`:

```rust
fn make_hnsw(dims: usize, max_nodes: usize) -> (Hnsw<usize, Cosine>, InMemoryVectorStore<f32>) {
    let cfg = HnswConfig::new(dims, max_nodes)
        .m(M)
        .ef_construction(EF_CONSTRUCTION)
        .ef_search(EF_SEARCH);
    let hnsw = Hnsw::new(Cosine {}, cfg);
    let store = InMemoryVectorStore::<f32>::new(dims, max_nodes);
    (hnsw, store)
}
```

### Method changes

**`new(dims)`** — use `make_hnsw()`, init `store` field

**`insert()`** — call `self.hnsw.insert(&self.store, id, &vector)` (returns `Result`, log-warn on error). `hnsw.insert` takes `&self` (interior mutability) so no borrow conflict with `&self.store`.

**`search()`** — use filter closure to eliminate stale entries at graph-traversal level:
```rust
let filter = |id: &usize| self.id_to_key.contains_key(id);
self.hnsw.search(&self.store, query, limit, Some(&filter))
```
Remove the over-fetch heuristic (`stale_count() * 2` etc). Handle `Result` with log-warn fallback to `vec![]`.

**`clear()`** — reconstruct via `make_hnsw()`

**`compact_from_vectors()`** — drain vectors, reconstruct via `make_hnsw()`, re-insert all

**`stale_count()`** — keep as private method, same logic: `self.next_id.saturating_sub(self.key_to_id.len())`. We do NOT use `hnsw.deleted_len()` because we never call `hnsw.delete()` — stale entries are orphaned in the graph but tracked by our key maps.

**`needs_rebuild()`** — unchanged logic using `stale_count()`

**Unchanged methods:** `remove()`, `remove_by_prefix()`, `rename()`, `rename_by_prefix()`, `get_vector()`, `len()`, `is_empty()`, `rebuild_from_sqlite()`

### Key API facts (verified from docs.rs)

- `Hnsw::insert(&self, vectors: &V, key: K, vector: &[f32]) -> Result<()>` — `&self`, interior mutability
- `Hnsw::search(&self, vectors: &V, query: &[f32], k: usize, filter: Option<&dyn Fn(&K) -> bool>) -> Result<Vec<SearchHit<K>>>`
- `SearchHit<K>` has fields `key: K` and `distance: f32`
- `InMemoryVectorStore::<f32>::new(dim: usize, max_nodes: usize)`
- Metric type: `hnswlib_rs::metric::Cosine`

## Step 3: Update log filter in app/mod.rs

```rust
// Before:
.level_for("hnsw_rs", log::LevelFilter::Warn)
// After:
.level_for("hnswlib_rs", log::LevelFilter::Warn)
```

## Step 4: Tests — zero changes expected

All 11 unit tests in `hnsw_index.rs` and all integration tests in `tests/smart_links_rules.rs` exercise the public API only. The `stale_count()` method is preserved, so `compact_preserves_data` and `needs_rebuild_after_many_deletes` tests pass unchanged.

## Verification

1. `cd src-tauri && cargo check` — Rust type checking
2. `cd src-tauri && cargo test` — unit + integration tests
3. `pnpm check` — Svelte/TypeScript (should be unaffected)
4. `pnpm test` — Vitest tests (should be unaffected)
5. Manual: open a vault, verify embedding indexing completes, search returns results, similar notes work

### Head-to-head Comparison for Note embedding tools


|                        | **hnsw_rs** (current)                                       | **hnswlib-rs**                                 | **instant-distance**                 |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| **Version**            | 0.3.4                                                       | 0.10.0                                         | 0.6.1                                |
| **Pure Rust**          | Yes                                                         | Yes                                            | Yes                                  |
| **License**            | MIT/Apache-2.0                                              | Apache-2.0                                     | MIT/Apache-2.0                       |
| **Maintenance**        | Same author as hnswlib-rs (jean-pierreBoth)                 | Same author, more active                       | Instant Labs (Instant Domain Search) |
| **Incremental insert** | Yes                                                         | Yes                                            | **No** — immutable after build       |
| **Delete from index**  | **No** — stale ID workaround                                | **No** (same HNSW limitation)                  | N/A (immutable)                      |
| **Distance metrics**   | Via `anndists` (L1, L2, Cosine, Jaccard, Hamming, etc.)     | L2, Cosine, Inner Product + Qi8 variants       | Custom via `Point` trait             |
| **SIMD**               | Optional via `simdeez_f` (x86 only, portable needs nightly) | Not mentioned                                  | No                                   |
| **Quantization**       | No                                                          | **Yes — built-in i8 quantization** (Qi8)       | No                                   |
| **Serialization**      | bincode + serde, mmap                                       | bincode + serde, mmap, legacy hnswlib compat   | Optional serde                       |
| **Concurrency**        | `parking_lot` + `rayon` parallel insert/search              | `dashmap` + `arc-swap` for concurrent mutation | `rayon` for build, `parking_lot`     |
| **Filtering**          | Trait-based filter during search                            | Trait-based filter during search               | No                                   |
| **Docs coverage**      | 76%                                                         | 2%                                             | 36%                                  |

### What matters for Carbide

**1. Incremental insert is required.** Our `VectorIndex` does `insert()` on individual notes as they're edited. `instant-distance` can't do this — it requires building the entire index at once. We'd have to buffer all vectors and rebuild from scratch on every change, or maintain a side-buffer of recent inserts with brute-force search until the next full rebuild.

This is a dealbreaker for the current architecture. `instant-distance` is out unless we redesign the indexing pipeline.

**2. hnsw_rs and hnswlib-rs are by the same author.** `hnswlib-rs` is the newer, more actively maintained rewrite. It has:

- **i8 quantization** — 4x memory reduction for block-level (100k vectors at 384 dims: ~150MB → ~38MB)
- Cleaner concurrent mutation via `dashmap`/`arc-swap`
- Search filtering (we could filter by path prefix without post-processing)
- Same HNSW algorithm, same stale-ID limitation we already handle

**3. The stale-ID problem is inherent to HNSW**, not to any crate. All three handle it the same way our code already does — mark stale, over-fetch, compact periodically.

### Verdict

| Crate                | Recommendation                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **instant-distance** | **Drop** — no incremental insert, doesn't fit our architecture                                                                                               |
| **hnsw_rs**          | **Adequate** — works today, same author's older crate                                                                                                        |
| **hnswlib-rs**       | **Best upgrade path** — same author's newer crate, adds quantization + filtering + better concurrency, API is similar enough for a straightforward migration |

The migration from `hnsw_rs` → `hnswlib-rs` would be a same-author library upgrade. The main wins for block-level search would be **Qi8 quantization** (critical for memory at 100k vectors) and **search-time filtering** (filter by note path without over-fetching). The stale-ID workaround, key maps, and `compact_from_vectors` logic would carry over as-is.


---

# Archived docs: Initial planning for Migrate to hnswlib-rs + debounced embed-on-save

## Context

Two related improvements to Carbide's vector search:

1. **Library migration**: Swap `hnsw_rs` 0.3 → `hnswlib-rs` 0.10 (same author's newer crate). Gains: search-time filtering, i8 quantization readiness, actively maintained.

2. **Embed-on-save**: Currently, editing a note nukes its embeddings and they're only restored on the next batch run. Instead: after save, re-embed the note immediately + re-embed only blocks whose content changed (detected via blake3 hash).

These are independent but naturally sequenced — the library swap is a prerequisite for nothing, but doing it first keeps the diff clean.

---

## Part 1: hnswlib-rs migration

### Files to modify

| File                                          | Change                                    |
| --------------------------------------------- | ----------------------------------------- |
| `src-tauri/Cargo.toml:78`                     | `hnsw_rs = "0.3"` → `hnswlib-rs = "0.10"` |
| `src-tauri/src/features/search/hnsw_index.rs` | Rewrite internals, preserve public API    |
| `src-tauri/src/app/mod.rs:89`                 | Log filter `"hnsw_rs"` → `"hnswlib_rs"`   |

**Zero changes to consumers**: `service.rs`, `hybrid.rs`, `smart_links/rules.rs`, `tests/smart_links_rules.rs`

### hnsw_index.rs changes

**Imports:**

```rust
// Remove:
use hnsw_rs::anndists::dist::distances::DistCosine;
use hnsw_rs::hnsw::Hnsw;
// Add:
use hnswlib_rs::hnsw::{Hnsw, HnswConfig};
use hnswlib_rs::metric::Cosine;
use hnswlib_rs::vectors::InMemoryVectorStore;
```

**Constants:**

```rust
const M: usize = 16;                // was MAX_NB_CONNECTION
const EF_CONSTRUCTION: usize = 200; // unchanged
const EF_SEARCH: usize = 32;        // new
// Remove NB_LAYER (hnswlib-rs manages layers automatically)
```

**Struct** — add `store` field, change `hnsw` type:

```rust
pub struct VectorIndex {
    dims: usize,
    hnsw: Hnsw<usize, Cosine>,
    store: InMemoryVectorStore<f32>,  // NEW
    key_to_id: HashMap<String, usize>,
    id_to_key: HashMap<usize, String>,
    vectors: HashMap<String, Vec<f32>>,
    next_id: usize,
}
```

**Private helper** `make_hnsw(dims, max_nodes) -> (Hnsw<usize, Cosine>, InMemoryVectorStore<f32>)` — avoids duplication in `new()`, `clear()`, `compact_from_vectors()`.

**Key method changes:**

- `insert()` — call `self.hnsw.insert(&self.store, id, &vector)`, handle `Result` with log-warn
- `search()` — use filter closure `|id: &usize| self.id_to_key.contains_key(id)` instead of over-fetch heuristic. Handle `Result`.
- `clear()` / `compact_from_vectors()` — reconstruct via `make_hnsw()`
- `stale_count()` — keep as-is (private method, `next_id - key_to_id.len()`)
- `needs_rebuild()` — keep as-is (uses `stale_count()`)

**Unchanged methods:** `remove()`, `remove_by_prefix()`, `rename()`, `rename_by_prefix()`, `get_vector()`, `len()`, `is_empty()`, `rebuild_from_sqlite()`

**Tests:** All 11 unit tests pass without modification — they exercise only public API and `stale_count()` is preserved.

### Verified API facts (from docs.rs)

- `Hnsw::insert(&self, vectors: &V, key: K, vector: &[f32]) -> Result<()>` — `&self`, interior mutability
- `Hnsw::search(&self, vectors: &V, query: &[f32], k: usize, filter: Option<&dyn Fn(&K) -> bool>) -> Result<Vec<SearchHit<K>>>`
- `SearchHit<K>` has fields `key: K`, `distance: f32`
- `InMemoryVectorStore::<f32>::new(dim: usize, max_nodes: usize)`
- Metric: `hnswlib_rs::metric::Cosine`
- `HnswConfig::new(dim, max_nodes).m(M).ef_construction(EF).ef_search(EF)`

---

## Part 2: Debounced embed-on-save

### Design

When a note is saved (via `UpsertNoteWithContent` or `ReindexNote` commands in `service.rs`):

1. Update FTS index (already happens)
2. Re-embed the full note text → update note embedding in SQLite + HNSW index
3. Re-extract sections via `extract_markdown_structure()`
4. For each eligible block (≥20 words or ≥10 lines):
   - Compute blake3 hash of block text
   - Compare to stored hash in `block_embeddings`
   - If hash differs or no prior embedding: re-embed → update SQLite + HNSW index
   - If hash matches: skip (keep existing embedding)
5. Remove embeddings for blocks that no longer exist (heading deleted/renamed)

### Files to modify

| File                                         | Change                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/features/search/vector_db.rs` | Add `content_hash TEXT` column to `block_embeddings`, update upsert/query functions                        |
| `src-tauri/src/features/search/service.rs`   | Modify `handle_upsert_with_content` and `handle_reindex_note` to embed inline instead of just invalidating |
| `src-tauri/src/features/search/db.rs`        | Possibly expose section text extraction as a reusable helper                                               |

### Schema change: `block_embeddings`

Current (vector_db.rs:14-18):

```sql
CREATE TABLE IF NOT EXISTS block_embeddings (
    path TEXT NOT NULL,
    heading_id TEXT NOT NULL,
    embedding BLOB NOT NULL,
    PRIMARY KEY (path, heading_id)
);
```

Add `content_hash` column:

```sql
CREATE TABLE IF NOT EXISTS block_embeddings (
    path TEXT NOT NULL,
    heading_id TEXT NOT NULL,
    embedding BLOB NOT NULL,
    content_hash TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (path, heading_id)
);
```

Use `ALTER TABLE ... ADD COLUMN` migration pattern (SQLite supports this). Add to `init_vector_schema()` in `vector_db.rs` — add column if not exists via a safe migration (try ALTER, ignore if column already exists).

### vector_db.rs new/modified functions

- `upsert_block_embedding(conn, path, heading_id, embedding, content_hash)` — add `content_hash` param
- `get_block_hashes(conn, path) -> HashMap<String, String>` — new function returning `heading_id → content_hash` for all blocks of a note
- `remove_block_embeddings_except(conn, path, keep_heading_ids: &[&str])` — new function to remove blocks that no longer exist without nuking ones we want to keep
- Update `handle_block_embed_batch()` to pass content_hash (for batch path compatibility)

### service.rs: embed-on-save logic

Modify `handle_upsert_with_content()` (line 870) and `handle_reindex_note()` (line 828):

```
fn handle_reindex_note(..., model: Option<&EmbeddingService>) {
    // ... existing FTS upsert logic ...

    if let Some(model) = model {
        // 1. Re-embed full note
        let note_text = get_fts_body(conn, note_id) or markdown;
        match model.embed_one(note_text) {
            Ok(embedding) => {
                vector_db::upsert_embedding(conn, note_id, &embedding);
                note_index.write().insert(note_id, embedding);
            }
            Err(e) => log::warn!(...)
        }

        // 2. Re-extract sections
        let sections = extract_markdown_structure(markdown);

        // 3. Get existing hashes
        let old_hashes = vector_db::get_block_hashes(conn, note_id);

        // 4. For each eligible section, check hash
        let mut kept_heading_ids = vec![];
        let mut to_embed: Vec<(heading_id, text)> = vec![];

        for section in sections where eligible {
            let text = extract section text from markdown by line range;
            let hash = blake3::hash(text.as_bytes()).to_hex().to_string();
            kept_heading_ids.push(section.heading_id);

            if old_hashes.get(section.heading_id) == Some(&hash) {
                continue; // unchanged, skip
            }
            to_embed.push((section.heading_id, text, hash));
        }

        // 5. Batch embed changed blocks
        if !to_embed.is_empty() {
            let texts: Vec<&str> = to_embed.iter().map(|t| t.1.as_str()).collect();
            match model.embed_batch(&texts, None) {
                Ok(embeddings) => {
                    for ((heading_id, _, hash), embedding) in to_embed.iter().zip(embeddings) {
                        vector_db::upsert_block_embedding(conn, note_id, heading_id, &embedding, hash);
                        block_index.write().insert(composite_key, embedding);
                    }
                }
                Err(e) => log::warn!(...)
            }
        }

        // 6. Remove orphaned blocks
        vector_db::remove_block_embeddings_except(conn, note_id, &kept_heading_ids);
        // Remove orphaned keys from block_index too
    }
}
```

### Threading concern

The writer thread already has access to `app_handle` (passed in `DbCommand::UpsertNoteWithContent`). It can access `EmbeddingServiceState` via `app_handle.state::<EmbeddingServiceState>()`, same pattern as `handle_embed_batch()` at line 1247.

However, `embed_one` / `embed_batch` can take 10-50ms+ per call. This blocks the writer thread during embedding. The writer thread is already used for batch embedding (the `EmbedBatch` command), so this is an established pattern — but it means other DB writes are queued while embedding runs.

**Mitigation:** For a single note, embedding is fast (~10-50ms for note + a few changed blocks). This is acceptable latency on save. No architectural change needed.

### Model availability

`EmbeddingService` may not be initialized yet (model download pending). The embed-on-save path should gracefully skip if the model isn't available — match the existing pattern in `handle_embed_batch()` where `get_or_init` failure just logs a warning.

### Settings check

Respect `embedding_note_enabled` and `embedding_block_enabled` vault settings. Read from settings before attempting embed. Already done in batch path (service.rs:1264-1276), reuse same pattern.

---

## Sequencing

1. **Part 1**: hnswlib-rs migration (3 files, isolated, testable independently)
2. **Part 2a**: Schema migration — add `content_hash` column + new vector_db functions
3. **Part 2b**: Embed-on-save logic in service.rs
4. **Part 2c**: Update batch embed path to store hashes too (consistency)

## Verification

1. `cd src-tauri && cargo check` — Rust type checking
2. `cd src-tauri && cargo test` — unit + integration tests (11 hnsw_index tests + smart_links tests)
3. `pnpm check` — Svelte/TypeScript (unaffected but verify)
4. `pnpm test` — Vitest (unaffected but verify)
5. `pnpm lint` + `pnpm format`
6. **Manual testing:**
   - Open a vault → verify batch embedding completes (check embedding progress events)
   - Edit a note → save → verify the note's embedding is restored immediately (search for it)
   - Edit a heading's content → save → verify that block's embedding updates, others unchanged
   - Delete a heading → save → verify orphaned block embedding is removed
   - Search → verify hybrid search returns results for recently-edited notes

If you need specific details from before exiting plan mode (like exact code snippets, error messages, or content you generated), read the full transcript at: /Users/abir/.claude/projects/-Users-abir-src-carbide/774c22b0-e43d-4dd5-bf6f-e19b00a486e8.jsonl

If this plan can be broken down into multiple independent tasks, consider using the TeamCreate tool to create a team and parallelize the work.

## Claude

Now I have the complete API. Key findings:

- `Hnsw::new(metric, cfg)` — metric instance + HnswConfig builder
- `insert(&self, &store, key, &[f32])` — interior mutability, takes VectorStoreMut
- `search(&self, &store, query, k, filter)` — native filter support via `Option<&dyn Fn(&K) -> bool>`
- `delete(&self, &key)` — soft delete available (plan keeps existing approach for simplicity)
- `SearchHit { key, distance }`

Let me create tasks and start implementing.

`hnswlib-rs` 0.10 requires nightly Rust (its `corenn-kernels` dep uses `#![feature(f16)]`). Let me check for a compatible version or feature flags.

## Claude

The `f16` type might be stabilized in Rust 1.94. Let me check:

## Claude

`f16` is still unstable on Rust 1.94. `hnswlib-rs` 0.10 won't work on stable Rust. Let me check the `hnsw_rs` crate from jean-pierreBoth for a newer version that works on stable, or look at alternatives.

## Claude

**Blocker on Part 1:** `hnswlib-rs` 0.10 requires nightly Rust (`f16` feature) and we're on stable Rust 1.94. Additionally, `hnswlib-rs` is by a different author (wilsonzlin/corenn), not the same author as `hnsw_rs` (jean-pierreBoth) — despite the similar name.
