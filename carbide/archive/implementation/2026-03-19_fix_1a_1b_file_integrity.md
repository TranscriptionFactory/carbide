---
title: "Fix 1A + 1B: File Integrity — Multi-window Race & Spurious Mtime Warnings"
date: 2026-03-19
bugs: ["1A", "1B"]
status: implemented
branch: fix/file-integrity-1a-1b
---

## Problem

### 1A: Multi-window race condition on same note

Opening the same note in both primary and secondary split-view panes allows both to independently edit and autosave. The write queue serializes writes within one `NoteService`, but the second write overwrites the first's content (data loss). Secondary autosave did not mark conflicts on failure.

### 1B: Spurious "modified on disk" warnings during normal editing

False "Note has been modified externally" toasts appeared while typing with no external changes. Root cause: after primary pane writes and gets a new mtime, the secondary pane (if same note) retains the stale mtime. When secondary tries to save, Rust's `expected_mtime != disk_mtime` check fails → `conflict:mtime_mismatch` → autosave marks conflict → toast.

Additionally, `on_file_written` (watcher suppression) was called only BEFORE the write. If the watcher event arrived after write completion, the suppression timestamp could be stale relative to when the event actually fires.

## Root Cause Analysis

1. **No cross-pane mtime propagation**: `write_existing_note` called `mark_clean(new_mtime)` only on the writing pane's `EditorStore`. The other pane's store retained the pre-write mtime, causing false mtime mismatches on its next save.

2. **No inactive-pane save guard**: Both panes could independently trigger autosave for the same file. With separate content in each `EditorStore`, the serialized write queue would still cause the second write to overwrite the first.

3. **Watcher suppression window not refreshed after write**: `suppress_next()` was called before the async write started. For long writes, the suppression window could expire before the watcher event arrived.

4. **Secondary autosave didn't mark conflicts**: `create_split_view_autosave_reactor` silently ignored conflict results, unlike the primary reactor.

## Changes

### `split_view_service.ts`

- Added `is_same_note_in_both_panes(primary_note_id)`: checks if secondary has same note as primary
- Added `propagate_mtime_to_secondary(note_id, new_mtime)`: updates secondary store's mtime when note matches

### `note_service.ts`

- `write_existing_note`: calls `on_file_written` again AFTER write completes (refreshes watcher suppression window)
- `write_existing_note`: calls new `propagate_mtime_to_other_pane` after write
- Added `propagate_mtime_to_other_pane`: if primary wrote, propagate to secondary; if secondary wrote, propagate to primary
- `resolve_save_context`: added `is_inactive_pane_for_same_note` guard — returns null (skips save) when the inactive pane tries to save a note that both panes share
- Added `is_inactive_pane_for_same_note`: compares session target against active pane when both panes have the same note

### `autosave.reactor.svelte.ts`

- `create_split_view_autosave_reactor` now accepts `tab_service` parameter
- Secondary autosave marks conflicts on save failure (matches primary behavior)

### `reactors/index.ts`

- Passes `tab_service` to `create_split_view_autosave_reactor`

## Test Coverage

### `tests/unit/services/note_service_split_view.test.ts` (5 tests)

1. Propagates mtime to secondary pane after primary save
2. Propagates mtime to primary store after secondary save
3. Skips save from inactive pane when both panes have same note
4. Allows active pane save when both panes have same note
5. Both panes save independently when notes differ

### `tests/unit/services/split_view_service.test.ts` (7 tests)

1. `is_same_note_in_both_panes` returns true when same note
2. Returns false when different notes
3. Returns false when primary_note_id is null
4. Returns false when no secondary note open
5. `propagate_mtime_to_secondary` updates mtime when matching
6. Does not update when different note
7. Does nothing when secondary_store is null

### `tests/unit/reactors/autosave_reactor.test.ts`

- Updated existing test to pass `tab_service` mock

## Data Flow After Fix

```
Primary autosave triggers → save_note("primary")
  → resolve_save_context checks is_inactive_pane_for_same_note
  → write_existing_note:
    1. suppress_next(path)           // pre-write suppression
    2. Rust writes file              // disk mtime = N
    3. mark_clean(id, N)             // primary store mtime = N
    4. suppress_next(path)           // post-write suppression refresh
    5. propagate_mtime_to_secondary  // secondary store mtime = N
    6. sync_split_view_session

Secondary autosave triggers → save_note("secondary")
  → resolve_save_context: is_inactive_pane_for_same_note? → skip
```

## Remaining Considerations

- If true multi-cursor co-editing of the same note in both panes is desired, a shared buffer or CRDT approach would be needed. This fix takes the simpler "active pane wins" approach.
- The secondary pane can still become dirty independently, but its save will be skipped while it shares a note with primary. Users should use different notes in split view, or the active pane for edits.
