# Vault Startup Performance Plan

**Date:** 2026-03-20
**Problem:** Opening a 298-note, 26-folder vault causes a 30–60s hang (macOS spinning wheel)

## Root Cause Analysis

Six bottlenecks fire during vault open:

1. **298 file opens on the critical path** — `build_note_meta` opens every `.md` to extract titles (reads first 8KB each) before the UI can render. Location: `src-tauri/src/features/notes/service.rs:1258`
2. **3 redundant full WalkDirs** — `sync_index`, `get_folder_stats`, and `refresh_note_count` each independently walk the entire vault tree within milliseconds of each other
3. **298+ stat() calls even when nothing changed** — `compute_sync_plan` calls `fs::metadata()` on every file to compare mtime/size against the DB manifest on every open. Location: `src-tauri/src/features/search/db.rs:791`
4. **Duplicate root folder fetch** — `vault.initialize` loads root contents, then `mount_ready_vault_state` immediately discards it and re-fetches via `folder_refresh_tree`
5. **No caching of ignore matchers** — `.gitignore`/`.vaultignore` are re-read from disk 3+ times during startup. Location: `src-tauri/src/shared/vault_ignore.rs:70`
6. **sync_index blocks on full completion** — even though it's "background," the frontend awaits the `Completed` event

### Startup Execution Flow (current)

```
onMount (app_shell.svelte:77)
  └─ execute_app_mounted (app_actions.ts:198)
       ├─ Promise.all:
       │    ├─ vault.initialize → open_vault → finish_open_vault
       │    │    ├─ load_open_vault_snapshot
       │    │    │    ├─ notes_port.list_folder_contents(root)     ← 298 file opens (BLOCKING)
       │    │    │    ├─ vault_port.list_vaults()
       │    │    │    └─ load_pinned_vault_ids()
       │    │    └─ background triggers (non-awaited):
       │    │         ├─ trigger_dashboard_stats_refresh            ← WalkDir #1
       │    │         ├─ trigger_background_index_sync              ← WalkDir #2 + 298 stat()
       │    │         └─ trigger_background_note_count_refresh      ← WalkDir #3
       │    ├─ settings.load_recent_command_ids()
       │    ├─ hotkey.load_hotkey_overrides()
       │    └─ theme.load_themes()
       └─ mount_ready_vault_state
            └─ reconcile_workspace({ refresh_tree: true })
                 └─ folder_refresh_tree
                      └─ load_folder("")                            ← DUPLICATE root fetch
```

## Implementation Plan

### Phase 1: Quick Wins (do first, independent of each other)

#### A. Cache titles in the index DB

**Impact:** Eliminates the biggest critical-path blocker (298 file opens → 0)
**Effort:** Medium

The `notes` table in the search DB already stores parsed note data. Title is extracted during indexing but not exposed to `list_folder_contents`.

**Steps:**

1. Ensure the `notes` table has a `title` column (check if it already exists from parsing)
2. Add a Rust function `get_cached_titles(conn, paths: &[String]) -> HashMap<String, String>` in `search/db.rs` that bulk-fetches titles from the index DB
3. Modify `build_note_meta` in `notes/service.rs` to accept an optional pre-fetched title map
4. In `list_folder_contents`, before the pagination loop:
   - Collect all `.md` relative paths in the current page
   - Batch-fetch titles from the index DB
   - Pass the map into `build_note_meta`
5. Fall back to `extract_title` (file read) only for notes not yet indexed
6. Net result: first open after a fresh index rebuild may still read files; every subsequent open reads zero files for title display

**Key files:**

- `src-tauri/src/features/search/db.rs` — add `get_cached_titles`
- `src-tauri/src/features/notes/service.rs` — modify `build_note_meta`, `list_folder_contents`

#### B. Eliminate duplicate root folder fetch

**Impact:** ~2x speedup on IPC round trips for initial render
**Effort:** Small

`vault.initialize` fetches root contents via `list_folder_contents`, stores it in `root_contents`. Then `mount_ready_vault_state` calls `reconcile_workspace({ refresh_tree: true })` which calls `folder_refresh_tree` → `load_folder("")`, fetching root contents again and discarding the first result.

**Steps:**

1. In `mount_ready_vault_state` (app_actions.ts:116), pass a flag or check if root contents are already populated
2. Option A: Skip `folder_refresh_tree` when vault was just opened (preferred — simpler)
3. Option B: Have `folder_refresh_tree` check if root contents are fresh (< 1s old) and skip re-fetch
4. Ensure the folder tree store is populated from `load_open_vault_snapshot`'s result instead of being cleared and re-fetched

**Key files:**

- `src/lib/app/orchestration/app_actions.ts` — `mount_ready_vault_state`
- `src/lib/features/folder/application/folder_actions.ts` — `folder_refresh_tree`
- `src/lib/features/vault/application/vault_service.ts` — `load_open_vault_snapshot`

#### C. Merge the 3 WalkDirs into 1

**Impact:** Eliminates ~600 redundant inode accesses
**Effort:** Medium

Three independent WalkDir traversals run near-simultaneously:

- `list_indexable_files` in `sync_index` (search/db.rs:961)
- `get_folder_stats` (notes/service.rs:1351)
- `load_note_count` in `refresh_note_count` (vault/service.rs:60)

**Steps:**

1. Create a shared `VaultScanResult` struct:
   ```rust
   pub struct VaultScanResult {
       pub indexable_files: Vec<PathBuf>,
       pub note_count: usize,
       pub folder_count: usize,
       pub total_size_bytes: u64,
   }
   ```
2. Create a single `scan_vault(root, ignore_matcher) -> VaultScanResult` function that does one WalkDir pass and collects all three datasets
3. Call `scan_vault` once at the start of `sync_index`, emit the stats as a side-channel event
4. Remove the separate `get_folder_stats` and `load_note_count` calls from the frontend startup sequence
5. Have the frontend listen for a `VaultStatsEvent` emitted by `sync_index` to update dashboard stats and note count

**Key files:**

- `src-tauri/src/features/search/db.rs` — `sync_index`, `list_indexable_files`
- `src-tauri/src/features/notes/service.rs` — `get_folder_stats`
- `src-tauri/src/features/vault/service.rs` — `load_note_count`
- `src/lib/features/vault/application/vault_service.ts` — remove redundant triggers

#### D. Cache `load_vault_ignore_matcher`

**Impact:** Eliminates repeated file reads of .gitignore/.vaultignore
**Effort:** Small

`load_vault_ignore_matcher` reads `.gitignore`, `.vaultignore`, and vault settings JSON from disk on every call — at least 3 times during startup.

**Steps:**

1. Add a `once_cell::sync::Lazy` or `Mutex<Option<(Instant, IgnoreMatcher)>>` cache keyed by vault root path
2. Return cached matcher if it's < 5s old (covers the startup burst)
3. Invalidate on vault close or when the file watcher detects changes to ignore files
4. Alternatively, pass the matcher as a parameter through the startup call chain instead of re-creating it

**Key files:**

- `src-tauri/src/shared/vault_ignore.rs` — `load_vault_ignore_matcher`

### Phase 2: Architectural Improvements (after Phase 1)

#### E. Show UI immediately with stale/cached data

**Impact:** Perceived instant open — the user sees their vault immediately
**Effort:** Medium-Large

**Concept:** On vault close, snapshot the folder tree + note metadata to a lightweight cache (JSON or SQLite). On next open, render from cache immediately, then refresh in background.

**Steps:**

1. On vault close (or periodically), serialize the current folder tree state to `<vault>/.badgerly/tree_cache.json`
2. On vault open, if cache exists and is < 24h old:
   - Load and render the cached tree immediately (no IPC needed)
   - Show a subtle "syncing..." indicator
   - Run the real `list_folder_contents` + `sync_index` in background
   - Diff results against cache; update UI incrementally
3. If cache is missing or stale, fall back to current behavior (but now faster due to Phase 1 fixes)

**Key files:**

- `src-tauri/src/features/notes/service.rs` — add cache read/write
- `src/lib/features/vault/application/vault_service.ts` — cache-first loading path
- `src/lib/features/folder/application/folder_actions.ts` — incremental tree updates

#### F. Lazy title extraction

**Impact:** Critical path scales with page size (~20 notes), not vault size (298)
**Effort:** Medium

**Steps:**

1. `list_folder_contents` already paginates — ensure `build_note_meta` only runs for the current page slice (verify this is already the case)
2. For folder tree rendering (which doesn't need titles), return entries without title extraction
3. Extract titles on-demand when a note is visible in the sidebar or editor
4. Combine with (A) — DB-cached titles serve as the fast path; file reads only happen for brand-new uncached notes

#### G. Incremental sync with last-close timestamp

**Impact:** Reduces 298 stat() calls to near-zero on warm reopens
**Effort:** Large

**Steps:**

1. On vault close, record `last_sync_timestamp` in the index DB
2. On next open, use platform filesystem APIs to find files modified since that timestamp:
   - macOS: `FSEvents` or simply compare mtime > last_sync
   - Optimization: only stat files whose directory mtime changed (directories update mtime when children change)
3. Only run `compute_sync_plan` against the changed-file subset
4. Fall back to full scan if `last_sync_timestamp` is missing or > 7 days old

#### H. True fire-and-forget sync_index

**Impact:** UI unblocked immediately, index builds in background
**Effort:** Medium

**Steps:**

1. In `workspace_index_tauri_adapter.ts`, change `sync_index` to not await the `Completed` event
2. Emit incremental `NoteIndexed` events from the backend as each note is processed
3. Frontend updates search results progressively as notes are indexed
4. Show a progress indicator (already have `subscribe_open_vault_index_progress`) but don't block navigation

## Execution Order

```
Phase 1 (parallelize — each is independent):
  ├─ A: Cache titles in DB          ← biggest single win
  ├─ B: Eliminate duplicate fetch   ← smallest, do first
  ├─ C: Merge WalkDirs              ← second biggest win
  └─ D: Cache ignore matcher        ← small, quick

Phase 2 (sequential, after Phase 1):
  1. H: Fire-and-forget sync        ← unblocks UI from index
  2. F: Lazy title extraction        ← pairs with A
  3. E: Cached tree snapshot         ← best perceived perf
  4. G: Incremental sync             ← most complex, biggest long-term win
```

## Success Criteria

- Vault open (298 notes, 26 folders) completes in < 2s with no spinning wheel
- UI is interactive within 500ms of clicking "Open Vault"
- Background indexing completes within 5s without blocking the UI
- No regressions in search accuracy or folder tree correctness
