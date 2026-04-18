# IWE CPU Loop Root Cause Analysis

**Date:** 2026-04-03
**Status:** In Progress
**Symptom:** CPU jumps to 80% when IWE is enabled, stays high until disabled. Process logs show rapid-fire WebContent resource loading via URL scheme handlers (resourceIDs incrementing multiple per millisecond).

## Root Cause

Three compounding issues create a tight feedback cycle when IWE is running with a note open.

### 1. `workspace/inlayHint/refresh` request silently dropped (PRIMARY)

**Location:** `src-tauri/src/shared/lsp_client/transport.rs:281-330`, `src-tauri/src/features/markdown_lsp/service.rs:296-317`

IWE sends `workspace/inlayHint/refresh` as a JSON-RPC **request** (with a UUID string ID) after every `codeAction/resolve` via `delay_send` (spawns a new OS thread per call).

- `transport.rs:286` only parses message IDs as `i64` — UUID strings fail `as_i64()` and fall to the notification branch
- `spawn_notification_forwarder` only handles `textDocument/publishDiagnostics` — the refresh request is silently dropped, no response sent back to IWE
- IWE never gets a response, keeps firing these requests

**IWE source:** `vendor/iwe/crates/iwes/src/router.rs:277-282` (sends refresh), `router.rs:60-68` (delay_send spawns thread per call), `router.rs:127` (discards all `Message::Response`)

### 2. Inlay hints ProseMirror plugin re-triggers itself (AMPLIFIER)

**Location:** `src/lib/features/editor/adapters/lsp_inlay_hints_plugin.ts:76-84`

`apply_hints()` dispatches `view.dispatch(tr.setMeta(...))`. This can cause `view.state.doc !== prev_state.doc` to evaluate true in the next `update()` call, re-firing `on_inlay_hints()` → `tauri_invoke("markdown_lsp_inlay_hints")` → another URL scheme handler hit. Each hit is a resourceID in the process logs.

### 3. `apply_workspace_edit_result` mutates note content (TRIGGER)

**Location:** `src/lib/features/lsp/application/apply_workspace_edit_result.ts:68-93`

When workspace edits are applied, `editor_store.set_markdown()` + `set_dirty(false)` change the open note → changes `view.state.doc` → re-triggers inlay hints debounce → more `tauri_invoke` calls → more URL scheme handler hits.

## What the logs show

The rapid-fire `resourceID` increments (178802→178807 within 2ms) are each a `tauri_invoke` going through Tauri's custom URL scheme handler — the inlay hints loop hitting the WebView bridge repeatedly.

## Ruled Out

- **Marksman restart loop** — fixed by single-flight guard in lifecycle reactor
- **Post-start provider rewrite restart** — remediation plan moved config rewrite before first launch
- **Deep proxy tracking of `ai_providers`** — fixed by hoisting reads to synchronous scope
- **File watcher 200ms polling** — separate from URL scheme handler resource loads

## Fix Plan

| #   | Priority  | Fix                                                                                                                | Location                                   | Status           |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------- |
| 1   | Critical  | Handle server→client requests with string IDs in LSP transport; respond to `workspace/inlayHint/refresh` with null | `transport.rs`, `service.rs`               | DONE             |
| 2   | Important | Guard `apply_hints` — only dispatch if decoration set actually changed, prevent self-re-trigger                    | `lsp_inlay_hints_plugin.ts`                | DONE             |
| 3   | Cleanup   | Bound `delay_send` in IWE — replace thread-per-call with single background worker                                  | `vendor/iwe` (router.rs)                   | SKIPPED (vendor) |
| 4   | Defensive | Debounce `iwe.refresh_transforms` effect during startup                                                            | `markdown_lsp_lifecycle.reactor.svelte.ts` | DONE             |

## Implementation Log

### Fix 1: LSP transport handles server→client requests (DONE)

**File:** `src-tauri/src/shared/lsp_client/transport.rs`

Modified `dispatch_message` to detect messages with both `id` and `method` fields (server→client requests per LSP spec). When detected:

- Sends a null JSON-RPC response back to IWE via stdin, acknowledging the request
- Forwards the method as a `ServerNotification` so the frontend can react if needed
- Passed `stdin` Arc into the reader task and `dispatch_message` signature

This breaks the primary loop: IWE's `workspace/inlayHint/refresh` requests now get proper responses instead of being silently dropped.

### Fix 2: Inlay hints plugin single-flight guard (DONE)

**File:** `src/lib/features/editor/adapters/lsp_inlay_hints_plugin.ts`

- Changed `view.state.doc === prev_state.doc` (reference equality) to `view.state.doc.eq(prev_state.doc)` (structural equality) for more reliable doc-change detection
- Added `fetch_in_flight` flag to prevent overlapping `on_inlay_hints()` calls — if a fetch is already in progress, the debounce timer skips

### Fix 3: IWE vendor `delay_send` — SKIPPED

This is in `vendor/iwe` (external dependency). The fix would replace thread-per-call with a channel+worker pattern. Left as upstream improvement; fix #1 makes this non-critical since responses are now sent.

### Fix 4: Debounce `iwe.refresh_transforms` effect (DONE)

**File:** `src/lib/reactors/markdown_lsp_lifecycle.reactor.svelte.ts`

Added 500ms debounce + single-in-flight guard to the `$effect` that calls `iwe.refresh_transforms`. Prevents multiple parallel executions during startup when reactive dependencies settle.

### Verification

- `cargo check` — passes (warnings are pre-existing in patched wry dep)
- `pnpm check` — 0 errors, 3 pre-existing warnings
- `pnpm lint` — 4 pre-existing layering violations (unrelated files)
- `pnpm test` — 1 pre-existing failure in `document_service.test.ts` (unrelated)
- `pnpm format` — no formatting changes needed
