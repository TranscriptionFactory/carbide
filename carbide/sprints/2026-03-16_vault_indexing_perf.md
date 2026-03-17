# Vault Initial Indexing Performance Fix

**Bug:** #4 — Vault initial indexing too slow (~30s spinner)
**Priority:** P1
**Date:** 2026-03-16
**Branch:** `perf/vault-indexing-speed`

## Root Cause Analysis

The ~30s spinner on vault open was caused by `load_note_count()` being called synchronously inside `open_vault()`, `open_vault_by_id()`, `open_folder()`, and `promote_to_vault()` Tauri commands. This function performs a full `WalkDir` scan of the vault directory to count `.md` files — blocking the IPC response until the walk completes. For large vaults (1000+ files on spinning disk or networked storage), this takes 10-30 seconds.

Secondary contributors:

- SQLite page cache defaulting to 2MB (insufficient for index-heavy workloads)
- Outlink resolution running outside transactions (extra I/O per batch)

## Changes

### 1. Async note count (highest impact)

**`src-tauri/src/features/vault/service.rs`**

Removed synchronous `load_note_count()` from all vault open commands. Vault now opens immediately using the cached `existing_note_count` from the vault registry.

Added a new `refresh_note_count` Tauri command that performs the same WalkDir scan but is called asynchronously after vault open, via fire-and-forget from the frontend.

### 2. Frontend async refresh

**`src/lib/features/vault/application/vault_service.ts`**

Added `trigger_background_note_count_refresh()` — called in `finish_open_vault()` alongside the existing background index sync. Updates `VaultStore.note_count` when complete.

**`src/lib/features/vault/ports.ts`** — Added `refresh_note_count` to `VaultPort`.
**`src/lib/features/vault/adapters/vault_tauri_adapter.ts`** — IPC adapter.
**`src/lib/features/vault/state/vault_store.svelte.ts`** — Added `update_note_count()`.

### 3. SQLite performance PRAGMAs

**`src-tauri/src/features/search/db.rs`**

Added to `open_search_db_at_path()`:

- `PRAGMA cache_size=-8000` — 8MB page cache (up from default ~2MB)
- `PRAGMA mmap_size=268435456` — 256MB memory-mapped I/O for faster reads

### 4. Outlink resolution inside transactions

**`src-tauri/src/features/search/db.rs`**

Moved `resolve_batch_outlinks()` inside the `BEGIN IMMEDIATE`/`COMMIT` block in both `rebuild_index()` and `sync_index()`. Previously outlinks were written in separate implicit transactions after each batch commit — now they're batched with the note upserts.

## Testing

- All 1442 existing tests pass
- TypeScript types: 0 errors
- Layering lint: passes
- Added `refresh_note_count` mock to test helpers and 5 test suites exercising vault open

## Expected Impact

- Vault open should be near-instant (returns cached count, no disk walk)
- Note count updates in background within seconds
- Index sync benefits from larger SQLite cache and fewer transaction boundaries
- First-time vault open (no cached count) shows `null` note count until background refresh completes
