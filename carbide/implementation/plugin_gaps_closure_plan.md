# Implementation Plan: Close Plugin System Gaps

> Closes the remaining gaps between Carbide's plugin system and the target Obsidian-grade extensibility.

## Revised Gap Assessment

After auditing the actual codebase (not just the design docs), the gaps are narrower than initially thought:

| Area                     | Doc Says Missing | Actually Shipped                                                                                   | True Gap                                               |
| ------------------------ | ---------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Lifecycle load/unload    | Stubs            | `PluginHostAdapter.load()` calls `plugin_load` Tauri command; `unload()` calls `plugin_unload`     | **No gap** — adapter is wired                          |
| Lifecycle messages       | Not shipped      | `plugin_iframe_host.svelte` sends `lifecycle.activate` on mount, `lifecycle.deactivate` on cleanup | **No gap** — iframe lifecycle works                    |
| Vault write ops          | Deferred         | RPC handler has `vault.create`, `vault.modify`, `vault.delete` (permission-gated `fs:write`)       | **No gap** — read+write shipped                        |
| Hot-reload backend       | Not shipped      | `watcher.rs` with `watch_plugins`/`unwatch_plugins` Tauri commands + `plugin_fs_event` emission    | **Backend done**, frontend listener missing            |
| Search RPC               | Partial          | `search.fts` and `search.tags` (with `notes_for_tag` overload) shipped                             | **Partial** — bases/properties/backlinks/stats missing |
| TypeScript SDK           | Not shipped      | Demo plugins use inline `postMessage` RPC                                                          | **True gap**                                           |
| Plugin state persistence | Not shipped      | `PluginSettingsService` persists enable/disable per-plugin in `.carbide/plugin_settings.json`      | **No gap** — persistence works                         |
| LaTeX Snippets demo      | Not shipped      | —                                                                                                  | **True gap**                                           |
| Hot-reload frontend      | Not shipped      | Backend emits events, no frontend listener                                                         | **True gap**                                           |
| Metadata RPC namespace   | Not shipped      | Bases infrastructure exists (`BasesPort.query`, `BasesPort.list_properties`) but not wired to RPC  | **True gap**                                           |

## Actual Remaining Work

### Gap 1: TypeScript SDK (`carbide-plugin-api.js`)

### Gap 2: Frontend hot-reload listener

### Gap 3: Metadata RPC namespace (bases + backlinks + stats)

### Gap 4: LaTeX Snippets demo plugin

---

## Milestone 1: TypeScript SDK

**Why first:** Every subsequent milestone benefits from the SDK. Demo plugins become cleaner. New plugins can be authored faster.

**Approach:** Embed SDK JS in the Rust binary via `include_str!()`. Serve as a virtual file fallback when a plugin requests `carbide-plugin://<id>/carbide-plugin-api.js` and no such file exists on disk.

### 1a. SDK source file

**New file:** `src-tauri/src/features/plugin/sdk/carbide_plugin_api.js`

~80 lines. Thin wrapper over the existing `postMessage` RPC pattern that both demo plugins already implement inline:

```js
// Lifecycle
carbide.onload(callback)
carbide.onunload(callback)

// Vault (fs:read / fs:write)
carbide.vault.read(path)
carbide.vault.create(path, content)
carbide.vault.modify(path, content)
carbide.vault.delete(path)
carbide.vault.list()

// Editor (editor:read / editor:modify)
carbide.editor.getValue()
carbide.editor.getSelection()
carbide.editor.replaceSelection(text)

// Commands (commands:register)
carbide.commands.register({ id, label, description?, keywords?, icon? })
carbide.commands.remove(id)

// UI (ui:statusbar / ui:panel)
carbide.ui.addStatusBarItem({ id, priority, initial_text })
carbide.ui.updateStatusBarItem(id, text)
carbide.ui.removeStatusBarItem(id)
carbide.ui.addSidebarPanel({ id, label, icon })
carbide.ui.removeSidebarPanel(id)
carbide.ui.showNotice(message, duration?)

// Search (search:read)
carbide.search.fts(query, limit?)
carbide.search.tags(pattern?)

// Settings (settings:read)
carbide.settings.get(key)
carbide.settings.set(key, value)
carbide.settings.getAll()

// Events
carbide.events.on(event_type, callback_id)
carbide.events.off(callback_id)
```

### 1b. Virtual file serving

**Edit:** `src-tauri/src/shared/storage.rs`

In `handle_plugin_request`, before the 404 return: if `file_rel == "carbide-plugin-api.js"` and the file doesn't exist on disk, return the embedded SDK with `content-type: application/javascript`.

```rust
const EMBEDDED_SDK: &str = include_str!("../features/plugin/sdk/carbide_plugin_api.js");
```

### 1c. Update demo plugins to use SDK

Rewrite `hello-world/index.html` and `word-count/index.html` to use:

```html
<script src="carbide-plugin-api.js"></script>
```

Instead of their inline RPC bridge code. This validates the SDK and serves as reference implementations.

### 1d. Tests

- Unit test: SDK virtual file serving (Rust test in `src-tauri/tests/plugin_protocol.rs`)
- Verify demo plugins still function with SDK (manual or existing UI tests)

**Estimated scope:** ~150 lines new code, ~50 lines removed from demo plugins

---

## Milestone 2: Frontend Hot-Reload Listener

**Why second:** Backend watcher is done. Frontend just needs to listen for `plugin_fs_event` and trigger reload.

### 2a. Wire watcher start/stop

**Edit:** `src/lib/features/plugin/application/plugin_service.ts`

In `initialize_active_vault()`, after discover + activate, call `watch_plugins` Tauri command with vault path.
In `clear_active_vault()`, call `unwatch_plugins`.

Gate behind `import.meta.env.DEV` — production builds skip the watcher.

### 2b. Listen for change events

**Edit:** `src/lib/features/plugin/application/plugin_service.ts`

Register a Tauri event listener for `plugin_fs_event`. On `PluginChanged { plugin_id }`:

- If plugin is active: unload → re-discover → re-enable
- If plugin is not active: re-discover only (refresh manifest in store)

Debounce by 500ms to match the backend's 500ms debounce.

### 2c. Port interface

**Edit:** `src/lib/features/plugin/ports.ts`

Add to `PluginHostPort`:

```typescript
watch(vault_path: string): Promise<void>;
unwatch(): Promise<void>;
```

**Edit:** `src/lib/features/plugin/adapters/plugin_host_adapter.ts`

Implement via `invoke("watch_plugins", ...)` and `invoke("unwatch_plugins")`.

### 2d. Tests

- Unit test: `plugin_service.test.ts` — verify watch/unwatch called on vault open/close
- Unit test: reload cycle triggered on change event

**Estimated scope:** ~60 lines new code

---

## Milestone 3: Metadata RPC Namespace

**Why third:** Unlocks data-driven plugins (calendar, dataview-style tables, tag browsers). The query infrastructure exists; we just need to wire it through RPC.

### 3a. Extend RPC context type

**Edit:** `src/lib/features/plugin/application/plugin_rpc_handler.ts`

Add to `PluginRpcContext`:

```typescript
metadata?: PluginRpcMetadataBackend;
```

Where:

```typescript
type PluginRpcMetadataBackend = {
  query(query: BaseQuery): Promise<BaseQueryResults>;
  list_properties(): Promise<PropertyInfo[]>;
  get_backlinks(
    note_path: string,
  ): Promise<{ path: string; context: string }[]>;
  get_stats(note_path: string): Promise<NoteStats>;
};
```

### 3b. Implement `handle_metadata` in RPC handler

**Edit:** `src/lib/features/plugin/application/plugin_rpc_handler.ts`

Add `case "metadata"` to `dispatch()` switch. New private method:

| RPC Method                 | Permission      | Delegates To                                |
| -------------------------- | --------------- | ------------------------------------------- |
| `metadata.query`           | `metadata:read` | `context.metadata.query(params[0])`         |
| `metadata.list_properties` | `metadata:read` | `context.metadata.list_properties()`        |
| `metadata.get_backlinks`   | `metadata:read` | `context.metadata.get_backlinks(params[0])` |
| `metadata.get_stats`       | `metadata:read` | `context.metadata.get_stats(params[0])`     |

Note: `search.tags` and `search.fts` are already shipped — no need to duplicate in metadata namespace.

### 3c. Wire metadata backend in DI

**Edit:** `src/lib/app/di/create_app_context.ts`

When initializing the plugin service's RPC context, add the `metadata` backend:

```typescript
metadata: {
  query: (q) => ports.bases.query(vault_id, q),
  list_properties: () => ports.bases.list_properties(vault_id),
  get_backlinks: (path) => ports.search.get_note_links_snapshot(vault_id, path),
  get_stats: (path) => ports.search.get_note_stats(vault_id, path),
}
```

This requires checking what `SearchPort` exposes for backlinks and stats. If `get_note_links_snapshot` or `get_note_stats` don't exist yet on the port:

**Conditionally add** to `src/lib/features/search/ports.ts`:

```typescript
get_note_stats(vault_id: VaultId, note_path: string): Promise<NoteStats>;
```

And implement in `search_tauri_adapter.ts` via `invoke("get_note_stats", ...)`.

**Backend:** Check if `get_note_stats` Tauri command exists. If not, add to `src-tauri/src/features/search/` — query word count, heading count, link count from the existing indexed data.

### 3d. Add to SDK

**Edit:** `src-tauri/src/features/plugin/sdk/carbide_plugin_api.js`

Add `carbide.metadata` namespace:

```js
carbide.metadata.query(query);
carbide.metadata.listProperties();
carbide.metadata.getBacklinks(notePath);
carbide.metadata.getStats(notePath);
```

### 3e. Tests

**Edit:** `tests/unit/services/plugin_rpc_handler.test.ts`

New `describe("metadata.*")` block:

- Each action returns results when `metadata:read` permission is present
- Each action throws when permission is missing
- Throws on unknown action
- Throws when metadata backend not initialized

**Estimated scope:** ~120 lines new code (RPC handler + DI wiring + SDK + tests), potentially ~50 more if backend stats command is needed.

---

## Milestone 4: LaTeX Snippets Demo Plugin

**Why last:** Exercises the SDK and editor API end-to-end. Good integration test of the whole stack.

### 4a. Plugin files

**New directory:** `.carbide/plugins/latex-snippets/`

**`manifest.json`:**

```json
{
  "id": "latex-snippets",
  "name": "LaTeX Snippets",
  "version": "1.0.0",
  "author": "Carbide",
  "description": "Insert LaTeX math snippets from a sidebar panel",
  "api_version": "0.1.0",
  "permissions": ["editor:modify", "commands:register", "ui:panel"],
  "activation_events": ["on_startup"],
  "contributes": {}
}
```

**`index.html`:** Uses SDK. Registers:

- Command palette entry: "Insert LaTeX Snippet" (opens sidebar)
- Sidebar panel with categorized snippet buttons
- Click inserts at cursor via `carbide.editor.replaceSelection()`

**Snippet categories:**

- Greek: `\alpha`, `\beta`, `\gamma`, `\theta`, `\lambda`, `\pi`, `\sigma`, `\omega`
- Operators: `\sum`, `\prod`, `\int`, `\lim`, `\infty`
- Structures: `\frac{}{}`, `\sqrt{}`, `\begin{align}...\end{align}`, `\begin{matrix}...\end{matrix}`

### 4b. Tests

- Manifest validation test (existing test infra should cover)
- Verify snippet insertion via editor RPC mock

**Estimated scope:** ~100 lines (manifest + HTML/JS)

---

## Dependency Graph

```
Milestone 1 (SDK)
    ↓
Milestone 2 (Hot-Reload)     Milestone 3 (Metadata RPC)
    ↓                             ↓
         Milestone 4 (LaTeX Demo)
```

Milestones 2 and 3 are independent of each other but both depend on 1 (SDK should exist before adding metadata methods to it). Milestone 4 depends on all three (uses SDK, benefits from hot-reload during dev, could optionally use metadata).

## Implementation Order

| Step | Milestone                                    | Branch                                  | Est. Lines |
| ---- | -------------------------------------------- | --------------------------------------- | ---------- |
| 1    | SDK source + virtual serving + demo rewrites | `feat/plugin-sdk`                       | ~200       |
| 2    | Hot-reload frontend listener                 | same branch or `feat/plugin-hot-reload` | ~60        |
| 3    | Metadata RPC namespace                       | `feat/plugin-metadata-rpc`              | ~170       |
| 4    | LaTeX Snippets demo                          | `feat/plugin-latex-snippets`            | ~100       |

**Total estimated new code:** ~530 lines across 4 milestones.

## Post-edit Verification (each milestone)

```bash
pnpm check
pnpm lint
pnpm test
cd src-tauri && cargo check
pnpm format
```

## Definition of Done

- [x] TypeScript SDK served as virtual file (embedded via `include_str!()` in storage.rs)
- [x] Hot-reload works in dev mode (backend watcher + frontend debounced listener)
- [x] Plugins can query bases, properties, backlinks, and note stats via `metadata.*` RPC
- [x] LaTeX Snippets demo plugin works end-to-end (at `docs/example-plugins/latex-snippets/`)
- [x] All existing tests pass (2590/2590), new tests added for each milestone
- [x] `carbide/TODO.md` Phase 8 checkboxes updated
- [x] All implementation docs updated with completion status
