# Vault Indexing Code Paths — Code Review

**Date:** 2026-06-20
**Scope:** `src-tauri/src/features/search/`, `src-tauri/src/features/watcher/`, `src-tauri/src/features/notes/service.rs`, `src-tauri/src/shared/`
**Method:** Manual trace of all indexing-related code paths — rebuild, sync, sync-paths, upsert, embed, search, watcher.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Svelte/TS)                               │
│  workspace_index_tauri_adapter.ts                   │
│  → tauri_invoke("sync_search_index", ...)           │
│  → tauri_invoke("rebuild_search_index", ...)        │
│  → tauri_invoke("embed_sync", ...)                  │
│  → tauri_invoke("index_upsert_note_with_content",.. │
└──────────────────────┬──────────────────────────────┘
                       │ Tauri IPC

> **Correction (2026-06-20):** The IPC command names in the diagram above are
> inaccurate. The actual Tauri command names (verified against
> `service.rs` and `workspace_index_tauri_adapter.ts`) are:
>
> | Diagram says | Actual command | Defined at |
> |---|---|---|
> | `sync_search_index` | `index_build` | `service.rs:2008` |
> | `rebuild_search_index` | `index_rebuild` | `service.rs:2065` |
> | `embed_sync` | `embed_sync` | correct |
> | `index_upsert_note_with_content` | `index_upsert_note` | `service.rs:2170` |
>
> The frontend adapter the review cites
> (`workspace_index_tauri_adapter.ts:209,250,264`) already uses the correct
> `index_build`/`index_rebuild` names — the diagram's names are a documentation
> error only; no behavioral impact.
>
> **Follow-up correction (verification pass):** Row 4 of the table above was
> itself inaccurate. `index_upsert_note_with_content` (`service.rs:2182`) is
> **not** a `#[tauri::command]` — it is an internal `pub fn` helper. The
> registered command is `index_upsert_note` (`service.rs:2170`), corrected in the
> table above. `embed_sync` (`service.rs:2805`) is a genuine command.
┌──────────────────────▼──────────────────────────────┐
│  Rust Backend                                       │
│                                                     │
│  SearchDbState (app state)                          │
│   └─ workers: HashMap<vault_id, VaultWorker>        │
│                                                     │
│  Per-vault VaultWorker:                             │
│   ├─ Single writer thread (channel dispatch)        │
│   ├─ write_conn: Connection                         │
│   ├─ read_conn: Arc<Mutex<Connection>>               │
│   ├─ note_index: SharedVectorIndex (HNSW)           │
│   ├─ block_index: SharedVectorIndex (HNSW)          │
│   └─ notes_cache: BTreeMap<String, IndexNoteMeta>   │
│                                                     │
│  Writer thread dispatch:                            │
│   DbCommand → dispatch_command() → SQLite + HNSW    │
│                                                     │
│  SQLite schema (per-vault .db):                     │
│   ├─ notes (content table)                          │
│   ├─ notes_fts (FTS5 virtual table)                 │
│   ├─ note_embeddings (384-dim float vectors)        │
│   ├─ block_embeddings (section-level vectors)       │
│   ├─ outlinks, note_headings, note_links,           │
│   │  note_sections, note_code_blocks,               │
│   │  note_inline_tags, note_properties, tasks, ...   │
│   └─ embedding_meta (model_version)                 │
│                                                     │
│  Embedding pipeline (separate passes):              │
│   1. Block embedding (handle_block_embed_batch)     │
│   2. Note composition (mean-pool block vecs → L2)   │
│   3. Fallback: embed_one on FTS body for 0-block    │
│      notes (DL-005)                                 │
└─────────────────────────────────────────────────────┘
```

> **Correction (verification pass):** The `VaultWorker` field list in the diagram
> above is partly inaccurate. Verified against the struct definition
> (`service.rs:219-231`), the worker owns `write_tx: mpsc::Sender<DbCommand>` (the
> writer-thread channel), `read_conn: Arc<Mutex<Connection>>`, `note_index`, and
> `block_index` (both `SharedVectorIndex`). `write_conn: Connection` and
> `notes_cache: BTreeMap<String, IndexNoteMeta>` are **not** struct fields — they
> are locals inside `writer_thread_loop`, threaded through `dispatch_command` by
> `&mut`. Diagram error only; no behavioral impact.

---

## Key Files

| File | Lines | Role |
|------|-------|------|
| `features/search/service.rs` | 3368 | Worker lifecycle, command dispatch, embedding orchestration |
| `features/search/db.rs` | 5764 | SQLite schema, rebuild/sync logic, FTS queries, markdown parsing |
| `features/search/embeddings.rs` | 247 | BERT model loading, batch embedding (Metal GPU on macOS) |
| `features/search/vector_db.rs` | 918 | Embedding CRUD, schema init, mean-pool, dot distance |
| `features/search/hnsw_index.rs` | 485 | In-memory HNSW index wrapper, rebuild from SQLite |
| `features/search/hybrid.rs` | ~120 | RRF merge of FTS + vector results |
| `features/search/text_extractor.rs` | 457 | File classification, PDF/HTML/EPUB extraction |
| `features/search/model.rs` | 261 | Data types: IndexNoteMeta, SearchHit, EmbeddingStatus, etc. |
| `features/watcher/service.rs` | 402 | File system watcher, debounce, event emission |
| `features/notes/service.rs` | 1990 | Note CRUD, write_and_index_note integration |
| `shared/constants.rs` | ~15 | MAX_VAULT_WALK_DEPTH, MAX_INDEXABLE_FILES, excluded dirs |
| `shared/vault_ignore.rs` | 330 | .gitignore/.vaultignore parser with caching |

---

## Findings

### Bugs & Correctness Issues

#### 1. [MEDIUM] `handle_rebuild` does not clear embeddings — HNSW may be stale vs FTS

**File:** `service.rs` lines 1268–1292

`handle_rebuild` calls `run_index_op` which:
1. Runs `search_db::rebuild_index` — clears and rebuilds the FTS index from disk
2. Defers `DbCommand::RebuildIndex` — rebuilds HNSW from SQLite embedding tables

However, `handle_rebuild` does **not** clear embeddings beforehand. If notes changed content but embedding hasn't run yet, the HNSW indices will still contain vectors computed from old content, while the FTS index reflects the new content. This causes a correctness mismatch: FTS matches current content, but vector distances are computed against stale embeddings.

**Contrast:** `handle_embed_batch` (lines 1468–1477) correctly clears embeddings when `clear_first=true`. The `RebuildEmbeddings` command sets `clear_first=true`, and the version-change check also triggers clearing. But `Rebuild` (FTS rebuild) never forces re-embedding — the two indices drift apart.

**Fix:** Either (a) clear embeddings during rebuild and trigger re-embedding, or (b) accept the drift and document that `rebuild_search_index` only rebuilds FTS, with HNSW staying as-was until the next embedding pass.

> **Correction (2026-06-20):** The mechanism described in point 2 above is
> **inaccurate**. `run_index_op` (`service.rs:1096-1252`) does **not** proactively
> defer a `DbCommand::RebuildIndex`. It only defers one if a `RebuildIndex`
> arrives externally on the channel during the operation (`service.rs:1125`).
> `handle_rebuild` itself (`service.rs:1268-1292`) enqueues no `RebuildIndex`;
> the only automatic `RebuildIndex` is sent once on worker startup
> (`service.rs:500`); the HNSW-from-SQLite rebuild it triggers lives in the
> `RebuildIndex` dispatch handler (`service.rs:867-876`).
>
> **Actual behavior:** After `handle_rebuild`, the in-memory HNSW indices are
> left entirely untouched — neither cleared nor rebuilt from SQLite. Confirmed
> by reading `rebuild_index` in `db.rs:1987-2036`, which deletes from `notes`,
> `notes_fts`, `outlinks`, `note_headings`, `note_links`, `note_inline_tags`,
> `note_sections`, `note_code_blocks`, `tasks`, and `note_properties`, but
> **not** from `note_embeddings` or `block_embeddings`.
>
> **Consequence:** The drift is arguably *worse* than originally stated — HNSW
> is not even reconciled with the SQLite embedding tables, let alone new
> content. Notably, fix option (b) ("document that `rebuild_search_index` only
> rebuilds FTS, with HNSW staying as-was") **already describes the current
> behavior**, so it is not a fix so much as an accurate description. The
> actionable remediation is option (a) — clear embeddings + trigger
> re-embedding — and/or explicitly dispatching `DbCommand::RebuildIndex` after
> the FTS rebuild completes inside `run_index_op`.
>
> The finding's **severity and symptom** (FTS/HNSW drift) remain valid; only
> the stated mechanism was wrong.

#### 2. [LOW] `sync_index_paths` never refreshes HNSW indices

**File:** `service.rs` lines 1320–1391

`handle_sync_paths` calls `search_db::sync_index_paths` which updates the SQLite FTS/index tables for changed/removed paths. After completion, the code updates `notes_cache` (lines 1372–1381) but does **not** rebuild the HNSW indices. The in-memory HNSW indices become stale relative to the embedding tables in SQLite.

While `embed_sync` is called separately after sync, there's a window where the HNSW indices contain old vectors for changed notes. In practice this window is short because `embed_sync` follows quickly, but it's a correctness gap.

**Fix:** Add `dispatch_command(DbCommand::RebuildIndex)` after sync_paths completion when changed paths > 0, or ensure embed_sync is always called atomically after sync.

#### 3. [LOW] FTS5 body stores raw markdown — queries match syntax artifacts

**File:** `db.rs` lines 1134–1137 (`upsert_note_simple`), also `upsert_plain_content` lines 1206–1213

The FTS5 virtual table `notes_fts` stores the **raw markdown body** without any stripping. FTS queries match against markdown syntax tokens: `#`, `##`, `[[`, `]]`, `---`, `>`, code fence backticks, frontmatter fields, wikilink targets, etc.

Examples:
- Searching "todo" matches `- [ ] todo` task markers AND `#todo` inside code blocks
- Searching "src" matches `src="image.png"` HTML attributes in inline HTML
- A note with `---` frontmatter delimiters has those tokens searchable

This is a **design trade-off** (not a hard bug), but it means FTS recall includes noise from markdown syntax. For a PKM app where content is primarily markdown, this is mostly acceptable, but it can produce surprising results when syntax-heavy notes rank higher than semantically relevant ones.

**Mitigation path:** Strip markdown syntax before FTS insertion (cost: extra processing per file) or use a separate cleaned-body column for FTS while keeping the raw body for other uses.

#### 4. [DEGRADATION] HNSW stale node accumulation

**File:** `hnsw_index.rs` lines 141–145

When a key is re-inserted (note updated with new content/embedding):
```rust
if let Some(&old_id) = self.key_to_id.get(str_key) {
    self.id_to_key.remove(&old_id);
    // old_id stays in HNSW but won't map to any key → filtered out in search
}
let id = self.next_id;
self.next_id += 1;
self.hnsw.insert((&vector, id));
```

The old HNSW graph node cannot be removed (hnsw_rs does not support deletion). It stays in the graph structure and is only filtered out during post-search key lookup. Over many updates/renames, stale nodes accumulate:
- Search must traverse through stale nodes, increasing latency
- The graph structure degrades because stale nodes still participate in the navigation layers
- `next_id` grows monotonically, never reset

**Impact:** For a vault with frequent note edits, search quality and speed degrade over time. A full `RebuildIndex` (which creates a fresh HNSW from SQLite) is the only recovery path.

**Fix:** Track stale count and trigger automatic rebuild when stale ratio exceeds a threshold (e.g., >20% stale nodes). Or periodically schedule `RebuildIndex` after embedding passes.

#### 5. [LOW] `compute_sync_plan` uses only (mtime, size) — ignores content hash

**File:** `db.rs` lines 1771–1817

Change detection compares only `mtime_ms` and `size_bytes`:
```rust
match manifest.get(&rel) {
    None => added.push(abs.clone()),
    Some(&(db_mtime, db_size)) => match notes_service::file_meta(abs) {
        Ok((disk_mtime, _, disk_size)) => {
            if disk_mtime != db_mtime || disk_size != db_size {
                modified.push(abs.clone());
            }
```

The blake3 content hash (computed during block embedding, stored in `block_embeddings.content_hash`) is available but unused here. Scenarios:
- **False positive (unnecessary re-index):** `git checkout` restores identical file content with new mtime. File is re-indexed unnecessarily and potentially re-embedded.
- **False negative (missed change):** Hypothetical filesystem where mtime+size unchanged but content differs (extremely unlikely in practice).

**Fix:** Optionally compare content hash for files flagged as modified by mtime/size to avoid unnecessary re-indexing. The cost is computing blake3 on every changed file.

---

### Efficiency Gains

#### 6. [MEDIUM] `BATCH_SIZE = 100` creates excessive transactions

**File:** `db.rs` line 1819

```rust
const BATCH_SIZE: usize = 100;
```

Both `rebuild_index` and `sync_index` use `BEGIN IMMEDIATE ... COMMIT` per batch of 100 files. Each batch also calls `resolve_batch_outlinks` which can involve multiple SQL queries per link target.

For a vault with 50K files:
- 500 transactions × ~4-8 SQL statements each = 2000-4000 fsync operations
- Each `BEGIN IMMEDIATE` acquires the write lock, blocking concurrent reads briefly

Increasing `BATCH_SIZE` to 500–1000 would reduce transaction overhead significantly. The risk is larger rollback on interruption, but since this is index-only data (rebuildable), the trade-off favors larger batches.

**Recommendation:** Bump to 500 for rebuild (bulk operation), keep 100–250 for sync (incremental).

#### 7. [LOW] Embedding yield sleep proportional to batch time

**File:** `service.rs` lines 1671–1672 (note composition) and 1842–1843 (block embedding)

```rust
let sleep_ms = (batch_start.elapsed().as_millis() as u64) / 4;
std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
```

The worker sleeps for 25% of the batch processing time. For a batch that takes 100ms (embedding ~16 sections), the sleep is 25ms. For a batch that takes 2s (large sections), the sleep is 500ms. This adds up — embedding 10K sections at ~100ms/batch = 25% idle time = ~2.5s wasted.

The worker already runs at background QoS (`pthread_set_qos_class_self_np`), so CPU contention with the UI is minimal. A fixed small yield (e.g., `min(sleep_ms, 50)`) would maintain responsiveness without the proportional waste.

**Recommendation:** Cap the sleep at 50ms:
```rust
let sleep_ms = (batch_start.elapsed().as_millis() as u64 / 4).min(50);
```

#### 8. [LOW] `get_block_embedded_keys` loads all keys into memory

**File:** `vector_db.rs` lines 401–421

```rust
pub fn get_block_embedded_keys(conn: &Connection) -> HashSet<String> {
    // SELECT path, heading_id FROM block_embeddings → collect all into HashSet
}
```

This loads every `(path, heading_id)` composite key into a `HashSet`. For a vault with 10K notes averaging 5 embedded sections each = 50K entries. At ~60 bytes per key, that's ~3MB — not dangerous but grows linearly with vault size.

This function is called once per `handle_block_embed_batch` invocation (line 1736) to determine which sections need embedding. The set is then used to filter `get_embeddable_sections` results. For a vault with 100K sections, this is less efficient than a per-section lookup or a batched NOT EXISTS query.

**Recommendation:** Replace with a SQLite query that joins `note_sections` against `block_embeddings` to return only un-embedded sections directly, or use batched lookups.

#### 9. [LOW] PDF extraction spawns one thread per file

**File:** `text_extractor.rs` lines 148–151

```rust
fn extract_pdf_text(bytes: &[u8]) -> Result<(String, Vec<usize>), String> {
    std::thread::spawn(move || {
        let result = extract_pdf_pages_salvaged(&owned);
        let _ = tx.send(result);
    });
```

Each PDF extraction spawns a new OS thread with a 15-second timeout. During `rebuild_index`, all files are processed sequentially in the writer thread. So PDFs are processed one at a time — the thread-per-file pattern isn't a concurrency explosion risk, but creating/destroying threads during a rebuild loop is wasteful.

**Recommendation:** Use a dedicated reusable thread or call `extract_pdf_pages_salvaged` directly on the writer thread (since it's already background QoS). The timeout isolation for PDF panics is already handled by `catch_unwind` in `salvage_pages`.

#### 10. [LOW] `sync_index` loads full manifest into memory

**File:** `db.rs` lines 1750–1769

```rust
pub fn get_manifest(conn: &Connection) -> Result<BTreeMap<String, (i64, i64)>, String> {
    let mut stmt = conn.prepare("SELECT path, mtime_ms, size_bytes FROM notes")?;
    // collect all rows into BTreeMap
}
```

For a vault with 50K notes, this loads ~50K entry map (~5MB). Not dangerous for modern systems, but unnecessary for incremental syncs where most files are unchanged. The manifest is then compared against the disk scan in `compute_sync_plan` — both are full scans.

**Recommendation:** Stream the manifest comparison instead of collecting both sides. Or build the disk-side set first and query manifest entries only for files seen on disk, doing removal detection via a separate pass.

---

### Design Observations

#### 11. No SQLite maintenance — no VACUUM, no PRAGMA optimize

The search databases grow with delete-and-reinsert patterns during sync and rebuild. SQLite does not reclaim space from deleted rows automatically. Over months of vault usage with file churn, the `.db` files can bloat significantly.

**Recommendation:**
- Run `PRAGMA optimize` after rebuild/sync completion (cheap, ~1ms)
- Consider periodic `VACUUM` (expensive, but can be scheduled on vault close or during idle)

#### 12. Magic string `@linked/` scattered through codebase

**File:** `db.rs` — used in delete clauses lines 1996–2036, sync plan line 1807

The `@linked/` path prefix (for externally linked/imported sources) appears as a string literal in multiple SQL LIKE clauses and filter predicates. Should be a named constant.

#### 13. Watcher debounce only for modify events

**File:** `watcher/service.rs` lines 289–301

The 500ms debounce map (`last_emitted`) applies only to `AssetChanged` and `NoteChangedExternally` events. `NoteAdded`, `NoteRemoved`, `FolderCreated`, and `FolderRemoved` are emitted immediately without debounce. Bulk operations (e.g., importing 100 files) would fire 100 add events, each potentially triggering a frontend reconciliation.

**Recommendation:** Extend debounce to create/remove events, or batch events into a single "paths changed" notification.

#### 14. Missing index on `note_embeddings` for path prefix queries

**File:** `vector_db.rs` — `remove_embeddings_by_prefix` (line 61) and `rename_embeddings_by_prefix` (line 88)

These use `WHERE path LIKE 'prefix%' ESCAPE '\'` — the `path` column is `TEXT PRIMARY KEY` which has an implicit unique index, but the LIKE prefix query can still benefit from it. This is fine in practice since the PK index supports range scans on TEXT.

#### 15. `mean_pool_normalize` weights all sections equally

**File:** `vector_db.rs`

Note-level embeddings are computed by mean-pooling all block vectors equally, regardless of section word count. A 5-word section and a 200-word section contribute equally to the note vector. Word-count-weighted mean would better represent the document's semantic content.

**Trade-off:** The current approach is simpler and already produces good results per DL-003. Weighting would require passing word counts through the composition pipeline.

#### 16. Embedding model version check on every embed_batch call

**File:** `service.rs` lines 1480–1486

```rust
let model_version = vector_db::get_model_version(conn);
if model_version.as_deref() != Some(&short_id) {
    // clear all embeddings, re-embed everything
}
```

This check runs every time `EmbedBatch` is dispatched. If the version matches, it's a wasted DB query. Since the model version changes only when the user switches embedding models (rare), this could be cached in the worker state.

**Recommendation:** Cache `model_version` in `VaultWorker` and only re-check on model ID change event or `RebuildEmbeddings`.

---

## Summary Table

| # | Category | Severity | Issue | Location |
|---|----------|----------|-------|----------|
| 1 | Bug | Medium | `handle_rebuild` doesn't clear embeddings — HNSW/FTS drift | `service.rs:1268` |
| 2 | Bug | Low | `sync_index_paths` never refreshes HNSW indices | `service.rs:1320` |
| 3 | Bug | Low | FTS matches markdown syntax artifacts | `db.rs:1134` |
| 4 | Degradation | Medium | HNSW stale nodes accumulate, degrade search | `hnsw_index.rs:141` |
| 5 | Bug | Low | Change detection ignores content hash | `db.rs:1771` |
| 6 | Efficiency | Medium | BATCH_SIZE=100 creates excessive transactions | `db.rs:1819` |
| 7 | Efficiency | Low | Embedding yield sleep is proportional to batch time | `service.rs:1671` |
| 8 | Efficiency | Low | `get_block_embedded_keys` loads all keys into memory | `vector_db.rs:401` |
| 9 | Efficiency | Low | PDF extraction spawns thread per file | `text_extractor.rs:148` |
| 10 | Efficiency | Low | `sync_index` loads full manifest into memory | `db.rs:1750` |
| 11 | Design | Note | No SQLite VACUUM/PRAGMA optimize | `db.rs` |
| 12 | Design | Note | Magic `@linked/` string scattered | `db.rs` |
| 13 | Design | Note | Watcher debounce only for modify events | `watcher/service.rs:289` |
| 14 | Design | Note | Equal section weighting in mean-pool | `vector_db.rs` |
| 15 | Design | Note | Model version checked on every embed_batch | `service.rs:1480` |

> **Correction (2026-06-20):** This table has a **numbering mismatch** with the
> Findings body (which numbers issues 1–16). The table above contains only 15
> rows: it drops body #14 ("Missing index on `note_embeddings` for path prefix
> queries" — the one that self-concludes "fine in practice") and renumbers
> body #15 → table #14 and body #16 → table #15. As a result, "issue #14" and
> "issue #15" refer to different findings depending on whether you read the
> body or the table. The correct mapping is:
>
> | Body # | Table # | Issue |
> |---|---|---|
> | 1 | 1 | `handle_rebuild` doesn't clear embeddings — HNSW/FTS drift |
> | 2 | 2 | `sync_index_paths` never refreshes HNSW indices |
> | 3 | 3 | FTS matches markdown syntax artifacts |
> | 4 | 4 | HNSW stale nodes accumulate, degrade search |
> | 5 | 5 | Change detection ignores content hash |
> | 6 | 6 | BATCH_SIZE=100 creates excessive transactions |
> | 7 | 7 | Embedding yield sleep is proportional to batch time |
> | 8 | 8 | `get_block_embedded_keys` loads all keys into memory |
> | 9 | 9 | PDF extraction spawns thread per file |
> | 10 | 10 | `sync_index` loads full manifest into memory |
> | 11 | 11 | No SQLite VACUUM/PRAGMA optimize |
> | 12 | 12 | Magic `@linked/` string scattered |
> | 13 | 13 | Watcher debounce only for modify events |
> | 14 | *(omitted)* | Missing index on `note_embeddings` for path prefix queries |
> | 15 | 14 | Equal section weighting in mean-pool |
> | 16 | 15 | Model version checked on every embed_batch |

---

## Recommended Priority Order

1. **Fix HNSW stale node accumulation** (#4) — implement auto-rebuild when stale ratio exceeds threshold
2. **Fix FTS/HNSW drift on rebuild** (#1) — either clear embeddings during rebuild or document the separation
3. **Increase BATCH_SIZE** (#6) — simple constant change, immediate throughput improvement for large vaults
4. **Cap embedding yield sleep** (#7) — reduce idle time during embedding passes
5. **Add SQLite PRAGMA optimize** (#11) — one-liner, zero-cost maintenance
6. **Fix `sync_index_paths` HNSW refresh** (#2) — close the correctness gap after file watcher events
7. **Replace `get_block_embedded_keys` with query** (#8) — reduce memory for large vaults
8. **Stream manifest comparison** (#10) — reduce memory pressure during sync

---

## Not Investigated (Out of Scope)

- Frontend search ranking/relevance tuning
- Plugin/MCP search integration paths
- Search command palette (`search_commands.ts`) implementation quality
- Embedding model accuracy/regression testing
- Multi-vault concurrent indexing behavior under load

---

## Resolution Status (appended 2026-06-21)

Remediation pass on branch `fix/vault-indexing-review`. Findings re-verified
against code before acting; the prioritization and the choices below were
approved by the maintainer. Findings 1–16 use the **body** numbering. The
historical findings above are unchanged; this section only records disposition.

| # | Body finding | Disposition | Commit | Notes |
|---|---|---|---|---|
| 1 | rebuild/sync leaves embeddings stale vs content | **FIXED** | `b8e12919` (+ simplify `67085d94`) | Approach (c): content-hash-aware invalidation at the indexing seam (`invalidate_changed_embeddings` in `db.rs` → `vector_db::invalidate_changed_block_embeddings`). Re-embed only changed/removed sections; note vector cleared for recomposition. Convergence verified (identical re-index is a no-op). Refined away from the literal per-pass body-read gate to avoid a steady-state regression while preserving the approved behavior. |
| 2 | `sync_index_paths` never refreshes HNSW | **FIXED** | `dc8f013e` | `evict_note_from_indices` drops removed/vanished paths from both HNSW indices in `handle_sync_paths`. |
| 3 | FTS stores raw markdown | **DEFER** | — | Design trade-off; needs full re-index, benefit speculative, no user-pain evidence. Maintainer go/no-go: defer. |
| 4 | HNSW stale-node accumulation | **FIXED** | `a7b4903f` | Wired the already-tested `compact_if_stale()` (>30% stale) into both embed paths via `compact_indices_if_stale`. |
| 5 | change detection ignores content hash | **DEFER** | — | Adds blake3 to the common path to avoid rare wasted re-index; not worth it. |
| 6 | `BATCH_SIZE=100` excessive transactions | **FIXED** | `8a920d74` | `REBUILD_BATCH_SIZE=500` for bulk rebuild; sync stays 100. (Review's per-commit fsync claim is inaccurate under WAL+`synchronous=NORMAL`; benefit is reduced txn overhead.) |
| 7 | embedding yield sleep proportional | **FIXED** | `c4de4fdf` | `yield_sleep_ms` caps the per-batch yield at 50ms. |
| 8 | `get_block_embedded_keys` loads all keys | **DEFER** | — | ~3MB @50K sections, transient; gating-rewrite risk > benefit. |
| 9 | PDF thread per file | **DEFER/WONTFIX** | — | The spawned thread provides the 15s timeout + panic isolation; removing it trades safety for ~0 gain. |
| 10 | `sync_index` loads full manifest | **DEFER** | — | ~5MB @50K, transient; streaming rewrite risk not justified. |
| 11 | no PRAGMA optimize / VACUUM | **FIXED (optimize)** | `e5336e67` | `run_pragma_optimize` after full rebuild/sync. VACUUM deferred. Maintainer go/no-go: optimize yes. |
| 12 | magic `@linked/` string | **DEFER** | — | Most of the 27 sites are SQL literals (`NOT LIKE '@linked/%'`) where a constant doesn't substitute cleanly. Maintainer go/no-go: defer. |
| 13 | watcher debounce only for modify | **DEFER** | — | add/remove can't be dropped like modify; coalescing needs design; risk of UI desync. Maintainer go/no-go: defer. |
| 14 | path-prefix index | **WONTFIX** | — | `note_embeddings.path TEXT PRIMARY KEY` already indexes prefix range scans. |
| 15 | equal-weight mean-pool | **DEFER/WONTFIX** | — | Unmeasured ML tuning, no eval harness; could regress (DL-003 reports current works). Maintainer go/no-go: defer. |
| 16 | model-version check per embed_batch | **DEFER/WONTFIX** | — | Negligible (one indexed PK lookup per *batch*); caching adds invalidation risk of silent mis-embedding. |

Tests added (inline `#[cfg(test)]`, the repo's de-facto Rust convention since
`autotests = false` leaves `tests/*.rs` unwired except `external_mcp_state`):
`hnsw_index::compact_if_stale_compacts_only_past_threshold`,
`service::{evict_note_from_indices…, yield_sleep_is_quarter_batch_capped_at_50ms}`,
`vector_db::{invalidate_changed_block_embeddings_only_clears_on_content_change,
invalidate_leaves_unrelated_notes_untouched}`,
`db::{invalidate_changed_embeddings_reembeds_only_changed_sections,
run_pragma_optimize_succeeds_on_populated_index}`. Gates: `cargo check` clean,
189 search lib tests pass, `pnpm check` clean.
