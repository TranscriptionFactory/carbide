---
title: "Fix 1C — File tree refresh on folder deletion"
date: 2026-03-19
status: implemented
bug_ref: "1C"
---

## Problem

File tree doesn't refresh after folder deletion or creation. Hidden folders require manual refresh. The Rust watcher only emitted events for markdown files (`.md`) and asset modifications — folder create/remove events were silently dropped.

## Root Cause

1. `classify_event()` in `service.rs` only matched `Create`/`Remove` when `is_markdown` was true
2. No `FolderCreated`/`FolderRemoved` variants existed in `VaultFsEvent`
3. For deleted paths, `abs.is_dir()` returns `false` (path no longer exists), so directory detection failed on remove events
4. Frontend had no handler for folder-level filesystem events

## Fix

### Rust (`src-tauri/src/features/watcher/service.rs`)

- Added `FolderCreated` and `FolderRemoved` variants to `VaultFsEvent` enum
- Extended `classify_event()` with an `is_dir` parameter; folder arms are ordered before markdown arms to ensure correct precedence
- Augmented `is_dir` computation: for `Remove` events where the path no longer exists, infer directory status from absence of file extension (safe because all tracked files have extensions like `.md`)

### TypeScript — event types (`src/lib/features/watcher/types/watcher.ts`)

- Added `folder_created` and `folder_removed` union members to `VaultFsEvent`

### TypeScript — reactor (`src/lib/reactors/watcher.reactor.svelte.ts`)

- Added `case "folder_created"` and `case "folder_removed"` in `resolve_watcher_event_decision()`, both returning `{ action: "refresh_tree" }`
- Tree refresh is debounced (300ms) to coalesce rapid events (e.g., deleting a folder triggers remove events for all children)

## Files Changed

| File                                          | Change                                     |
| --------------------------------------------- | ------------------------------------------ |
| `src-tauri/src/features/watcher/service.rs`   | Added folder event variants + is_dir param |
| `src/lib/features/watcher/types/watcher.ts`   | Added folder event types                   |
| `src/lib/reactors/watcher.reactor.svelte.ts`  | Handle folder events → refresh_tree        |
| `tests/unit/reactors/watcher_reactor.test.ts` | Added 2 test cases for folder events       |

## Testing

- 20/20 watcher reactor unit tests pass (2 new for folder events)
- `cargo check` clean
- `pnpm check` clean (pre-existing lint_actions.test.ts errors unrelated)
