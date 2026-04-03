# Memory & State Management Review

Date: 2026-03-26
Scope: full frontend and backend codebase
Method: static code review across all services, stores, reactors, components, and Rust backend (multi-agent parallel audit)

## Executive summary

I found 11 priority issues across 4 categories.

1. 4 confirmed high severity: async state races in canvas, bases, and lint services, plus Rust Mutex held across await.
2. 4 confirmed medium severity: document service staleness, canvas store provider leak, terminal event listener leak, git store cache growth.
3. 3 low severity suspects: vault_ignore cache, excalidraw timers, citation picker stale writes.

The codebase is broadly healthy — most services use revision guards, most components clean up observers and timers, and the Rust backend has proper resource lifecycle management. The issues below are the gaps.

## Prioritized findings

### 1) High, confirmed

Category: State management bug
Title: `canvas_service.open_canvas` has no staleness guard after async load

Impact:
Rapid canvas tab switches can apply stale parse results from an older file to a newer tab's state.

Evidence:

1. `open_canvas` writes to `canvas_store` after `Promise.all([read_file, read_camera])` with no revision or tab_id freshness check at `src/lib/features/canvas/application/canvas_service.ts:37-62`.
2. Unlike `GraphService` (neighborhood/vault/semantic load revisions), `LinksService` (active_revision), and `SearchService` (active_search_revision), `CanvasService` has zero revision tracking.

Reproduction:

1. Open canvas A in a tab.
2. Before A finishes loading, switch to canvas B in same tab.
3. If A resolves last, its data overwrites B's state.

Fix direction:
Add a load revision counter similar to `GraphService`. Check `tab_id` freshness and revision after the await boundary before writing to the store.

### 2) High, confirmed

Category: State management bug
Title: `bases_service` methods have no vault context check after async boundaries

Impact:
After vault switch, stale query results, properties, or view data from the previous vault can be written to the store.

Evidence:

1. `run_query` writes `store.set_results(results)` after `await this.port.query(vault_id, q)` with no vault freshness check at `src/lib/features/bases/application/bases_service.ts:20-32`.
2. `refresh_properties` writes `store.available_properties` after await with no guard at `src/lib/features/bases/application/bases_service.ts:11-17`.
3. `load_view` performs two sequential awaits and writes to store without any staleness check at `src/lib/features/bases/application/bases_service.ts:47-60`.

Reproduction:

1. Open vault A with bases view.
2. Switch to vault B while query is in flight.
3. Vault A's results overwrite vault B's store.

Fix direction:
Add a vault_id freshness check after each await, or add a revision counter to `BasesService`.

### 3) High, confirmed

Category: State management bug
Title: Lint reactor format callback can write to stale note after tab switch

Impact:
If the user saves and immediately switches notes, the format-on-save callback can write formatted content to the wrong note, then trigger a save of the wrong content.

Evidence:

1. `lint.reactor.svelte.ts:71-83` captures `note_id` and `path` before the async `format_file` call.
2. The `.then()` callback writes `editor_store.set_markdown(note_id, ...)` and calls `note_service.save_note()` without verifying the current open note is still the same.
3. No generation guard or open_note freshness check exists in the callback.

Reproduction:

1. Enable format-on-save.
2. Save note A, then quickly switch to note B.
3. Format completes for A and writes A's formatted content, then triggers save — potentially corrupting state.

Fix direction:
Check `editor_store.open_note?.meta.id === note_id` after the `.then()` resolves before writing.

### 4) High, confirmed

Category: Resource contention (Rust)
Title: `code_lsp` Tokio Mutex held across `.await` boundaries

Impact:
All code-LSP operations serialize behind a single Mutex lock. Long-running LSP operations (open_file, close_file) block all other vaults' LSP operations.

Evidence:

1. `code_lsp_open_file` acquires `state.inner.lock().await` at line 29 and holds it through `mgr.open_file(&path, &content).await` at line 35 in `src-tauri/src/features/code_lsp/mod.rs`.
2. Same pattern for `code_lsp_close_file` (lines 45-48) and `code_lsp_stop_vault` (lines 58-62).
3. All three commands share the same lock, so any slow LSP call blocks the others.

Fix direction:
Clone the manager reference or extract it from the map, then release the lock before calling `.await` on the manager methods. Or use per-vault locks.

### 5) Medium, confirmed

Category: State management bug
Title: `document_service.ensure_content` lacks staleness guard after async read

Impact:
When a tab is closed and reopened with a different file quickly, the older `read_file` could resolve last and write wrong content to the new tab's state.

Evidence:

1. `ensure_content` sets status to "loading" then writes "ready" after `await read_file` with no generation check at `src/lib/features/document/application/document_service.ts:92-120`.
2. No revision counter exists on `DocumentService`.

Fix direction:
Check that the viewer_state for the tab_id still matches the expected file_path after the await, or add a load generation per tab_id.

### 6) Medium, confirmed

Category: Memory leak
Title: `canvas_store.remove_state` does not clean up scene/SVG export providers

Impact:
If `remove_state` is called without the component's `$effect` cleanup running first, the `#scene_providers` and `#svg_export_providers` Maps retain stale closures.

Evidence:

1. `remove_state` only deletes from `this.states` at `src/lib/features/canvas/state/canvas_store.svelte.ts:69-73`.
2. `#scene_providers` and `#svg_export_providers` are not cleaned in `remove_state`.

Fix direction:
Have `remove_state` also call `this.#scene_providers.delete(tab_id)` and `this.#svg_export_providers.delete(tab_id)`.

### 7) Medium, confirmed

Category: Memory leak
Title: Terminal session focus/blur event listeners never removed

Impact:
Event listeners on `terminal.textarea` for focus and blur are added in `init_terminal()` but never removed in `cleanup()`. The terminal is disposed, but the textarea DOM node's listeners are not explicitly removed.

Evidence:

1. `addEventListener("focus", ...)` and `addEventListener("blur", ...)` at `src/lib/features/terminal/ui/terminal_session_view.svelte:247-254`.
2. `cleanup()` at lines 276-289 disconnects ResizeObserver and disposes terminal, but does not call `removeEventListener` for focus/blur.
3. Anonymous arrow functions are used, making removal impossible without storing references.

Fix direction:
Store named handler references and call `removeEventListener` in `cleanup()`.

### 8) Medium, confirmed

Category: Memory / unbounded growth
Title: Git store `history_cache` grows without eviction

Impact:
Each note's git history is cached without size limits. Users who view history for many notes accumulate entries indefinitely.

Evidence:

1. `history_cache` is a `Map<string, {commits, note_path, limit, has_more}>` at `src/lib/features/git/state/git_store.svelte.ts:32-40`.
2. Entries are added via `set_history()` but only cleared on `set_status()` or explicit invalidation.
3. No LRU eviction despite the existing `LruCache` utility in `src/lib/shared/utils/lru_cache.ts`.

Fix direction:
Replace `Map` with `LruCache` capped at 10-20 entries.

### 9) Low, suspect

Category: Efficiency / minor leak
Title: `vault_ignore` MATCHER_CACHE grows without eviction of removed vaults

Impact:
Each vault root path gets a cached matcher entry that persists until process exit. Minimal per-entry impact.

Evidence:
Entries inserted with TTL check for freshness but never evicted for removed vaults at `src-tauri/src/shared/vault_ignore.rs:78-109`.

Fix direction:
Add eviction of the cache entry when a vault is removed, or cap cache size.

### 10) Low, suspect

Category: State management
Title: `excalidraw_host.get_scene` timeout timer is not cancelled on fast resolution

Evidence:
`get_scene` creates a 3s timeout and `export_svg` creates a 5s timeout with no `clearTimeout` at `src/lib/features/canvas/ui/excalidraw_host.svelte:84-106`.

Fix direction:
Track the timer handle and clear it when the main response arrives.

### 11) Low, suspect

Category: State management
Title: `citation_picker` debounce callback can write to state after component unmount

Evidence:
The async body inside the debounce timer (`await action_registry.execute(...)`) can still be in flight when `onDestroy` clears the timer at `src/lib/features/reference/ui/citation_picker.svelte:38-106`.

Fix direction:
Add a `destroyed` flag checked after each `await` in the timer callback.

## What is currently healthy

1. **Services with revision guards**: `GraphService`, `LinksService`, `SearchService`, `VaultService`, `EditorService` all use monotonically increasing revisions and staleness checks.
2. **Reactor cleanup**: All `$effect.root()` returns are properly captured and called. Tauri `listen()` unlisten patterns are correct with `cancelled` flag for race-safe cleanup in marksman, menu_action, file_open, and embedding_model_loaded reactors.
3. **Observer/timer cleanup in components**: `tab_bar`, `outline_panel`, `graph_panel`, `graph_tab_view`, `canvas_viewer`, `sandboxed_iframe`, `plugin_iframe_host`, `source_editor_content`, `editor_status_bar`, `code_viewer`, `sonner` all have proper cleanup.
4. **Rust backend lifecycle**: `SearchDbState` has `Drop` impl for worker shutdown. `BufferManager` has `close_buffer`. Watcher and plugin watcher have proper stop/cleanup.
5. **Document eviction**: `DocumentService` has `evict_inactive_content` with configurable limit and LRU-like eviction.
6. **PDF viewer**: Load revision guard and destroy-on-switch were fixed in the prior commit.
7. **Bounded stores**: `LogStore` (500 entries), `QueryStore.history` (20 items), `TabStore.closed_tab_history` (10 items) all properly capped.

## Recommended next actions

1. Fix findings 1-3 together — add revision guards to `CanvasService`, `BasesService`, and lint reactor.
2. Fix finding 4 — restructure `code_lsp` Mutex usage to release lock before awaiting LSP operations.
3. Fix findings 5-6 — add file_path freshness check in `DocumentService.ensure_content` and clean providers in `canvas_store.remove_state`.
4. Fix findings 7-8 — store terminal listener refs for cleanup; replace git history_cache with LruCache.
5. Address findings 9-11 opportunistically.

## Confidence legend

1. Confirmed: directly supported by current source and control flow.
2. Suspect: likely but lower practical impact or needs runtime profiling to quantify.
