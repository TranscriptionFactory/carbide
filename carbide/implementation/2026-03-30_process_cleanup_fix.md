# Process Cleanup on App Close

**Date:** 2026-03-30
**Status:** Implemented

## Problem

When Carbide closes, spawned child processes (LSP servers, terminal PTY sessions, file watchers) may not be properly cleaned up, leading to orphaned processes.

## Analysis

### Current cleanup path

1. `+page.svelte` uses Svelte `onDestroy(() => app.destroy())` to trigger cleanup
2. `app.destroy()` calls `stop()` on each service (marksman, code_lsp, lint, watcher, terminal, plugins)
3. On the Rust side, LSP child processes use `kill_on_drop(true)` as a safety net

### Identified leaks

| Issue                              | Severity | Detail                                                                                                                                                                       |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No `RunEvent::Exit` handler**    | High     | `app/mod.rs` `.run()` callback only handles `RunEvent::Opened`. No Rust-side cleanup runs on app close.                                                                      |
| **Svelte `onDestroy` unreliable**  | High     | When a Tauri window closes, the webview is torn down. Svelte's `onDestroy` may not fire, so `app.destroy()` never runs.                                                      |
| **Fire-and-forget async cleanup**  | Medium   | `destroy()` uses `void` for async stops (`watcher_service.stop()`, `marksman_service.stop()`, `lint_service.stop()`). Even if called, these may not complete before exit.    |
| **Pipeline has no `kill_on_drop`** | Low      | `pipeline/service.rs` uses `std::process::Command` (blocking). No `kill_on_drop`. If app exits mid-pipeline, child is orphaned. Pipeline is short-lived though, so low risk. |
| **Terminal PTY cleanup**           | Medium   | Depends entirely on `tauri-plugin-pty` plugin cleanup. If the plugin doesn't kill PTY children on drop, shells survive app close.                                            |

### What already works

- LSP processes (`transport.rs:154`): `kill_on_drop(true)` — if tokio runtime drops the `Child`, the process is killed
- `SearchDbState`: has `impl Drop` that shuts down workers
- Lint/Marksman/CodeLsp all use `RestartableLspClient` → `LspClient` → `kill_on_drop(true)` chain

### Why `kill_on_drop` alone is insufficient

`kill_on_drop(true)` sends SIGKILL when the tokio `Child` is dropped. But:

1. The `Child` is held inside an async task spawned by `LspClient::start()`. That task is joined via `join_handle` in `stop()`. If `stop()` is never called, the task keeps running until the tokio runtime shuts down.
2. During a hard process exit, tokio may not run destructors for all tasks — especially tasks blocked on I/O.
3. The `RestartableLspClient` holds the `LspClient` inside another spawned task. Two levels of indirection.

## Implementation Plan

### 1. Add `RunEvent::Exit` handler (Rust side)

In `app/mod.rs`, handle `RunEvent::Exit` to explicitly stop all services:

```rust
tauri::RunEvent::Exit => {
    let app = app.clone();
    tauri::async_runtime::block_on(async {
        // Stop all marksman LSP clients
        let marksman = app.state::<MarksmanState>();
        for (_, client) in marksman.clients.lock().await.drain() {
            client.stop().await;
        }
        // Stop all code LSP managers
        let code_lsp = app.state::<CodeLspState>();
        for (_, mgr) in code_lsp.inner.lock().await.drain() {
            mgr.lock().await.stop_all().await;
        }
        // Stop all lint sessions
        let lint = app.state::<LintState>();
        for (_, session) in lint.inner.lock().await.drain() {
            session.client.stop().await;
        }
        // Stop file watcher (sync, uses std::sync::Mutex)
        // Already handled by WatcherState going out of scope + thread join
    });
}
```

This is the **primary fix**. It ensures Rust-side process cleanup happens regardless of whether the frontend ran its cleanup.

### 2. Add `beforeunload` / close-requested listener (Frontend side)

Add a Tauri `close-requested` event listener so `app.destroy()` runs before the window closes, giving the frontend a chance to clean up terminal PTY sessions and unsubscribe from events.

## Changes Made

### Rust — `shutdown()` methods on managed state structs

Each state struct now exposes a `pub shutdown()` method that drains all active sessions/clients:

- `MarksmanState::shutdown()` — `src-tauri/src/features/marksman/service.rs`
- `CodeLspState::shutdown()` — `src-tauri/src/features/code_lsp/mod.rs`
- `LintState::shutdown()` — `src-tauri/src/features/lint/service.rs`
- `WatcherState::shutdown()` — `src-tauri/src/features/watcher/service.rs`

### Rust — `RunEvent::Exit` handler

`src-tauri/src/app/mod.rs` — new `shutdown_managed_processes()` async fn called from a `RunEvent::Exit` match arm. Uses `tauri::async_runtime::block_on` to ensure all LSP processes are stopped before the Rust process exits.

### Frontend — `onCloseRequested` listener

`src/routes/+page.svelte` — registers a Tauri `onCloseRequested` handler that calls `app.destroy()` before the window closes. A `destroyed` guard prevents double-cleanup with the existing `onDestroy` fallback.

## Cleanup chain (after fix)

```
Window close requested
  → [Frontend] onCloseRequested fires → app.destroy()
    → terminal_service.destroy() kills PTY sessions
    → marksman/lint/code_lsp service.stop() via IPC
  → [Tauri] Window closes, webview torn down
  → [Tauri] RunEvent::Exit fires
    → shutdown_managed_processes() blocks on:
      → MarksmanState::shutdown() — drains & stops all LSP clients
      → CodeLspState::shutdown() — drains & stops all LSP managers
      → LintState::shutdown() — drains & stops all lint sessions
      → WatcherState::shutdown() — signals & joins watcher thread
  → [Tauri] Process exits
    → kill_on_drop(true) catches any stragglers
    → SearchDbState::Drop shuts down DB workers
```

## Scope

- **In scope:** Rust-side exit handler, frontend close-requested listener
- **Out of scope:** Pipeline `kill_on_drop` (short-lived, low risk), PTY plugin internals (third-party)
