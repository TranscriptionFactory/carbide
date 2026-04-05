# Missed Issues: LSP Retry Storm & Watcher Directory Noise

**Date:** 2026-04-05
**Related:** `2026-04-05_memory_leak_find_in_file.md`
**Evidence:** `carbide/process_samples/carbide.log`, `carbide/process_samples/2026-04-05_console_log.txt`

## Issue 1: LSP Retry Storm (Medium Severity)

### Symptoms

`carbide.log` shows 8+ full retry cycles of `RestartableLspClient` in 6 minutes (13:25–13:31), each spawning a dead `rumdl` process that immediately fails with `cannot execute binary file` (wrong architecture).

### Root Cause

Two layers interact badly when the LSP binary is permanently broken:

**Layer 1 — Backend (`restartable.rs`):** Correctly caps at `max_restarts: 3` per spawn attempt with exponential backoff (1s, 2s, 4s). After 3 failures, emits `LspSessionStatus::Failed` and returns. This layer is fine.

**Layer 2 — Frontend (`lint.reactor.svelte.ts:20-43`):** A Svelte `$effect` watches `vault_store.vault`, `ui_store.editor_settings_loaded`, `ui_store.editor_settings.lint_enabled`, and `ui_store.editor_settings.lint_rules_toml`. Any reactive change to these values calls `lint_service.start()` again, which spawns a **new** `RestartableLspClient` — burning through another 3 retries against the same broken binary.

The log shows overlapping cycles (a second cycle starts at 13:25:13 before the first finishes at 13:25:20), meaning multiple `$effect` triggers fire concurrently.

### Evidence from logs

```
13:25:07  RestartableLspClient: spawn failed (cycle 1, attempt 1)
13:25:09  retrying in 4000ms (attempt 3)
13:25:13  spawn failed → lint_service reports failure
13:25:13  [lint_service] Failed to start lint  ← cycle 1 done
13:25:13  NEW spawn failed                     ← cycle 2 already started (reactor re-fired)
13:25:20  [lint_service] Failed to start lint  ← cycle 2 done
13:25:30  spawn failed                         ← cycle 3 starts
...
13:31:05  spawn failed                         ← cycle 8+, still going
```

Each cycle spawns a child process, allocates pipe buffers, and waits through backoff timers — all for a binary that will never work.

### Impact

Not the primary memory leak (that's the find-in-file cascade), but:

- Wastes CPU on doomed process spawns
- Allocates and leaks pipe/process resources each cycle
- Pollutes logs (90+ lines of identical errors)
- Could interact with memory pressure by adding allocation churn during the find-in-file storm

## Issue 2: Watcher Directory Events (Low Severity)

### Symptoms

`carbide.log` lines 91-96 and 117-125 show the watcher reactor firing on directory-level and empty-path events:

```
[watcher_reactor] Asset changed externally path=
[watcher_reactor] Asset changed externally path=assets
[watcher_reactor] Asset changed externally path=assets/excalidraw
[watcher_reactor] Asset changed externally path=0_TODO
[watcher_reactor] Asset changed externally path=2_GUIDES
[watcher_reactor] Asset changed externally path=2_GUIDES/cheatsheets
```

### Root Cause

macOS `fsevents` delivers events for parent directories when files inside them change. The watcher reactor processes these as "asset changed externally" without filtering out directory-only events. The empty-path event (`path=`) is particularly suspect — it may represent a root-level fsevents notification.

### Impact

Low in isolation. These events likely trigger store updates that cause downstream reactive re-evaluation. If any of these touch stores watched by the lint reactor or editor, they amplify the retry storm (Issue 1) or cause unnecessary editor refreshes.

## Additional Observation: Dual `runJavaScriptInFrameInScriptWorld`

The console log at 09:50:17 shows two `runJavaScriptInFrameInScriptWorld` Activity starts within 27 microseconds of each other (lines 96-97), each triggering 2 asset requests (4 total). This suggests the find-in-file reactor fires twice per query update — once for the `query` change and once for the `selected_match_index: 0` reset. Both are set in the same `update_find_state()` call, but Svelte's fine-grained reactivity may batch them as two separate notifications.

This is addressed by Fix 1 (debounce) in the main analysis, but confirms that the reactor is a 2x multiplier on top of the per-keystroke amplification.

## Implementation Plan

### Fix A: Guard `lint_service.start()` against permanent failure

**File:** `src/lib/features/lint/application/lint_service.ts`

Track the last failure and the config that caused it. Skip `start()` if the same config would hit the same broken binary.

```typescript
// In LintService class:
private failed_config_key: string | null = null;

async start(vault_id: string, vault_path: string, user_overrides: string, browse_mode: boolean) {
  const config_key = `${vault_id}:${vault_path}:${browse_mode}`;
  if (this.failed_config_key === config_key) {
    return; // Already permanently failed for this config
  }

  try {
    await this.port.start(/* ... existing args ... */);
    this.failed_config_key = null;
  } catch (error) {
    log.from_error("Failed to start lint", error);
    this.failed_config_key = config_key;
  }
}
```

The key resets when `user_overrides` changes (different `config_key`) or on a manual retry, so a binary fix + settings change will re-attempt.

**Risk:** Low. Only suppresses retries for the exact same config that already failed. Changing any setting clears the guard.

### Fix B: Filter directory events in watcher reactor

**File:** The watcher reactor or the Rust watcher service that emits events.

Two options:

**Option 1 — Rust side (preferred):** In the fsevents handler, check `event.paths` and skip entries that are directories (via `metadata().is_dir()`) or empty strings. This prevents the events from crossing the IPC boundary at all.

**Option 2 — Frontend side:** In the `watcher_reactor`, filter out events where `path` is empty or has no file extension (heuristic for directories). Less reliable but simpler.

**Risk:** Low. Directory events carry no useful information for the reactor since it only cares about file content changes.

### Fix C (optional): Coalesce reactor trigger for `update_find_state`

**File:** `src/lib/features/search/application/find_in_file_actions.ts`

The `update_find_state({ query, selected_match_index: 0 })` call updates two reactive properties, potentially causing the reactor to fire twice. Using Svelte's `batch()` or `untrack()` for the `selected_match_index` reset would ensure a single reactor cycle per keystroke.

This is largely mooted by Fix 1 (debounce) from the main analysis, but is a correctness improvement regardless.

**Risk:** Very low.

## Implementation Order

1. **Fix A** (LSP retry guard) — standalone, no interaction with find-in-file fixes
2. **Fix B** (watcher directory filter) — standalone, reduces noise
3. **Fix C** (coalesce reactor) — optional, only if Fix 1 debounce doesn't fully solve the dual-fire

Fixes A and B are independent of the four fixes in the main analysis and can be implemented in parallel.

---

## Implementation Progress

### Fix A: LSP retry guard — DONE

**Commit:** `fix/lsp-retry-watcher-noise` branch

**Changes in `src/lib/features/lint/application/lint_service.ts`:**
- Added `private failed_config_key: string | null = null` to `LintService`
- `start()` computes `config_key` from `vault_id:vault_path:user_overrides:browse_mode` and early-returns if it matches a previously failed config
- On `port.start()` success: clears `failed_config_key`
- On `port.start()` failure: stores the failing `config_key`
- Added public `clear_failure()` method for manual retry escape hatch

**Deviation from plan:** Config key includes `user_overrides` (plan omitted it), so changing lint rules TOML also clears the guard.

**Tests:** `tests/unit/services/lint_service.test.ts` — 4 tests covering: same-config suppression, different-config retry, success clears guard, `clear_failure()` escape hatch.

### Fix B: Filter directory events in Rust watcher — DONE

**Changes in `src-tauri/src/features/watcher/service.rs`:**

1. **`classify_event`:** Added `_ if is_dir => None` catch-all after the Create/Remove directory arms. This prevents `Modify` events on directories from being misclassified as `AssetChanged`. Previously, macOS fsevents `Modify` on parent directories passed through the final `EventKind::Modify(_) => AssetChanged` arm.

2. **Event loop:** Added `if rel.is_empty() { continue; }` after `rel_path()` to filter root-level fsevents notifications (the `path=` empty events from the logs).

**Tests:** 5 Rust unit tests in `features::watcher::service::tests` covering: modify-on-dir filtered, modify-on-file → AssetChanged, modify-on-markdown → NoteChangedExternally, create-dir → FolderCreated, remove-dir → FolderRemoved.

### Fix C: Coalesce reactor trigger — NOT NEEDED

**Assessment:** `update_query()` in `find_in_file_actions.ts` already sets both `query` and `selected_match_index: 0` via a single `update_find_state()` call that performs imperative property assignments on the same `$state` object. Svelte 5's fine-grained reactivity batches synchronous mutations to the same state proxy into a single reactive notification. Combined with the 100ms debounce timer (from the main memory leak fix), the dual-fire scenario is already mitigated. No code change needed.

### Verification

- `pnpm check` — 0 errors
- `pnpm lint` — only pre-existing layering violations (unrelated)
- `pnpm test` — 2735/2736 passed (1 pre-existing failure in `document_service.test.ts`)
- `cargo test` — 5/5 new watcher tests passed
- `cargo check` — clean
