# IWE — Intelligent Writing Environment

> Status: **Active**
> Last updated: 2026-03-22

IWE is an LSP-based writing assistant that indexes the vault and provides IDE-like features for markdown: hover tooltips, go-to-definition, find references, code actions, completions, rename, formatting, inlay hints, and diagnostics. The backend is a standalone Rust binary (`iwes`) that communicates via the Language Server Protocol.

---

## How It Works

IWE is a **sidecar process** managed by the Tauri backend. The frontend communicates through the standard port/adapter/service/action architecture. On vault open, the lifecycle reactor starts the `iwes` binary, which performs a full directory walk of `.md` files and builds an in-memory index. All LSP requests route through Tauri IPC commands.

```
┌─ Editor (ProseMirror) ─────────────────────────────┐
│  hover_plugin, definition_plugin, completion_plugin,│
│  inlay_hints_plugin                                 │
└──────────┬──────────────────────────────────────────┘
           │ EditorEventHandlers (callbacks)
┌──────────▼──────────┐
│    EditorService     │  Adds file_path + generation guards
└──────────┬──────────┘
           │ EditorServiceCallbacks
┌──────────▼──────────┐     ┌──────────────┐
│   create_app_context │────▶│   IwePort    │  (interface)
└─────────────────────┘     └──────┬───────┘
                                   │
                            ┌──────▼───────┐
                            │ Tauri Adapter │  tauri_invoke()
                            └──────┬───────┘
                                   │ IPC
                            ┌──────▼───────┐
                            │  Rust Backend │  #[tauri::command]
                            └──────┬───────┘
                                   │ stdin/stdout
                            ┌──────▼───────┐
                            │   iwes (LSP)  │
                            └──────────────┘
```

For command-palette-triggered features (references, code actions, workspace symbols, rename, formatting), the flow is:

```
Command Palette → Action Registry → IweService → IwePort → Tauri → iwes
                                       ↓
                                    IweStore
                                       ↓
                              UI reads via $derived
```

---

## Capabilities

| Feature                | Trigger                                               | Notes                                                                           |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Lifecycle**          | Automatic on vault open/close                         | Managed by `iwe_lifecycle.reactor`                                              |
| **Restart / Re-index** | `Cmd+Shift+I`, command palette, CLI `--restart-iwe`   | Full stop + start; iwes re-walks the vault                                      |
| **Document Sync**      | Automatic                                             | `didOpen` on file open, `didChange` on edit (500ms debounce), `didSave` on save |
| **Diagnostics**        | Automatic → Problems Panel                            | Converted to `LintDiagnostic` format, shown in existing lint panel              |
| **Status Indicator**   | Always visible                                        | Green (running), amber (starting), red (error), hidden (idle)                   |
| **Hover**              | Mouse hover in editor                                 | 350ms debounce, floating tooltip via `@floating-ui/dom`                         |
| **Go-to-Definition**   | `Cmd/Ctrl+click` in editor                            | Navigates to first result via `note.open` action                                |
| **Find References**    | Command palette                                       | Results shown in bottom panel IWE tab                                           |
| **Code Actions**       | Command palette                                       | Results in IWE tab, click Apply to execute                                      |
| **Workspace Symbols**  | Command palette                                       | Results in IWE tab, click to navigate                                           |
| **Format Document**    | Command palette                                       | Returns `IweTextEdit[]`, applied to markdown in-place                           |
| **Rename**             | Command palette                                       | `prepareRename` → dialog → `rename`                                             |
| **Completion**         | Server-defined trigger characters (e.g. `+` for iwes) | Dropdown with label/detail, Enter/Tab to accept                                 |
| **Inlay Hints**        | Automatic on doc open/change                          | Inline decorations via ProseMirror `Decoration.widget`                          |

---

## User-Facing How-To

### Prerequisites

IWE requires the `iwes` binary. Set the path in Settings → Editor → IWE Binary Path. When a vault is opened, IWE starts automatically. Check the status indicator in the editor status bar — green means connected.

### Hover

Move the mouse over a heading or wiki link. After 350ms a tooltip appears with context from the LSP server. Move the mouse away to dismiss; you can hover the tooltip itself to keep it open.

### Go-to-Definition

Hold `Cmd` (macOS) or `Ctrl` (Windows/Linux) and click a heading reference or wiki link. The editor navigates to the definition.

### Find References

1. Place cursor on a heading or section
2. Open command palette (`Cmd+K`)
3. Type "IWE: Find References"
4. The bottom panel opens to the **IWE** tab showing all locations that reference the symbol
5. Click any row to navigate to that file and position

### Code Actions

1. Place cursor in context
2. Command palette → "IWE: Code Actions"
3. Bottom panel shows available refactoring actions
4. Click the play button (▶) on an action to apply it

### Workspace Symbols

1. Command palette → "IWE: Workspace Symbols"
2. Bottom panel lists all headings/sections across the vault
3. Click any symbol to navigate to it

### Format Document

1. Open the note to format
2. Command palette → "IWE: Format Document"
3. The LSP returns text edits, applied instantly to the editor content

### Rename Symbol

1. Place cursor on a heading
2. Command palette → "IWE: Rename Symbol"
3. IWE validates the position (`prepareRename`)
4. A dialog appears pre-filled with the current name
5. Edit the name and press Enter or click "Rename"
6. IWE applies the rename across all referencing files

### Completion

Type a trigger character defined by the LSP server (e.g. `+` for iwes link completion). The completion dropdown appears after a 200ms debounce. Navigate with arrow keys, accept with Enter or Tab, dismiss with Escape. The dropdown is automatically suppressed when inside a `[[wiki link]]` context. Trigger characters are read dynamically from the server's `InitializeResult` capabilities.

### Restart / Re-index

IWE does not have a file watcher — new files created after startup are not discovered. To re-index:

- **Command palette:** "IWE: Restart Server"
- **Hotkey:** `Cmd+Shift+I`
- **CLI:** `badgerly --restart-iwe` (useful from external scripts/automation)

---

## Architecture

### File Layout

```
src/lib/features/iwe/
├── index.ts                          # Public exports
├── ports.ts                          # IwePort interface
├── types.ts                          # All type definitions
├── state/
│   └── iwe_store.svelte.ts           # Reactive state ($state)
├── application/
│   ├── iwe_service.ts                # Async orchestration
│   └── iwe_actions.ts                # Action registry entries
├── adapters/
│   └── iwe_tauri_adapter.ts          # Tauri IPC adapter
├── domain/
│   └── apply_text_edits.ts           # LSP text edit application
└── ui/
    ├── iwe_status_indicator.svelte   # Status bar widget
    ├── iwe_results_panel_content.svelte  # Bottom panel content
    └── iwe_rename_dialog.svelte      # Rename input dialog

src/lib/features/editor/adapters/
├── iwe_hover_plugin.ts              # ProseMirror hover plugin
├── iwe_definition_plugin.ts         # ProseMirror Cmd+click plugin
├── iwe_completion_plugin.ts         # ProseMirror completion dropdown
├── iwe_inlay_hints_plugin.ts        # ProseMirror decoration plugin
└── iwe_plugin_utils.ts              # Shared position conversion utils

src/lib/reactors/
├── iwe_lifecycle.reactor.svelte.ts  # Start/stop with vault
└── iwe_document_sync.reactor.svelte.ts  # didOpen/didChange/didSave
```

### Action IDs

```
iwe.restart              — restart the LSP server
iwe.references           — find references at cursor
iwe.code_actions         — get code actions at cursor
iwe.workspace_symbols    — list all symbols in vault
iwe.formatting           — format current document
iwe.rename               — open rename dialog at cursor
iwe.rename_confirm       — confirm and execute rename
iwe.code_action_resolve  — apply a selected code action
iwe.toggle_results       — toggle the IWE results bottom panel
```

### Command Palette Entries

| Command                | Keywords                                                |
| ---------------------- | ------------------------------------------------------- |
| IWE: Restart Server    | iwe, restart, reindex, refresh, lsp, server             |
| IWE: Find References   | iwe, references, links, backlinks, lsp, find            |
| IWE: Code Actions      | iwe, code, actions, refactor, lsp, restructure          |
| IWE: Workspace Symbols | iwe, workspace, symbols, headings, outline, lsp, search |
| IWE: Format Document   | iwe, format, formatting, lsp, clean, style              |
| IWE: Rename Symbol     | iwe, rename, refactor, lsp, heading, section            |

### Default Hotkeys

| Key           | Action              |
| ------------- | ------------------- |
| `Cmd+Shift+I` | IWE: Restart Server |

### Editor Plugin Wiring

Editor plugins cannot import IWE types directly (cross-feature deep import rule). Instead, callbacks are threaded through 4 layers:

1. **`EditorEventHandlers`** (ports.ts) — plugin-facing callbacks with `(line, character)` signature
2. **`EditorServiceCallbacks`** (editor_service.ts) — adds `file_path` parameter
3. **`editor_service.create_session_events()`** — adds `active_note.path` and generation guards
4. **`create_app_context.ts`** — wires callbacks to `ports.iwe.*` with vault_id checks and try-catch

This avoids circular DI (IweService is constructed after EditorService) and keeps features decoupled.

### IweStore Fields

```typescript
status: IweStatus          // "idle" | "starting" | "running" | "error" | "stopped"
last_hover: IweHoverResult | null
references: IweLocation[]
code_actions: IweCodeAction[]
symbols: IweSymbol[]
completions: IweCompletionItem[]
inlay_hints: IweInlayHint[]
error: string | null
loading: boolean
```

### Key Design Decisions

| Decision                                                 | Rationale                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Port-level callbacks for editor plugins (not IweService) | IweService constructed after EditorService; port avoids circular DI       |
| Generation guards on all editor callbacks                | Prevents stale session responses from updating current state              |
| Inline types in EditorEventHandlers                      | Avoids cross-feature deep imports from editor to IWE types                |
| 350ms hover debounce                                     | Balances responsiveness with LSP request volume                           |
| 200ms completion debounce                                | More aggressive than hover since user is actively typing                  |
| 1000ms inlay hints debounce                              | Hints are supplementary; aggressive refresh not needed                    |
| 500ms didChange debounce (reactor)                       | Prevents flooding LSP during fast typing                                  |
| Cmd+click for definition                                 | Plain click must keep normal editor behavior                              |
| try-catch on all editor IWE callbacks                    | Prevents toast spam when LSP channel closes unexpectedly                  |
| Wiki-suggest suppression in completion                   | Avoids keyboard handler conflicts between `[[` suggest and IWE completion |

---

## Limitations & Known Gaps

- **No file watcher**: iwes walks `.md` files on startup only. New files require a restart (`Cmd+Shift+I`)
- **Workspace symbols search**: Currently passes empty query `""` to get all symbols. No incremental search / omnibar integration yet
- **Completion trigger**: Reads trigger characters dynamically from the LSP server's capabilities. Works with any LSP server that declares completion trigger characters
- **Inlay hints**: Depend on what iwes returns. Rendering is position-based; may be slightly off in complex ProseMirror node structures
- **Code action resolve**: The "Apply" button sends the action's JSON data back to iwes for resolution. Success depends on iwes correctly applying workspace edits to the filesystem
- **Rename**: Workspace-wide rename is applied by iwes on the backend. The frontend currently does not reload affected files — the user may need to close and reopen modified notes to see changes
