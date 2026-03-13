# Phase 1 Implementation: Terminal Hardening and Document Performance

This document covers the two phase 1 workstreams that extend already-landed features instead of pretending they do not exist:

- terminal hardening
- big-file and document performance

## Current state

### Terminal

Current terminal files:

- `src/lib/features/terminal/ui/terminal_panel.svelte`
- `src/lib/features/terminal/ui/terminal_panel_content.svelte`
- `src/lib/features/terminal/ui/build_terminal_spawn_options.ts`
- `src/lib/features/terminal/state/terminal_store.svelte.ts`
- `src/lib/features/terminal/application/terminal_actions.ts`

Current issue:

- PTY lifecycle is still owned directly in `terminal_panel_content.svelte` through `tauri-pty`
- `TerminalStore` only tracks open or closed and focus state
- the current design is good enough for a v1, but it does not meet the architecture bar for a durable multi-session terminal

### Document performance

Current document files:

- `src/lib/features/document/ports.ts`
- `src/lib/features/document/adapters/document_tauri_adapter.ts`
- `src/lib/features/document/application/document_service.ts`
- `src/lib/features/document/state/document_store.svelte.ts`
- `src/lib/features/document/ui/code_viewer.svelte`
- `src-tauri/src/shared/buffer.rs`
- `src-tauri/src/app/mod.rs`

Current strengths:

- `DocumentPort` already exposes `open_buffer`, `read_buffer_window`, and `close_buffer`
- `DocumentService` already owns buffer lifecycle for text and code documents
- Rust already has `ManagedBuffer` and `read_buffer_window`

Current gap:

- `CodeViewer.svelte` still needs true viewport-based virtualization and tuned windowing behavior for very large files

## Terminal target architecture

### Slice shape

Refactor terminal into a real slice with IO ownership outside the component.

Target frontend files:

- `src/lib/features/terminal/ports.ts`
- `src/lib/features/terminal/adapters/terminal_tauri_adapter.ts`
- `src/lib/features/terminal/application/terminal_service.ts`
- `src/lib/features/terminal/state/terminal_store.svelte.ts`
- `src/lib/features/terminal/application/terminal_actions.ts`
- `src/lib/features/terminal/ui/terminal_panel.svelte`
- `src/lib/features/terminal/ui/terminal_panel_content.svelte`

Composition-root touch points:

- `src/lib/app/di/app_ports.ts`
- `src/lib/app/create_prod_ports.ts`
- `src/lib/app/bootstrap/create_app_stores.ts`
- `src/lib/app/di/create_app_context.ts`

### State ownership

`TerminalStore` should own:

- `panel_open`
- `active_session_id`
- ordered session list
- persisted session layout metadata
- focus intent
- per-session cwd policy and respawn policy

The store must not own the PTY object itself.

### Service ownership

`TerminalService` should own:

- create session
- close session
- respawn session
- resize session
- switch active session
- reconcile sessions on vault switch
- apply theme and font updates to active terminal instances
- cleanup on app destroy

### Port ownership

`TerminalPort` should wrap the `tauri-pty` frontend plugin and expose typed operations such as:

- `spawn_session`
- `write_input`
- `resize_session`
- `kill_session`
- `subscribe_output`
- `subscribe_exit`

This keeps the implementation plugin-backed without letting a Svelte component own process lifecycle directly.

## Terminal milestone order

### Milestone 1: Architecture cleanup

- add `TerminalPort`
- add `TauriTerminalAdapter`
- add `TerminalService`
- move PTY spawn, resize, write, kill, and listener management out of the component
- keep the current single-session UI until the refactor is stable

### Milestone 2: Multi-session tabs

- change `TerminalStore` from a single open panel flag to session-aware state
- add session tabs
- persist active session and session ordering
- allow explicit close and respawn per session

### Milestone 3: Vault and theme correctness

- make vault switch behavior explicit
- define whether sessions follow the active vault automatically or remain pinned to their creation cwd
- reapply theme and font settings without restarting sessions
- ensure all exit and cleanup paths remove listeners deterministically

### Milestone 4: Tiling, only if the session model stays clean

- add tiling only after tabs and session lifecycle are stable
- tiling state must remain store-owned metadata, not component-owned process state

## Terminal explicit decisions

- Otterly's terminal stays the base
- do not import terminal execution or shell exposure patterns from Lokus
- plugins never get terminal access
- command execution remains a separate system from the terminal

## Document performance target architecture

### Existing ownership to preserve

Keep this ownership model:

- `DocumentService` owns buffer lifecycle
- `DocumentStore` owns viewer and content state
- `CodeViewer.svelte` owns only local viewport and render concerns
- Rust `ManagedBuffer` remains the source for large text window reads

### Changes to make

- keep `DocumentPort` as the IO seam
- extend `DocumentService` only if needed for better buffer prefetch or line-window tuning
- add viewport-aware line windowing in `CodeViewer.svelte`
- keep buffer eviction centralized in `DocumentService`
- do not move buffer state into random UI helpers

### CSV stance

Do not overbuild CSV yet.

- large plain text and code performance come first
- CSV table rendering only moves forward once the same virtualization path can support it cleanly

## Document performance milestone order

### Milestone 1: True code viewer virtualization

- drive rendered lines from viewport state
- request only the necessary line window from `read_buffer_window`
- avoid loading full file content into the browser for large text documents

### Milestone 2: Prefetch and smoothing

- add small prefetch windows ahead of and behind the viewport
- debounce or schedule window reads so rapid scroll does not thrash the bridge
- define cancellation or stale-read handling if window requests race

### Milestone 3: Large-file UX polish

- show line-count aware status where useful
- improve copy and selection behavior for large files
- define explicit fallback behavior for files too large for rich secondary handling

## Tests

### Terminal

- store tests for multi-session state transitions
- service tests for session lifecycle decisions
- adapter-level tests or mocks for spawn, kill, resize, output, and exit handling
- integration tests for vault switch behavior and cleanup

### Document performance

- unit tests for window range calculations
- document service tests for buffer open and close lifecycle
- integration tests for repeated scrolling without full-file reads
- regression tests for inactive buffer eviction

## Definition of done

Terminal hardening is done when:

- PTY lifecycle no longer lives directly in a component
- multi-session tabs work reliably
- vault switch behavior is deterministic
- theme and font updates reapply without restart
- process cleanup is test-covered

Big-file viewer work is done when:

- very large text or code files render without freezing the UI
- reads stay windowed
- memory stays effectively bounded during scrolling
- document buffer ownership remains centralized in `DocumentService`
