# B1: sqlite-vec Embeddings Infrastructure

## A. Architecture Decisions

### Decision 1: Embedding Model — `bge-small-en-v1.5` (quantized int8) via `fastembed-rs`

**Choice**: Use `bge-small-en-v1.5` (BAAI, 2023) in int8-quantized ONNX format, loaded via the `fastembed` crate.

**Rationale**:

- **33M params, 384-dim output, ~32MB int8 ONNX** — same dimensionality as the older `all-MiniLM-L6-v2` but ~10 points higher on MTEB retrieval benchmarks (51.7 vs 41.9). Substantially better similarity quality at comparable size.
- **`fastembed-rs`** wraps `ort` (ONNX Runtime) and handles tokenization, mean pooling, and normalization in a single `embed()` call. Supports `bge-small-en-v1.5` as a first-class model (`BGESmallENV15Q` for the quantized variant). Removes the need to manually manage `ort` sessions, `tokenizers`, and `ndarray` tensor ops.
- **Model bundling**: `fastembed` downloads models from HuggingFace on first use by default. For our local-first constraint, we pre-bundle the quantized ONNX model + tokenizer in `src-tauri/resources/models/` and configure `fastembed` with `InitOptionsUserDefined::with_cache_dir()` pointing to the bundled resource path. This gives us zero-network-required operation.
- **384-dim** works perfectly with `sqlite-vec` brute-force KNN at our scale (<10K notes).
- No GPU needed — CPU inference on a 12-layer transformer at int8 takes ~5-10ms per note on modern hardware. 1000 notes in <15s with batching.

**Rejected alternatives**:

- **`all-MiniLM-L6-v2`** (22M, 384-dim): 2021 model, significantly worse retrieval quality (MTEB ~41.9). Smaller but not worth the quality gap.
- **`nomic-embed-text-v1.5`** (137M, 768-dim): Higher quality (MTEB ~55.7) but 4x larger model (~137MB ONNX). Matryoshka output can be sliced to 384-dim, but the model itself is still 137M params. Overkill for note-level similarity in a personal vault.
- **`snowflake-arctic-embed-s`** (33M, 384-dim): Similar spec to bge-small, slightly newer (2024), but less ecosystem support in `fastembed-rs` and fewer production benchmarks.
- **Raw `ort` + `tokenizers` + `ndarray`**: More control but requires manually implementing tokenization, mean pooling, and normalization. `fastembed-rs` handles all of this correctly out of the box. Three dependencies become one.
- **`candle` (Hugging Face Rust ML)**: Requires building the model architecture in Rust code. Harder to swap models later.
- **`rust-bert`**: Pulls in libtorch (~2GB). Overkill.
- **External Python process / ChromaDB sidecar**: Violates local-first single-binary constraint.

### Decision 2: Vector Storage — `sqlite-vec` extension

**Choice**: Use the `sqlite-vec` SQLite extension loaded via rusqlite's `load_extension` mechanism.

**Rationale**:

- Keeps everything in the same per-vault SQLite database that already stores FTS, notes, outlinks, properties, tags, and tasks. One DB file per vault, one connection pool, one backup story.
- `sqlite-vec` provides `vec0` virtual tables with brute-force KNN search. For vault sizes up to ~10K notes with ~50K chunks, brute-force over 384-dim f32 vectors is fast enough (<50ms). No need for HNSW indices at this scale.
- The extension ships as a single `.dylib`/`.so`/`.dll` (~200KB). Bundled as a Tauri resource.

**Rejected alternatives**:

- **`sqlite-vss`**: Predecessor to `sqlite-vec`, uses Faiss internally. Heavier, less maintained, more complex build.
- **`pgvector` / external DB**: Violates local-first, single-process constraint.
- **In-memory HNSW via `instant-distance` or `usearch`**: Would require separate persistence, lose transactional consistency with FTS data, and add complexity for marginal performance gain at our scale.
- **Store vectors as BLOBs + manual distance calculation**: Works but reimplements what `sqlite-vec` already does efficiently, including proper query planning.

### Decision 3: Embedding Granularity — Whole-note (not chunked) for v1

**Choice**: Embed each note as a single vector using its full body text (truncated to model max tokens ~512). Add chunked embeddings later if needed.

**Rationale**:

- Most vault notes are short (500-3000 chars). The model's 256-token effective window captures the gist of most notes.
- Simplifies the data model: 1 note = 1 embedding vector. No chunk management, no chunk expansion, no chunk-to-note mapping.
- The primary use cases (find similar notes, semantic search across vault, "related notes" panel) work well at note-level granularity.
- Chunked embeddings can be added as a v2 enhancement for long notes, reusing the same `vec0` table with a `chunk_index` column.

**Rejected alternatives**:

- **Chunked from day one**: The RAG pipeline in `~/src/RAG` uses 1000-char chunks with 150-char overlap. This is optimal for RAG (retrieving specific passages for LLM context) but overkill for "find similar notes" which is the v1 surface. Adds schema complexity (chunk table, expansion queries, chunk-to-note rollup) without clear user benefit yet.

### Decision 4: Hybrid Search Strategy — FTS + Vector + RRF

**Choice**: Port the RAG project's hybrid search approach: over-fetch from both FTS and vector search, merge via Reciprocal Rank Fusion (k=60), apply heuristic re-ranking.

**Rationale**:

- FTS excels at exact keyword matches; vectors excel at semantic similarity. RRF combines both without requiring score normalization (scores from different systems are incommensurable).
- The existing FTS search in `search_db::search()` already returns ranked results. We add a vector KNN query, then merge.
- Heuristic re-ranking (term overlap, exact phrase match) is cheap and improves result quality for short queries.

## B. Data Structures

### New SQLite Schema

Added to the existing per-vault search DB, alongside `notes`, `notes_fts`, `outlinks`, etc:

```sql
-- Requires sqlite-vec extension loaded
-- vec0 virtual table: stores one 384-dim f32 vector per note
CREATE VIRTUAL TABLE IF NOT EXISTS note_embeddings USING vec0(
    path TEXT PRIMARY KEY,
    embedding float[384]
);

-- Track embedding model version so we know when to re-embed
CREATE TABLE IF NOT EXISTS embedding_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Seeded with: INSERT INTO embedding_meta VALUES ('model_version', 'all-MiniLM-L6-v2');
--              INSERT INTO embedding_meta VALUES ('dimensions', '384');
```

### New Rust Types

```
// In a new module: src-tauri/src/features/search/embeddings.rs

EmbeddingService     — Wraps fastembed::TextEmbedding. Initialized with InitOptionsUserDefined pointing
                       to bundled model dir. Created once per app lifetime.
EmbeddingServiceState — Tauri managed state wrapping Option<Arc<EmbeddingService>> behind a Mutex (lazy init).

EmbeddingVec         — Newtype over Vec<f32> (384-dim), with serde support for IPC.

SemanticSearchHit    — { path: String, distance: f32, note: IndexNoteMeta }
HybridSearchHit      — { note: IndexNoteMeta, score: f32, snippet: Option<String>, source: HitSource }
HitSource            — enum { Fts, Vector, Both }
```

## C. Rust Backend Changes

### New Module: `src-tauri/src/features/search/embeddings.rs`

Responsibilities:

- Initialize `fastembed::TextEmbedding` with `EmbeddingModel::BGESmallENV15Q` and cache dir pointing to bundled resources
- Expose `embed_one(text) -> Vec<f32>` and `embed_batch(texts) -> Vec<Vec<f32>>` wrappers
- Handle model loading failure gracefully (return `Result`, log error, degrade to FTS-only)

### New Module: `src-tauri/src/features/search/vector_db.rs`

Responsibilities:

- Load `sqlite-vec` extension into a rusqlite `Connection`
- Schema migration: create `note_embeddings` vec0 table and `embedding_meta` table
- `upsert_embedding(conn, path, embedding)` — insert/replace a note's vector
- `remove_embedding(conn, path)` — delete a note's vector
- `remove_embeddings_by_prefix(conn, prefix)` — for folder deletes
- `rename_embedding_path(conn, old_path, new_path)` — for note renames
- `knn_search(conn, query_vec, limit)` — nearest-neighbor search returning `(path, distance)` pairs
- `has_embedding(conn, path) -> bool` — check if a note already has an embedding
- `get_embedding_count(conn) -> usize` — for progress reporting
- `get_model_version(conn) -> Option<String>` — check if model changed (triggers re-embed)

### Modified Module: `src-tauri/src/features/search/db.rs`

Changes:

- `open_search_db_at_path`: After `init_schema`, call `vector_db::init_vector_schema` to load the extension and create vec0 tables. The sqlite-vec extension must be loaded per-connection.
- `upsert_note`: No change — embedding happens asynchronously, not inline with FTS upsert.
- `remove_note`, `remove_notes`, `remove_notes_by_prefix`: Also call `vector_db::remove_embedding*` to keep vectors in sync.
- `rename_note_path`, `rename_folder_paths`: Also call `vector_db::rename_embedding_path*`.

### Modified Module: `src-tauri/src/features/search/service.rs`

Changes:

- Add new `DbCommand` variants: `EmbedNote { path, body, reply }`, `EmbedBatch { items: Vec<(String, String)>, reply }`, `RebuildEmbeddings { ... }`.
- Writer thread gains access to `EmbeddingService` (passed at worker creation via `Arc`).
- New Tauri commands: `semantic_search`, `hybrid_search`, `embed_note`, `rebuild_embeddings`, `get_embedding_status`.

### New Tauri Managed State

`EmbeddingServiceState` registered in `app/mod.rs` alongside existing `SearchDbState`. Lazy-loaded: `fastembed::TextEmbedding` is created on first use with `InitOptionsUserDefined` pointing to bundled model dir. Not at app startup (avoids slowing startup for users who haven't triggered any semantic feature yet).

### New Module: `src-tauri/src/features/search/hybrid.rs`

Responsibilities:

- `hybrid_search(conn, model, query, limit)` — orchestrates:
  1. Embed query text via model
  2. Run `vector_db::knn_search` (over-fetch 3x)
  3. Run existing `search_db::search` (FTS, over-fetch 3x)
  4. Merge via RRF (k=60)
  5. Heuristic re-rank (inverse distance weight 0.6, term overlap 0.3, exact phrase 0.3)
  6. Trim to `limit`

## D. Indexing Pipeline

### When Notes Get Embedded

Embeddings are **decoupled from the FTS indexing pipeline**. The FTS upsert path (`handle_upsert`, `rebuild_index`, `sync_index`) remains fast and unchanged. Embedding happens in a separate pass:

1. **On vault open / sync**: After FTS sync completes, the writer thread checks which notes lack embeddings (or have stale embeddings due to model version change). It queues an `EmbedBatch` command for the missing notes.
2. **On single-note save**: After `UpsertNote` completes in the writer thread, it also embeds that note's body. This is fast (~10ms per note) and keeps the embedding incrementally up to date.
3. **Explicit rebuild**: `rebuild_embeddings` Tauri command drops all embeddings and re-embeds everything. Triggered by model version change or user action.

### Incremental Strategy

The `notes` table already tracks `mtime_ms`. The embedding pipeline compares:

- Notes in `notes` table that have no row in `note_embeddings` -> embed
- Notes where `embedding_meta.model_version` differs from current -> re-embed all (model upgrade)
- On `UpsertNote`, always re-embed that single note

### Background Processing

Embedding runs on the existing writer thread (which already handles `Rebuild`/`Sync` as long-running operations). The `EmbedBatch` command processes notes in batches of 50, emitting progress events (`embedding_progress`) to the frontend, and checking the cancel flag between batches. This reuses the existing cancellation and deferred-command infrastructure in `run_index_op`.

### Progress Reporting

New event: `embedding_progress` with the same shape as `IndexProgressEvent`:

```
{ status: "started", vault_id, total }
{ status: "progress", vault_id, embedded, total }
{ status: "completed", vault_id, embedded, elapsed_ms }
{ status: "failed", vault_id, error }
```

## E. Query Pipeline

### Semantic Search (pure vector)

1. Frontend calls `semantic_search(vault_id, query, limit)` Tauri command.
2. Rust: lazy-load embedding model -> embed query text -> `vector_db::knn_search(conn, query_vec, limit)`.
3. For each result path, look up `IndexNoteMeta` from the `notes` table.
4. Return `Vec<SemanticSearchHit>` ordered by distance ascending.

### Hybrid Search (FTS + vector + RRF)

1. Frontend calls `hybrid_search(vault_id, query, limit)` Tauri command.
2. Rust: `hybrid::hybrid_search(conn, model, query, limit)` — see Section C.
3. Returns `Vec<HybridSearchHit>` with merged scores and hit source attribution.

### Integration with Existing FTS

The existing `index_search` command is **unchanged**. Hybrid search is a new, separate command. This means:

- Omnibar / quick-open keeps using the fast FTS path by default.
- A new "semantic search" mode (e.g., triggered by a prefix like `?` in the omnibar, or a dedicated panel) uses hybrid search.
- No regression risk to existing search behavior.

## F. Frontend Surface (Minimal Infrastructure)

### New Tauri Commands Exposed

| Command                | Args                     | Returns                                                        |
| ---------------------- | ------------------------ | -------------------------------------------------------------- |
| `semantic_search`      | `vault_id, query, limit` | `Vec<SemanticSearchHit>`                                       |
| `hybrid_search`        | `vault_id, query, limit` | `Vec<HybridSearchHit>`                                         |
| `get_embedding_status` | `vault_id`               | `{ total_notes, embedded_notes, model_version, is_embedding }` |
| `rebuild_embeddings`   | `vault_id`               | `()` (progress via events)                                     |

### Port Interface Additions

Add to `SearchPort` in `src/lib/features/search/ports.ts`:

```typescript
semantic_search(vault_id: VaultId, query: string, limit?: number): Promise<SemanticSearchHit[]>;
hybrid_search(vault_id: VaultId, query: string, limit?: number): Promise<HybridSearchHit[]>;
get_embedding_status(vault_id: VaultId): Promise<EmbeddingStatus>;
rebuild_embeddings(vault_id: VaultId): Promise<void>;
```

Corresponding adapter methods in `search_tauri_adapter.ts`.

New types in `src/lib/shared/types/search.ts`:

```typescript
type SemanticSearchHit = { note: NoteMeta; distance: number };
type HybridSearchHit = {
  note: NoteMeta;
  score: number;
  snippet?: string;
  source: "fts" | "vector" | "both";
};
type EmbeddingStatus = {
  total_notes: number;
  embedded_notes: number;
  model_version: string;
  is_embedding: boolean;
};
```

### Event Subscription

Add `subscribe_embedding_progress` to `WorkspaceIndexPort`, mirroring the existing `subscribe_index_progress`.

## G. Edge Cases & Invariants

| Edge Case                                  | Handling                                                                                                                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty note**                             | Skip embedding. Store no row in `note_embeddings`. Semantic search won't find it (correct — there's nothing to match). FTS still indexes it by title/path.                                                                                                     |
| **Very long note (>512 tokens)**           | Truncate to model's max token length before embedding. The first ~512 tokens typically capture the note's topic. Chunking is a v2 concern.                                                                                                                     |
| **Model loading failure**                  | `EmbeddingModelState` holds `Option<EmbeddingModel>`. If loading fails (corrupt file, missing resource), log error and return a clear error from all semantic commands. FTS search continues working. Embedding status reports `model_version: "unavailable"`. |
| **sqlite-vec extension not found**         | If the extension `.dylib`/`.so` fails to load, skip vector schema init. All vector operations return errors. FTS continues working. Detected at `open_search_db` time and logged.                                                                              |
| **Migration: existing DB without vectors** | `init_vector_schema` is idempotent (uses `CREATE VIRTUAL TABLE IF NOT EXISTS`). Old DBs gain the new table on first open. Embeddings are populated on next sync.                                                                                               |
| **Model version upgrade**                  | On sync, compare `embedding_meta.model_version` with compiled-in constant. If different, drop all embeddings and re-embed.                                                                                                                                     |
| **Note rename**                            | `rename_embedding_path` updates the `path` in `note_embeddings`. Vector stays the same (content didn't change).                                                                                                                                                |
| **Note delete**                            | `remove_embedding` deletes the row.                                                                                                                                                                                                                            |
| **Concurrent read/write**                  | Same pattern as FTS: writer thread owns the write connection, read connection is separate with WAL mode. `vec0` tables work with WAL.                                                                                                                          |
| **Binary/non-UTF8 files**                  | Already filtered by `list_indexable_files` (only `.md`, `.canvas`, `.excalidraw`). `extract_indexable_body` handles canvas JSON.                                                                                                                               |
| **Vault with 0 markdown files**            | Embedding sync is a no-op. Status shows `0/0`.                                                                                                                                                                                                                 |

### Invariants

1. Every note in `notes` table either has exactly one row in `note_embeddings` or is pending embedding. There are never orphan embeddings for deleted notes.
2. `embedding_meta.model_version` always reflects the model used to generate the current embeddings. If it doesn't match the compiled-in version, all embeddings are considered stale.
3. Semantic/hybrid search commands never block FTS search. They are independent code paths sharing only the read connection.
4. The embedding model is loaded at most once per app lifetime (not per vault).

## H. Test Scenarios (BDD-style)

### Embedding Model

**Scenario: Model loads successfully on first semantic query**

- Given a vault with indexed notes and the ONNX model bundled as a resource
- When the user triggers their first semantic search
- Then the model loads lazily, the query returns results, and subsequent queries reuse the loaded model

**Scenario: Model file missing**

- Given the ONNX resource file is absent
- When the user triggers a semantic search
- Then the command returns an error "Embedding model unavailable" and FTS search continues working

### Embedding Indexing

**Scenario: Initial embedding on vault open**

- Given a vault with 500 notes and no existing embeddings
- When the vault sync completes
- Then embeddings are generated for all 500 notes within 30 seconds, with progress events emitted

**Scenario: Incremental embedding on note save**

- Given a vault with all notes embedded
- When the user edits and saves a note
- Then only that note's embedding is regenerated (not the entire vault)

**Scenario: Note deletion removes embedding**

- Given a note "foo.md" with an existing embedding
- When the note is deleted via the app
- Then the embedding row for "foo.md" is also removed

**Scenario: Note rename preserves embedding**

- Given a note "old.md" with an existing embedding
- When the note is renamed to "new.md"
- Then `note_embeddings` contains a row for "new.md" with the same vector, and no row for "old.md"

**Scenario: Empty note is skipped**

- Given a note with empty body (only frontmatter or whitespace)
- When embedding sync runs
- Then no embedding row is created for that note

### Vector Search

**Scenario: Semantic search returns similar notes**

- Given notes about "machine learning", "deep neural networks", and "cooking recipes"
- When the user searches semantically for "AI and neural nets"
- Then "machine learning" and "deep neural networks" rank highest; "cooking recipes" ranks lowest or is absent

**Scenario: KNN search respects limit**

- Given 100 embedded notes
- When `knn_search(query_vec, 5)` is called
- Then exactly 5 results are returned, ordered by ascending distance

### Hybrid Search

**Scenario: Hybrid search merges FTS and vector results**

- Given a note titled "Rust Programming" containing text about "systems programming with ownership"
- When the user hybrid-searches for "memory safety in systems languages"
- Then the note appears in results (FTS matches "systems", vector matches semantic meaning)

**Scenario: Hybrid search with no vector results gracefully degrades**

- Given embeddings haven't been generated yet
- When hybrid search is called
- Then results come from FTS only, with `source: "fts"` on all hits

### Migration

**Scenario: Existing vault DB gains vector tables on upgrade**

- Given a vault DB created before B1 (no `note_embeddings` table)
- When the app opens this vault after the B1 upgrade
- Then `note_embeddings` and `embedding_meta` tables are created without data loss to existing tables

## I. Files to Create/Modify

### Create

| File                                          | Purpose                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `src-tauri/src/features/search/embeddings.rs` | ONNX model loading, tokenization, inference                         |
| `src-tauri/src/features/search/vector_db.rs`  | sqlite-vec extension loading, vec0 schema, vector CRUD, KNN queries |
| `src-tauri/src/features/search/hybrid.rs`     | Hybrid search pipeline: FTS + vector + RRF merge + re-rank          |
| `tests/unit/search/semantic_search.test.ts`   | Frontend adapter tests for new commands                             |

### Modify

| File                                                       | Change                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/features/search/mod.rs`                     | Add `pub mod embeddings; pub mod vector_db; pub mod hybrid;`                                                                                                                                                                                      |
| `src-tauri/src/features/search/db.rs`                      | Call `vector_db::init_vector_schema` in `open_search_db_at_path`. Add vector cleanup to `remove_note`, `remove_notes_by_prefix`, `rename_note_path`, `rename_folder_paths`.                                                                       |
| `src-tauri/src/features/search/service.rs`                 | Add `EmbedNote`, `EmbedBatch`, `RebuildEmbeddings` to `DbCommand`. Add `semantic_search`, `hybrid_search`, `get_embedding_status`, `rebuild_embeddings` Tauri commands. Wire `EmbeddingModel` into worker creation. Add post-sync embedding pass. |
| `src-tauri/src/features/search/model.rs`                   | Add `SemanticSearchHit`, `HybridSearchHit`, `HitSource`, `EmbeddingStatus` types.                                                                                                                                                                 |
| `src-tauri/src/app/mod.rs`                                 | Register `EmbeddingModelState` via `.manage()`. Register new Tauri commands in `invoke_handler`.                                                                                                                                                  |
| `src-tauri/Cargo.toml`                                     | Add `fastembed` dependency.                                                                                                                                                                                                                       |
| `src/lib/features/search/ports.ts`                         | Add `semantic_search`, `hybrid_search`, `get_embedding_status`, `rebuild_embeddings` to `SearchPort`. Add `subscribe_embedding_progress` to `WorkspaceIndexPort`.                                                                                 |
| `src/lib/features/search/adapters/search_tauri_adapter.ts` | Implement new port methods.                                                                                                                                                                                                                       |
| `src/lib/shared/types/search.ts`                           | Add `SemanticSearchHit`, `HybridSearchHit`, `EmbeddingStatus` types.                                                                                                                                                                              |
| `src-tauri/tauri.conf.json`                                | Add ONNX model and sqlite-vec extension to bundle resources.                                                                                                                                                                                      |

## J. Dependencies

### Cargo Additions

| Crate        | Version           | Purpose                                                                                                              | Binary Size Impact                                    |
| ------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `fastembed`  | `~4.0`            | Embedding inference via ONNX Runtime. Wraps `ort`, tokenizers, and pooling. Provides `BGESmallENV15Q` model variant. | ~15-20MB (ONNX Runtime shared lib, platform-specific) |
| `sqlite-vec` | (system/vendored) | Loaded as SQLite extension at runtime, not a Cargo dependency. Bundled as `.dylib`/`.so`/`.dll` in Tauri resources.  | ~200KB                                                |

**Note**: `fastembed` transitively depends on `ort`, `tokenizers`, and `ndarray`. We no longer need to declare them individually.

**Total binary size increase**: ~18-22MB (dominated by ONNX Runtime). Acceptable for a desktop app. The existing binary is ~50MB+ (Tauri + WebView + git2 + openssl).

### Bundled Resources

| Resource                                        | Size   | Location                                          |
| ----------------------------------------------- | ------ | ------------------------------------------------- |
| `model_optimized.onnx` (bge-small-en-v1.5 int8) | ~32MB  | `src-tauri/resources/models/bge-small-en-v1.5-q/` |
| `tokenizer.json`                                | ~500KB | `src-tauri/resources/models/bge-small-en-v1.5-q/` |
| `config.json`                                   | <1KB   | `src-tauri/resources/models/bge-small-en-v1.5-q/` |
| `sqlite-vec.{dylib,so,dll}`                     | ~200KB | `src-tauri/resources/extensions/`                 |

### Model Bundling Strategy

`fastembed` normally downloads models on first use. To maintain zero-network-required local-first operation:

1. Pre-download the quantized model files during build/CI: `fastembed` stores them in a cache dir structured as `models/BGESmallENV15Q/`.
2. Bundle the model directory in `src-tauri/resources/models/` via Tauri's `bundle.resources` in `tauri.conf.json`.
3. At runtime, initialize `TextEmbedding` with `InitOptionsUserDefined` pointing `cache_dir` to `app.path().resource_dir().join("models")`. This tells `fastembed` to use the bundled files instead of downloading.
4. The sqlite-vec extension is loaded per-connection via `conn.load_extension()`.

**Build-time**: Add a build script or CI step that downloads the ONNX model and pre-built sqlite-vec binaries for each target platform. Store in `src-tauri/resources/` (gitignored, fetched during build).

## K. Performance Targets

| Metric                                   | Target   | Basis                                                                                           |
| ---------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| Single note embedding                    | <10ms    | `bge-small-en-v1.5` int8 on CPU: ~5-10ms per 512-token input (int8 is ~30-40% faster than fp32) |
| Full vault embed (1000 notes)            | <15s     | 1000 \* 10ms = 10s + overhead. `fastembed` supports batched inference (50 per batch).           |
| Model cold load                          | <2s      | ONNX session creation from file via `fastembed`. One-time cost per app lifetime.                |
| KNN query (10K vectors, 384-dim, top-20) | <10ms    | Brute-force float32 dot product over 10K \* 384 = ~15MB data. CPU cache friendly.               |
| Hybrid search end-to-end                 | <100ms   | Embed query (~10ms) + KNN (~10ms) + FTS (~20ms) + RRF merge (~5ms) + re-rank (~5ms)             |
| Memory: model in RAM                     | ~40-60MB | ONNX session for int8-quantized `bge-small-en-v1.5` (smaller than fp32)                         |
| Memory: vector data (10K notes)          | ~15MB    | 10K _ 384 _ 4 bytes = ~15MB (managed by sqlite-vec, memory-mapped)                              |

### Performance Notes

- **Batching**: `fastembed` supports batched inference natively. Processing 50 notes per batch reduces per-note overhead from tokenizer setup. Target: 50-note batch in <150ms.
- **Int8 quantization**: Already the default choice. ~30-40% faster inference than fp32, minimal quality loss for retrieval tasks. Reduces model file from ~127MB (fp32) to ~32MB.
- **Scaling ceiling**: At 50K+ notes, brute-force KNN becomes the bottleneck (~50-100ms). At that point, consider adding an HNSW index or switching to `usearch`. This is a v2 concern — most personal vaults are well under 10K notes.
