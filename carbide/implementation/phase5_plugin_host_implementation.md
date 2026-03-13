# Phase 5 Implementation: Native Plugin Host

This document turns `carbide/plugin_system.md` into an implementation plan that fits the current Otterly architecture.

## Source of truth

Use `carbide/plugin_system.md` as the security and API source of truth.

This document answers a narrower question:

- how to integrate that design into the existing Carbide codebase without breaking architecture boundaries

## Hard rules

- plugins never call raw Tauri `invoke()`
- plugins never get PTY access
- plugins never get arbitrary shell or pipeline execution
- plugin APIs are host-owned and permission-gated
- host contribution points remain explicit and bounded

## Lokus anti-donors

Study these only as warnings:

- `src/plugins/PluginManager.js`
- `src/plugins/api/PluginApiManager.js`
- `src/plugins/runtime/PluginRuntime.js`
- `src/plugins/core/PluginManifest.js`

Useful takeaways from Lokus:

- manifest vocabulary
- contribution categories
- plugin manager UX ideas

Do not reuse:

- dynamic import plus direct runtime execution model
- direct `invoke()` backed plugin APIs
- dangerous permissions like `execute_commands` or `all`

## Required integration points

### Frontend

Create a plugin slice:

- `src/lib/features/plugin/ports.ts`
- `src/lib/features/plugin/state/plugin_store.svelte.ts`
- `src/lib/features/plugin/application/plugin_service.ts`
- `src/lib/features/plugin/application/plugin_actions.ts`
- `src/lib/features/plugin/adapters/plugin_host_adapter.ts`
- `src/lib/features/plugin/ui/plugin_manager.svelte`
- `src/lib/features/plugin/ui/plugin_permissions_dialog.svelte`
- `src/lib/features/plugin/index.ts`

Update composition root:

- `src/lib/app/bootstrap/create_app_stores.ts`
- `src/lib/app/di/app_ports.ts`
- `src/lib/app/create_prod_ports.ts`
- `src/lib/app/di/create_app_context.ts`

### Backend

Add a Rust feature:

- `src-tauri/src/features/plugin/mod.rs`
- `src-tauri/src/features/plugin/service.rs`
- `src-tauri/src/features/plugin/types.rs`

Register it in:

- `src-tauri/src/features/mod.rs`
- `src-tauri/src/app/mod.rs`

## Contribution registries come first

Before loading external plugins, make the host runtime-extensible in app-owned code.

### 1. Commands

Current seam:

- `src/lib/features/search/domain/search_commands.ts`

Needed change:

- extract command definitions into a registry that supports host-owned dynamic contributions
- built-in commands remain static entries registered by the host
- plugins contribute through the plugin host, not by mutating command lists directly

### 2. Status bar

Current seam:

- `src/lib/features/editor/ui/editor_status_bar.svelte`
- `src/lib/features/git/ui/git_status_widget.svelte`

Needed change:

- introduce a host-owned status bar contribution collection
- built-in widgets and plugin widgets both render through the same host-owned mechanism

### 3. Sidebar or panel slots

Current seam:

- `src/lib/app/bootstrap/ui/workspace_layout.svelte`

Needed change:

- define explicit panel slots for plugin-contributed panels
- panels render through host-owned wrappers, not direct DOM control by plugins

## Implementation order

### Milestone 1: Host registries with no external plugins yet

Ship:

- dynamic command contribution registry
- dynamic status bar registry
- explicit sidebar or panel contribution registry

This validates the host surface before introducing external code.

### Milestone 2: Discovery and manifest validation

Ship:

- vault-local plugin discovery under `.carbide/plugins`
- manifest parsing and validation
- enable or disable state
- runtime status tracking in `PluginStore`

No plugin code execution yet if the host surface is not ready.

### Milestone 3: Iframe host and RPC

Ship:

- sandboxed iframe host
- typed `postMessage` RPC bridge
- permission checks for every plugin API call
- plugin lifecycle management

### Milestone 4: Minimal useful API surface

Start with:

- commands
- status bar items
- sidebar panels
- limited editor insertion or selection operations
- vault read operations
- carefully scoped metadata read operations

Defer broad write operations until read-only and bounded UI contributions are stable.

### Milestone 5: Demo plugins and failure containment

Ship:

- Hello World command plugin
- Word Count status bar plugin
- one editor utility plugin that exercises the limited editor API safely

Also ship:

- per-plugin runtime error reporting
- disable-on-failure behavior
- clean unload behavior

## Security implementation checklist

For every plugin API call, define:

1. requested capability
2. manifest permission required
3. host-side validation
4. data returned
5. failure mode
6. cleanup behavior on unload

If any API cannot be expressed that way, it is not ready to ship.

## Tests

- manifest validation tests
- permission check tests
- iframe RPC bridge tests
- contribution registry cleanup tests
- plugin crash isolation tests
- demo plugin integration tests

## Definition of done

This phase is done when:

- host-owned contribution registries exist
- plugins run inside a bounded iframe host
- plugin APIs are permission-gated and host-mediated
- no plugin can reach raw `invoke()`, PTY sessions, or shell execution
