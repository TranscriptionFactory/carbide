# State Management Efficiency Audit

Date: 2026-03-21
Scope: split view and synchronized editing, file saves and loads, vault traversal and indexing, graph operations, embedding and database management

## Executive Summary

The codebase has solid architectural separation, but it currently pays a high runtime cost in a few hot paths where state transitions trigger expensive work too broadly.

The highest impact issues are:

1. Split view secondary editor remounting through the action update path.
2. Watcher driven tree refresh coupling to full index sync.
3. Graph refresh invalidating caches globally before every load.
4. O(n²) semantic edge construction and N plus 1 query patterns in bases queries.

## Findings by Area

### 1) Split View and Synchronized Editing

#### 1.1 High severity: Secondary editor remount path is too heavy

Evidence:

- `src/lib/features/split_view/ui/split_note_editor.svelte:14-23`
- `src/lib/features/split_view/application/split_view_service.ts:57-77`
- `src/lib/features/editor/application/editor_service.ts:80-97,507-533`

The Svelte action update handler calls `split_view_mount` again whenever the action parameter changes, and `mount_secondary` always calls `EditorService.mount`, which recreates the editor session. This is expensive and can be triggered by state updates that do not require a full remount.

Impact:

- Unnecessary editor teardown and recreation
- Extra state churn and potential cursor instability
- Higher CPU cost under autosave and sync activity

Recommendation:

- Split mount from update semantics
- Only mount once per root
- For same note path, update via `open_buffer` or lightweight markdown sync instead of `mount`

#### 1.2 Medium severity: Dual source of truth for secondary note state

Evidence:

- `src/lib/features/split_view/state/split_view_store.svelte.ts:10-12,31-44`
- `src/lib/features/split_view/application/split_view_service.ts:45-55`
- `src/lib/features/note/application/note_service.ts:993-998`

Secondary note data exists both in `SplitViewStore.secondary_note` and `secondary_store.open_note`, with manual synchronization points.

Impact:

- Extra coordination burden
- Risk of stale secondary snapshot windows
- Additional reactive writes with limited value

Recommendation:

- Keep only lightweight split view UI state in `SplitViewStore`
- Treat `secondary EditorStore` as content source of truth
- Derive secondary note view from service accessors

### 2) File Saves and Loads

#### 2.1 High severity: Tab note cache duplicates full markdown state per tab

Evidence:

- `src/lib/features/tab/state/tab_store.svelte.ts:25,294-302`
- `src/lib/features/tab/application/tab_action_helpers.ts:136-151`

The tab cache stores full `OpenNoteState` objects including markdown per tab. For large notes and many tabs this duplicates memory heavily.

Impact:

- Memory growth proportional to open tab count and note size
- Extra reactive churn from map cloning on cache updates

Recommendation:

- Cache minimal tab restore metadata only
- Keep markdown in editor buffers or load on demand
- Avoid storing full note bodies in tab state

#### 2.2 Medium severity: Open note abort does not cancel underlying read IO

Evidence:

- `src/lib/features/note/application/note_service.ts:227-230,244-248,535-544`

Open requests are version guarded with `AbortController`, but note reads are not cancellable through the port.

Impact:

- Wasted disk IO when users switch notes rapidly
- Extra stale work under heavy navigation

Recommendation:

- Add cancellable read support in `NotesPort` and adapter path, or queue and coalesce reads by note path

#### 2.3 Low severity: Duplicate watcher suppression calls around write

Evidence:

- `src/lib/features/note/application/note_service.ts:747,766`
- `src/lib/app/di/create_app_context.ts:275-277`

`on_file_written` is called both before and after write completion.

Impact:

- Redundant suppression writes
- No clear correctness benefit

Recommendation:

- Keep the post-write suppression call only

### 3) Vault Traversal and Indexing

#### 3.1 High severity: Watcher refresh path triggers full index sync too aggressively

Evidence:

- `src/lib/reactors/watcher.reactor.svelte.ts:107-117,162-180`
- `src/lib/app/orchestration/workspace_reconcile.ts:54-59`

Refresh decisions funnel into workspace reconciliation with both tree refresh and index sync in vault mode.

Impact:

- Frequent expensive index sync runs
- IO and CPU spikes under external file churn

Recommendation:

- Separate refresh tree from sync index
- Prefer targeted index mutations from event payload
- Reserve full sync for uncertain or batched states

#### 3.2 High severity: Tree refresh reload fan out is unbounded per loaded path

Evidence:

- `src/lib/features/folder/application/folder_actions.ts:607-632`

A refresh resets tree state, reloads root, then parallel reloads every previously loaded folder path.

Impact:

- Burst of concurrent folder content reads
- Merge overhead and UI stalls on large expanded trees

Recommendation:

- Add bounded concurrency
- Prioritize visible folders first
- Defer deeper folder reload until expanded in viewport

#### 3.3 Medium severity: Folder merge in notes store is O(n²) in common paths

Evidence:

- `src/lib/features/note/state/note_store.svelte.ts:285-313`

Merge uses repeated `findIndex` and `includes` scans against growing arrays.

Impact:

- CPU overhead increases sharply with folder size
- Slower repeated refreshes

Recommendation:

- Switch to map based merge keyed by id/path
- Sort once after merge completion

#### 3.4 Medium severity: Sync index always starts with full vault walk

Evidence:

- `src-tauri/src/features/search/db.rs:71-123,1047-1061`

Each sync scans the full vault tree before diffing against manifest.

Impact:

- Baseline O(total files) work even for small edits

Recommendation:

- Maintain incremental dirty path queue from watcher events
- Run full scan as fallback on schedule or uncertainty

#### 3.5 Medium severity: Post sync bookkeeping does full note map reload

Evidence:

- `src-tauri/src/features/search/service.rs:653-655`
- `src-tauri/src/features/search/service.rs:616-619`

After index ops, the writer reloads the entire notes map and rebuilds property registry when indexed greater than zero.

Impact:

- Extra full table cost after already expensive index work

Recommendation:

- Incrementally update cache and registry where possible
- Gate full rebuild behind thresholds

### 4) Graph Operations

#### 4.1 High severity: Graph reactor invalidates caches globally before each load

Evidence:

- `src/lib/reactors/graph_refresh.reactor.svelte.ts:113-124`
- `src-tauri/src/features/graph/service.rs:135-138,144-145`

The reactor calls `invalidate_cache()` without note id for both neighborhood and vault loads, clearing broad cache scopes.

Impact:

- Cache hit rate collapses
- Repeated expensive graph rebuilds

Recommendation:

- For neighborhood updates, invalidate only affected note path
- For vault graph, invalidate by index revision change rather than every refresh decision

#### 4.2 High severity: Semantic edge generation is O(n²) with extra per node DB lookups

Evidence:

- `src-tauri/src/features/search/vector_db.rs:133-171`
- `src-tauri/src/features/search/service.rs:1305-1317`

Batch KNN loads all embeddings, compares every query node against all candidates, then excludes linked nodes via backlink and outlink queries per source node.

Impact:

- Large latency and memory overhead as vault grows
- Poor scaling for semantic graph mode

Recommendation:

- Move to ANN index or precomputed neighbor graph
- Preload linked sets once per batch
- Use top k selection without full sort

#### 4.3 Medium severity: Full vault graph eagerly materializes full snapshot

Evidence:

- `src-tauri/src/features/graph/service.rs:167-198`

All nodes and edges are read and materialized in one response and cloned into cache.

Impact:

- Memory spikes for large vaults
- Slow first paint

Recommendation:

- Use streamed mode by default for large vaults
- Apply size based fallback thresholds automatically

#### 4.4 Low severity: Timeout timer in vault load path is not cleared

Evidence:

- `src/lib/features/graph/application/graph_service.ts:94-105`

`Promise.race` timeout allocation is not explicitly cleared on success.

Impact:

- Timer churn over repeated loads

Recommendation:

- Replace with cancellable timeout helper

### 5) Embedding and Database Management

#### 5.1 High severity: Embedding sync checks existing vectors with one query per note

Evidence:

- `src-tauri/src/features/search/service.rs:770-773`
- `src-tauri/src/features/search/vector_db.rs:210-216`

The embed batch path filters notes needing embedding by calling `has_embedding` per path.

Impact:

- O(N) DB round trips before embedding
- Significant overhead for large vaults

Recommendation:

- Load all embedded paths once into a hash set and diff in memory

#### 5.2 Medium severity: Bases query has N plus 1 pattern for properties and tags

Evidence:

- `src-tauri/src/features/search/db.rs:3191-3225`

For each row returned from notes query, properties and tags are fetched via additional queries.

Impact:

- Query latency scales poorly with page size

Recommendation:

- Bulk fetch properties and tags for all returned paths with IN batching and in memory grouping

#### 5.3 Medium severity: Read side DB operations are serialized behind one mutexed connection

Evidence:

- `src-tauri/src/features/search/service.rs:873-879`

All read APIs route through one worker read connection lock.

Impact:

- Long query starvation and reduced concurrency

Recommendation:

- Introduce read connection pool or dedicated heavy query connections

#### 5.4 Low severity: Graph backend opens fresh DB connections rather than reusing search read worker

Evidence:

- `src-tauri/src/features/graph/service.rs:103,167,211,263`

Impact:

- Extra connection setup overhead
- Fragmented connection level caching behavior

Recommendation:

- Reuse search service read connection interface where practical

## Prioritized Remediation Plan

### Immediate

- Remove split view remount loop in action update path.
- Stop global graph cache invalidation on every refresh cycle.
- Decouple watcher tree refresh from unconditional index sync.

### Next

- Replace note store folder merge with map based merge.
- Replace embedding existence per note queries with one preload set.
- Refactor bases query to bulk load properties and tags.

### After

- Introduce incremental index update queue driven by watcher deltas.
- Add ANN or precomputed semantic neighbor graph pipeline.
- Rework tab note cache to avoid full markdown duplication.

## Risk Notes

- Most findings are internal behavior and can be refactored without backward compatibility constraints.
- The highest risk cluster is around split view and watcher/index interactions because they touch many reactors and user visible flows.
- Introduce metrics before and after each major fix: index sync duration, graph load latency, autosave time, split editor mount count.

## Verification Results

Date: 2026-03-21

All 17 findings verified against source code. Cited line ranges are accurate and described behaviors match implementation.

### Verification Notes

#### 4.1 Graph cache invalidation — nuance

The Rust-side `graph_invalidate_cache` (`service.rs:130-138`) already supports scoped invalidation when a `note_id` is provided — it invalidates only connected paths. The problem is the caller (the reactor at `graph_refresh.reactor.svelte.ts:115,123`) never passes the note path to `invalidate_cache()`. The fix belongs in the TS reactor, not the Rust backend.

#### 1.1 Split view remount — nuance

`mount_secondary` (`split_view_service.ts:63-72`) already guards against recreating `EditorService`/`EditorStore` if they exist. The waste is in calling `this.secondary_editor.mount()` on line 76 unconditionally, which triggers `recreate_session()` even when the same note is already mounted.

## Confirmed Priority Order

### Tier 1 — Immediate (high impact, low-medium complexity) ✅ COMPLETED 2026-03-21

| Priority | Finding                                                                                                                         | Est. Scope | Status  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| 1        | 4.1 Graph cache invalidation — pass `note_path` from reactor to `invalidate_cache()` for neighborhood loads                     | ~5 lines   | ✅ Done |
| 2        | 1.1 Split view remount — add same-note guard in `mount_editor` update path or `mount_secondary`, skip `mount` if path unchanged | ~10 lines  | ✅ Done |
| 3        | 3.1 Watcher/index decoupling — make `sync_index` conditional on event type rather than always true in vault mode                | ~15 lines  | ✅ Done |

#### Tier 1 Implementation Notes

**4.1 Graph cache invalidation:** Reactor now passes `note_path` to `invalidate_cache()` for neighborhood loads, enabling scoped invalidation via the existing Rust backend support. Vault graph loads skip invalidation entirely — they already rebuild from scratch.

**1.1 Split view remount:** `mount_secondary` now short-circuits when the same note path is already mounted, avoiding unnecessary `recreate_session()` calls. First mount and note-switch paths remain unchanged.

**3.1 Watcher/index decoupling:** `WatcherEventDecision.refresh_tree` now carries `affects_index` flag. Note add/remove and ignore-file changes set `affects_index: true`; folder create/remove set `affects_index: false`. The debounced tree refresh merges this flag across batched events — if any event in the batch affects the index, sync runs. Tests updated to verify the new semantics.

### Tier 2 — Next (high impact, medium complexity) ✅ COMPLETED 2026-03-21

| Priority | Finding                                                                                                                        | Est. Scope | Status  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------- |
| 4        | 5.1 Embedding existence batch — replace per-note `has_embedding` with single `SELECT path FROM note_embeddings` into a HashSet | ~20 lines  | ✅ Done |
| 5        | 3.3 Note store merge O(n²) — replace `findIndex`/`includes` with Map-keyed merge                                               | ~30 lines  | ✅ Done |
| 6        | 5.2 Bases N+1 query — batch property/tag fetch with `WHERE path IN (...)`                                                      | ~40 lines  | ✅ Done |

#### Tier 2 Implementation Notes

**5.1 Embedding existence batch:** Added `get_embedded_paths()` to `vector_db.rs` — single query loads all embedded paths into a `HashSet<String>`. The filter in `handle_embed_batch()` now does O(1) set lookups instead of N individual DB queries.

**3.3 Note store merge O(n²):** Replaced `findIndex`/`includes` linear scans in `merge_folder_contents` with `Map` (keyed by `id` for notes, `path` for files) and `Set` (for folders). Incoming items overwrite via `map.set()`/`set.add()`, then arrays are extracted and sorted once.

**5.2 Bases N+1 query:** Replaced per-row property and tag queries in `query_bases` with two batch `WHERE path IN (...)` queries. Results are grouped into `HashMap<String, ...>` by path, then consumed when building final rows. Reduces 2N+1 queries to 3.

### Tier 3 — After (high impact, high complexity) ✅ COMPLETED 2026-03-21

| Priority | Finding                                                                     | Est. Scope                  | Status  |
| -------- | --------------------------------------------------------------------------- | --------------------------- | ------- |
| 7        | 3.2 Tree refresh fan-out — add concurrency limiter                          | Medium refactor             | ✅ Done |
| 8        | 4.2 Semantic edge O(n²) — preload linked sets once, consider ANN index      | Larger architectural change | ✅ Done |
| 9        | 2.1 Tab note cache — store minimal metadata instead of full `OpenNoteState` | Careful consumer migration  | ✅ Done |
| 10       | 3.4 Incremental index — watcher-delta queue replacing full vault walk       | Largest scope               | ✅ Done |

#### Tier 3 Implementation Notes

**3.2 Tree refresh fan-out:** Added `map_with_concurrency` utility (`shared/utils/concurrent.ts`) that limits concurrent async operations. The folder refresh `Promise.all` replaced with bounded concurrency of 5 parallel folder reloads, preventing burst IO pressure on large expanded trees.

**4.2 Semantic edge preload:** Added `get_linked_paths_batch()` to `db.rs` — two batch SQL queries (outlinks by source, backlinks by target) load all linked sets for the entire batch into a `HashMap<String, HashSet<String>>`. The `knn_search_batch` signature changed from per-node closure to pre-loaded map, eliminating 2N individual DB queries.

**2.1 Tab note cache:** Cache now only stores `OpenNoteState` for dirty tabs. Clean tabs are evicted from cache on snapshot and reload from disk on switch (via the existing `open_note` fallthrough path). The `cache_open_note_for_tab` helper also gates on `is_dirty`. Memory savings proportional to (open clean tabs × note size).

**3.4 Incremental index:** Added `sync_index_paths` function to `db.rs` that processes specific changed/removed paths without full vault walk. New `DbCommand::SyncPaths` variant and `index_sync_paths` Tauri command. Watcher reactor now collects note paths from add/remove events into `pending_changed_paths`/`pending_removed_paths` during the debounce window and passes them through `workspace_reconcile` as `sync_index_paths`. Falls back to full sync when paths are unknown (e.g., ignore-file changes) or when the incremental call fails.

### Deprioritized (medium/low severity)

Findings 1.2, 2.2, 2.3, 3.5, 4.3, 4.4, 5.3, 5.4 — address opportunistically or alongside related tier 1-3 work.
