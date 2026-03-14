# Phase 5b Implementation: Plugin Lifecycle, SDK, and Hot-Reload

Implements Phase 1b from `carbide/plugin_system.md`. Builds on the Phase 1a foundation (iframe sandbox, RPC dispatcher, contribution registries, demo plugins).

## Source of truth

- `carbide/plugin_system.md` — security model, API surface, architecture
- `carbide/implementation/phase5_plugin_host_implementation.md` — Phase 1a integration plan

## Scope

1. Proper load/unload lifecycle in `PluginHostAdapter`
2. Plugin state persistence across sessions
3. TypeScript SDK (`carbide-plugin-api.js`)
4. Hot-reload in dev mode
5. LaTeX Snippets demo plugin
6. Update existing demos to use SDK

## Prerequisites

All Phase 1a artifacts are landed and working:

- `src/lib/features/plugin/` — full frontend feature module
- `src-tauri/src/features/plugin/` — backend discovery + manifest parsing
- `src-tauri/src/shared/storage.rs` — `badgerly-plugin://` URI scheme handler
- `.carbide/plugins/hello-world/` and `.carbide/plugins/word-count/` — demo plugins
- Composition root wiring complete in `create_app_stores.ts`, `app_ports.ts`, `create_prod_ports.ts`, `create_app_context.ts`

## Implementation order

### 1. Backend load/unload commands

**Why first:** The frontend adapter stubs depend on backend commands existing. Everything else builds on a working lifecycle.

**Files:**

| File | Change |
|------|--------|
| `src-tauri/src/features/plugin/service.rs` | Add `validate_plugin(vault_path, id) -> Result<PluginInfo>` — confirms manifest exists and is parseable |
| `src-tauri/src/features/plugin/mod.rs` | Add `plugin_load(vault_path, plugin_id)` and `plugin_unload(plugin_id)` Tauri commands |
| `src-tauri/src/app/mod.rs` | Register new commands in `.invoke_handler()` |

**Design:**

`plugin_load` validates the plugin is loadable (manifest exists, parses, required fields present). It does not manage iframe state — that's frontend-only. The command returns `PluginInfo` on success.

`plugin_unload` is a no-op on the backend today but establishes the contract. Future use: cleanup caches, revoke tokens, persist plugin state.

### 2. Frontend adapter + iframe lifecycle

**Files:**

| File | Change |
|------|--------|
| `src/lib/features/plugin/adapters/plugin_host_adapter.ts` | `load()` calls `plugin_load` Tauri command; `unload()` calls `plugin_unload` |
| `src/lib/features/plugin/ui/plugin_iframe_host.svelte` | Send `lifecycle.activate` on mount, `lifecycle.deactivate` before teardown via `$effect` cleanup |
| `src/lib/features/plugin/ports.ts` | Update `PluginHostPort.load` signature to accept `vault_path` + return `PluginInfo` |

**Lifecycle messages:**

The host sends structured messages to plugin iframes at lifecycle boundaries:

```
mount:    host → iframe  { method: "lifecycle.activate", params: [] }
unmount:  host → iframe  { method: "lifecycle.deactivate", params: [] }
```

Plugins using the SDK get `onload`/`onunload` callbacks. Plugins without the SDK can listen for these messages directly.

### 3. Plugin state persistence

**Pattern:** Follow `TabService` + `VaultSettingsPort` — the established persistence pattern in this codebase.

**Files:**

| File | Change |
|------|--------|
| `src/lib/features/plugin/application/plugin_service.ts` | Add `VaultSettingsPort` dependency. Add `persist_enabled_state()` and `restore_enabled_state()` methods. Call persist on enable/disable. Call restore during `discover()`. |
| `src/lib/features/plugin/ports.ts` | Add `PluginPersistencePort` interface (or accept `VaultSettingsPort` directly) |
| `src/lib/app/di/create_app_context.ts` | Pass vault settings port to `PluginService` constructor |

**Storage key:** `"plugin_enabled_ids"` → `string[]`

**Restore flow:**

```
app startup
  → vault opens
    → plugin.discover()
      → load persisted enabled IDs
      → for each enabled ID that was discovered: enable_plugin(id)
```

**Edge cases:**
- Plugin was enabled but no longer discovered (removed from disk) → skip, don't persist stale ID
- Plugin was enabled but manifest changed incompatibly → load will fail, error state shown in manager

### 4. TypeScript SDK (`carbide-plugin-api.js`)

**Delivery:** Embedded in the Rust URI handler via `include_str!()`. Served as a virtual same-origin file.

When a plugin requests `badgerly-plugin://<plugin-id>/carbide-plugin-api.js` and no such file exists on disk, the handler returns the embedded SDK. This requires no CSP changes (same origin) and no file copying.

**Files:**

| File | Change |
|------|--------|
| `src-tauri/src/features/plugin/sdk/carbide_plugin_api.js` | The SDK source file |
| `src-tauri/src/shared/storage.rs` | Update `handle_plugin_request` to serve SDK as virtual file fallback |

**SDK API surface:**

```js
// Lifecycle
carbide.onload(callback)
carbide.onunload(callback)

// Vault (requires fs:read / fs:write)
carbide.vault.read(path) → Promise<string>
carbide.vault.create(path, content) → Promise<void>
carbide.vault.modify(path, content) → Promise<void>
carbide.vault.delete(path) → Promise<void>
carbide.vault.list() → Promise<string[]>

// Editor (requires editor:read / editor:modify)
carbide.editor.getValue() → Promise<string>
carbide.editor.getSelection() → Promise<string>
carbide.editor.replaceSelection(text) → Promise<void>

// Commands (requires commands:register)
carbide.commands.register({ id, label, description?, keywords?, icon? })
carbide.commands.remove(id)

// UI (requires ui:statusbar / ui:panel)
carbide.ui.addStatusBarItem({ id, priority, initial_text }) → Promise<void>
carbide.ui.updateStatusBarItem(id, text) → Promise<void>
carbide.ui.removeStatusBarItem(id) → Promise<void>
carbide.ui.addSidebarPanel({ id, label, icon }) → Promise<void>
carbide.ui.removeSidebarPanel(id) → Promise<void>
```

**Implementation:** ~80 lines. A thin wrapper around the existing `postMessage` RPC bridge that both demo plugins already implement inline. The SDK extracts and types this pattern.

### 5. Hot-reload in dev mode

**Approach:** Piggyback on the existing `features::watcher` infrastructure. Add plugin-specific watch support.

**Files:**

| File | Change |
|------|--------|
| `src-tauri/src/features/plugin/mod.rs` | Add `plugin_watch_start(vault_path)` and `plugin_watch_stop()` commands |
| `src-tauri/src/features/plugin/service.rs` | Add watch state and notify-on-change logic scoped to `.carbide/plugins/` |
| `src/lib/features/plugin/application/plugin_service.ts` | Add `start_hot_reload()` / `stop_hot_reload()` that listen for backend events and trigger unload→discover→reload cycles |
| `src/lib/features/plugin/adapters/plugin_host_adapter.ts` | Add `watch` / `unwatch` port methods |
| `src/lib/features/plugin/ports.ts` | Add watch-related port interface |

**Dev mode gate:** Hot-reload only activates when `import.meta.env.DEV` is true. Production builds skip the watcher setup entirely.

**Reload flow:**

```
watcher detects change in .carbide/plugins/<id>/
  → backend emits "plugin:file-changed" event with plugin_id
    → frontend receives event
      → if plugin is active: unload → re-discover → re-enable
      → if plugin is not active: re-discover only (update manifest in store)
```

### 6. LaTeX Snippets demo plugin

**Files:**

| File | Change |
|------|--------|
| `.carbide/plugins/latex-snippets/manifest.json` | `permissions: ["editor:modify", "commands:register", "ui:panel"]` |
| `.carbide/plugins/latex-snippets/index.html` | Uses SDK. Registers command + sidebar panel with categorized snippets |

**Snippet categories:**
- Greek letters: `\alpha`, `\beta`, `\gamma`, `\theta`, `\lambda`, `\pi`, `\sigma`, `\omega`
- Operators: `\sum`, `\prod`, `\int`, `\lim`, `\infty`
- Structures: `\frac{}{}`, `\sqrt{}`, `\begin{align}...\end{align}`, `\begin{matrix}...\end{matrix}`

The plugin registers a command palette entry ("Insert LaTeX Snippet") and provides a sidebar panel with clickable snippet buttons. Both insert at cursor via `carbide.editor.replaceSelection()`.

### 7. Update existing demos to use SDK

Rewrite `hello-world/index.html` and `word-count/index.html` to use `<script src="carbide-plugin-api.js"></script>` instead of the inline RPC bridge. This validates the SDK works and serves as reference implementations.

## Tests

| Test file | Covers |
|-----------|--------|
| `tests/unit/services/plugin_service.test.ts` | Update: persistence (persist/restore), lifecycle integration, reload |
| `tests/unit/stores/plugin_store.test.ts` | Existing — no changes expected |
| `tests/unit/services/plugin_error_tracker.test.ts` | Existing — no changes expected |
| `tests/unit/services/plugin_rpc_handler.test.ts` | Existing — no changes expected |

New test scenarios:
- `enable_plugin` persists enabled state
- `disable_plugin` removes from persisted state
- `discover` restores previously enabled plugins
- `discover` skips stale IDs (plugin removed from disk)
- `load` calls backend validation
- `unload` cleans up contributions and resets error tracker (already tested, but verify with real adapter call)

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| SDK file embedding bloats binary | SDK is ~80 lines of JS; negligible |
| Hot-reload causes flicker/state loss | Reload preserves store state; only iframe is recycled |
| Persistence restores plugin that now crashes | Error tracker auto-disables after repeated failures; existing mechanism handles this |
| CSP blocks SDK script tag | SDK is same-origin (virtual file served from same `badgerly-plugin://<id>/` origin); no CSP change needed |

## Post-implementation

- Run `pnpm check`, `pnpm lint`, `pnpm test`, `cd src-tauri && cargo check`, `pnpm format`
- Update `carbide/plugin_system.md` "Current implementation status" section
- Update `carbide/FEATURES.md` if it tracks plugin milestones
