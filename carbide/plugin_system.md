# Carbide Plugin System Design

## Plugin System Strategy

Build a native Carbide plugin API first. Design it with Obsidian-like vocabulary (same concepts, similar method names) so porting is trivial, but don't build a compatibility shim until the app has real users.

### Non-Goals

- Do not promise "runs Obsidian plugins" as a blanket capability
- Do not expose raw Tauri IPC to plugin code
- Do not expose PTY stdin or shell execution to plugins
- Do not try to emulate all of Obsidian's desktop runtime on day 1

The right framing is: Carbide has its own plugin host, and later may add an Obsidian compatibility layer for a subset of plugins.

## Editor Engine Constraint

Obsidian uses CodeMirror 6 (plain-text, line/column positions). Carbide uses Milkdown/ProseMirror (structured document tree, node-based positions). This is the fundamental constraint that determines which Obsidian plugins could ever be shimmed.

### Obsidian Plugin Compatibility Tiers

| Tier         | API Surface                                                                                                                         | Examples                                      | Shimmable?                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| Works        | Vault I/O, MetadataCache, Commands, Settings, StatusBar, Events                                                                     | Templater, Linter, Tag Wrangler               | Yes — no editor engine dependency                 |
| Translatable | `Editor` abstraction (`getCursor`, `replaceSelection`, `getLine`), `MarkdownPostProcessor`, `registerMarkdownCodeBlockProcessor`    | Dataview, Tasks, Admonitions                  | Yes, with line/col ↔ ProseMirror position adapter |
| Impossible   | `editor.cm` (raw CM6 EditorView), CM6 extensions/decorations/state, custom `ItemView` subclasses, deep `WorkspaceLeaf` manipulation | Vim mode, Style Settings, custom view plugins | No — requires CM6 on ProseMirror                  |

Many of the highest-value community plugins (Dataview, Tasks, Templater, Calendar, Kanban) are in Tiers 1-2.

## Native Plugin API Design

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Main App (Trusted)                             │
│  ┌───────────────────────────────────────────┐  │
│  │ Plugin Host                               │  │
│  │  - Manifest loader + permission validator │  │
│  │  - RPC dispatcher (postMessage ↔ API)     │  │
│  │  - Capability gate (check perms per call) │  │
│  │  - Network proxy (credential injection)   │  │
│  │  - Output sanitizer (HTML/XSS)           │  │
│  │  - Rate limiter                           │  │
│  └───────────────────────────────────────────┘  │
│         ▲ postMessage RPC                       │
│         │                                        │
│  ┌──────┴──────┐  ┌──────────────┐              │
│  │ Plugin A    │  │ Plugin B     │  (iframes)   │
│  │ (sandboxed) │  │ (sandboxed)  │              │
│  └─────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────┘
```

### Plugin Structure

Each plugin lives in `<vault>/.carbide/plugins/<name>/`:

- `manifest.json` — name, version, permissions, api_version
- `main.js` — compiled entry point
- `styles.css` — optional styles

For imported Obsidian plugins, keep the source bundle separate from the normalized runtime artifact:

- `.carbide/plugins/<id>/source/` — original imported plugin files
- `.carbide/plugins/<id>/runtime/` — Carbide-ready manifest + rewritten bundle

This preserves debuggability and makes compat failures inspectable.

### Permission Model

Granular, capability-based permissions declared in manifest:

- `fs:read`, `fs:write` — vault file access
- `editor:read`, `editor:modify` — editor state access
- `network:fetch` — HTTP requests (proxied through host)
- `ui:panel`, `ui:statusbar` — UI slot access
- `commands:register` — command palette registration

Plugins that need API keys (e.g. Zotero) declare `credentials: ["zotero_api_key"]`. The host proxies HTTP and injects credentials — the plugin iframe never sees raw keys.

### API Surface

Design with Obsidian-like vocabulary for easy porting:

- `vault.read(path)`, `vault.create(path, content)`, `vault.modify(path, content)`, `vault.delete(path)`, `vault.list()`
- `editor.getCursor()`, `editor.getSelection()`, `editor.replaceSelection(text)`, `editor.getValue()`, `editor.setValue(content)`
- `commands.register({ id, name, callback })`, `commands.remove(id)`
- `ui.addStatusBarItem()`, `ui.addSidebarPanel()`, `ui.addRibbonIcon()`
- `events.on('file-change', cb)`, `events.on('active-file-change', cb)`
- `settings.register(settingsTab)`
- `metadata.getFileCache(path)` — frontmatter, links, headings, tags

### Mapping to Current Otterly Architecture

Follow the existing app decision tree and composition root instead of inventing a parallel runtime.

Frontend:

- `src/lib/features/plugin/ports.ts` — host/discovery/runtime IO contracts
- `src/lib/features/plugin/state/plugin_store.svelte.ts` — loaded plugins, contribution state, runtime status
- `src/lib/features/plugin/application/plugin_service.ts` — discover, validate, activate, deactivate, dispatch RPC
- `src/lib/features/plugin/application/plugin_actions.ts` — user-triggerable actions
- `src/lib/features/plugin/adapters/plugin_host_adapter.ts` — iframe host + `postMessage` transport
- `src/lib/features/plugin/ui/*` — plugin manager, compat report, permissions UI

Composition root:

- Add `PluginStore` in `src/lib/app/bootstrap/create_app_stores.ts`
- Add `PluginPort` to `src/lib/app/di/app_ports.ts`
- Wire the production adapter in `src/lib/app/create_prod_ports.ts`
- Construct `PluginService` in `src/lib/app/di/create_app_context.ts`
- Register plugin actions beside the existing feature actions

Backend:

- `src-tauri/src/features/plugin/service.rs` — discovery, manifest validation, permission-gated commands
- `src-tauri/src/features/plugin/types.rs` — manifest, permission, compat report types
- `src-tauri/src/features/plugin/mod.rs` — feature entrypoint
- Register commands and managed state only in `src-tauri/src/app/mod.rs`

This keeps the plugin system aligned with the existing ports/stores/services/actions split.

### Runtime Contribution Points

The host should define explicit contribution slots instead of letting plugins mutate arbitrary DOM:

- commands
- status bar items
- sidebar panels
- note context actions
- editor content transforms
- metadata providers

In the current app, the biggest structural changes are:

- command palette data is static today and must become runtime-extensible
- the status bar needs a contribution collection rather than only built-in items
- the workspace layout needs explicit panel slots for plugin panels
- the editor service needs a richer, host-mediated API than simple text insertion

### Plugin Lifecycle

`discover → validate manifest → load iframe → activate (onload) → running → deactivate (onunload)`

Hot-reload in dev mode via file watcher on the plugin directory.

## Obsidian Compatibility Layer (Deferred)

If Carbide gains users, build `@carbide/obsidian-compat` as a separate package:

### How the Shim Works

Intercept `import { Plugin, Vault, Editor } from 'obsidian'` with a compatibility module:

```
Obsidian plugin's main.js
        │
        ▼
  shimmed `obsidian` module
   ├── Plugin base class      → Carbide plugin lifecycle
   ├── app.vault.*             → Carbide vault.* API
   ├── app.metadataCache.*     → Carbide metadata.* API
   ├── app.workspace.*         → Carbide workspace state
   ├── Editor.*                → line/col ↔ ProseMirror position adapter
   ├── addCommand()            → Carbide commands.register()
   ├── addStatusBarItem()      → Carbide ui.addStatusBarItem()
   └── registerMarkdown*()     → post-process Milkdown's rendered output
```

Loading: scan `.obsidian/plugins/` or `.carbide/compat/` → read `manifest.json` + `main.js` → inject shimmed module → call `onload()` → catch unsupported API calls.

### Why Not Load `.obsidian/plugins` Directly

Direct loading sounds attractive, but it is the wrong first implementation:

1. Obsidian plugins import the `obsidian` runtime module. Carbide must intercept and replace that import.
2. Many plugins are marked `isDesktopOnly` and assume Node or Electron APIs.
3. Plugin bundles often assume Obsidian workspace/view semantics that Carbide does not have.
4. When compat fails, a rewritten runtime artifact gives us a place to report and surface the failure cleanly.

The better flow is import -> analyze -> rewrite -> activate.

### Import Pipeline for Obsidian Plugins

1. User points Carbide at `<vault>/.obsidian/plugins/<id>/`
2. Carbide reads `manifest.json`
3. Static analyzer scans `main.js` for known incompatibilities:
   - Node builtins
   - Electron usage
   - raw CodeMirror access
   - unsupported workspace/view APIs
4. Importer writes a compat report with:
   - safe
   - degraded
   - unsupported
5. If safe enough, Carbide rewrites the bundle so `obsidian` resolves to `@carbide/obsidian-compat`
6. Carbide writes the normalized runtime artifact under `.carbide/plugins/<id>/runtime/`
7. Runtime loads the normalized artifact, not the original bundle

This importer becomes the main developer UX for testing real-world plugin compatibility.

### Hard Problems in the Compat Layer

1. **MetadataCache** — Obsidian maintains a live index of every file's frontmatter, links, headings, tags. Carbide must build this from scratch (parse all .md, incremental updates on change). Many popular plugins depend on it.
2. **Editor position mapping** — `{line: 5, ch: 12}` ↔ ProseMirror `ResolvedPos`. Fiddly around embedded nodes (images, code blocks, math blocks).
3. **Undocumented internals** — Plugins accessing `(app as any).plugins`, `(app as any).internalPlugins`, `leaf.view.sourceMode`. Impossible to shim without reverse engineering.
4. **Event timing semantics** — When does `vault.on('modify')` fire relative to MetadataCache updates? Poorly documented, but plugins depend on ordering.
5. **Workspace/view model mismatch** — Obsidian plugins can rely on `WorkspaceLeaf`, `ItemView`, and layout behaviors that do not map cleanly to Carbide's fixed workspace structure.
6. **Custom editor extensions** — Anything that expects direct CodeMirror extension registration is outside the initial compat target.

### Compatibility Gates

Before activation, every imported Obsidian plugin should be classified:

- `native` — Carbide plugin, no shim required
- `compat_safe` — Obsidian plugin expected to work with the shim
- `compat_degraded` — plugin should load, but some APIs are stubbed or reduced
- `unsupported` — plugin depends on APIs outside Carbide's target surface

The plugin manager should show this classification before the user enables the plugin.

### Legal

`obsidian.d.ts` on npm is MIT-licensed. Clean-room shim from type definitions is fine. Behavioral compatibility requires care to avoid reverse engineering the proprietary runtime.

### Effort Estimate

Even scoped to the top 20 plugins: ~2-3 months (Vault shim, MetadataCache, Editor adapter, event system, testing against real plugins). Not justified until Carbide has real adoption.

## Ironclaw Assessment

Evaluated [nearai/ironclaw](https://github.com/nearai/ironclaw) for plugin design inspiration. Ironclaw is a headless AI agent runtime with WASM-sandboxed tools — fundamentally different problem (request/response tool execution vs long-lived UI plugins in a desktop editor). The "transferable" patterns (capability permissions, manifest schemas, credential isolation) are standard plugin security patterns that don't require ironclaw as a reference. Obsidian and VS Code are far closer analogues. **Verdict: not useful for Carbide's plugin design.**

## Implementation Plan

### Phase 1: Native Plugin API (with Tier 1-3 features)

- Plugin host, manifest loader, permission validator
- iframe sandbox + postMessage RPC bridge
- TypeScript SDK: `@carbide/plugin-api`
- Demo plugins: Hello World, Word Count, LaTeX Snippets
- Dynamic contribution registries for commands, status bar items, and sidebar panels
- Plugin manager UI with permissions and runtime error reporting

### Phase 1.5: Hardening

- Explicit CSP updates for sandboxed iframe/plugin loading
- Rate limits and payload size limits on plugin RPC
- Crash isolation and per-plugin disable-on-failure behavior
- Audit logging for permission use in dev builds

### Security Guardrails

- Plugins never call `invoke()` directly
- All plugin capabilities flow through the host RPC dispatcher
- Every RPC call is permission-checked against the manifest
- Network access is proxied by the host, not performed with ambient credentials
- No plugin API for terminal input or arbitrary shell execution
- UI APIs return host-owned handles, not live DOM nodes
- HTML-producing APIs must be sanitized before rendering

### Phase 2: MetadataCache Infrastructure

- Parse all vault .md files for frontmatter, links, headings, tags
- Incremental updates on file change
- Expose via `metadata.getFileCache(path)`
- Enables query-based plugins (Dataview-like)

### Phase 3: Obsidian Compatibility (only if users demand it)

- `@carbide/obsidian-compat` shimming Tier 1-2 APIs
- Plugin compatibility checker (static analysis of `main.js` → report)
- Tested against top 20 community plugins

### Suggested Success Criteria

Phase 1 is successful when:

- a native plugin can register a command, status item, and sidebar panel
- a native plugin can read and write vault files through permission-gated APIs
- plugin crashes do not take down the main app

Phase 3 is successful when:

- Carbide can import a real Obsidian plugin folder and produce a compat report
- at least a small curated set of high-value plugins work end-to-end
- unsupported plugins fail clearly before activation instead of breaking at runtime
