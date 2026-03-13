# Carbide TODO Tracker

> Tracks implementation tasks for transforming Otterly into Carbide.
> Status: `[ ]` pending | `[~]` in progress | `[x]` done | `[-]` dropped

---

## Phase 0: Audit & Bootstrap

- [x] Audit Otterly codebase (architecture, commands, stores, components)
- [-] Produce `carbide/AUDIT.md` — superseded by `carbide-project-guide.md` and inline knowledge
- [-] Produce `carbide/ARCHITECTURE.md` — superseded by `carbide-project-guide.md` and `docs/architecture.md`
- [x] Verify `cargo tauri dev` builds and runs cleanly
- [ ] Rebrand: app name, window title, asset URI scheme, config paths

## Cross-cutting otterly-carbide compatibility guardrails

- [ ] Keep note storage Obsidian-flavored Markdown and add a WYSIWYG table editing helper instead of inventing a proprietary table format
- [ ] Keep JSON Canvas explicitly on the roadmap as a storage format, while shipping Excalidraw-only canvas support for now
- [ ] Build a vault-wide alphanumeric suffix-link index with rename-safe backlink rewrites and homonym disambiguation via shortest required prefixes plus synced filename aliases
- [ ] Preserve single-root vault scope; do not support broadening a vault by wrapping multiple independent vaults in one parent directory
- [ ] Evaluate optional ecosystem features: cross-platform support, P2P sync/collab, secondary YAML metadata, metadata views (graph/base/orphans/homonyms), and icon-enhanced links/file explorer

---

## Phase 1: Vault Switcher (Dropdown)

> Start with Moraya-style dropdown vault switching. Otterly already has vault switching
> logic; this phase improves the UX with a quick-access dropdown in the sidebar header.
> Simultaneous multi-vault sidebar (VS Code-style) is deferred to a future enhancement.

### Frontend — UI

- [x] Add vault dropdown selector in sidebar header (shows current vault name + chevron)
- [x] Dropdown lists all known vaults, sorted by pinned-first then recent
- [x] Click vault in dropdown → switch to that vault (uses existing `VaultService.switch_vault()`)
- [x] "Add Vault" option at bottom of dropdown → opens folder picker
- [x] "Manage Vaults" option → opens existing vault management dialog
- [x] Show vault icon/emoji or first letter as visual identifier
- [x] Right-click vault in dropdown → Remove from list, Reveal in Finder

### Frontend — Polish

- [x] Keyboard shortcut to open vault switcher dropdown (`Cmd+Shift+V`)
- [x] Show git branch + dirty indicator per vault in dropdown
- [x] Persist last-used vault order

### Testing

- [x] Test dropdown rendering with multiple vaults
- [x] Test vault switching via dropdown
- [x] Test "Add Vault" flow from dropdown

### Future: Simultaneous Multi-Vault Sidebar

- [ ] (Deferred) Refactor to show all open vaults as collapsible root nodes in sidebar
- [ ] (Deferred) Independent file watchers, search indices, git state per vault
- [ ] (Deferred) Cross-vault search scoping

---

## Phase 2: Outline View

### Frontend

- [x] Create `OutlinePanel.svelte` — heading hierarchy from ProseMirror doc state
- [x] Extract headings from Milkdown's ProseMirror state (h1–h6 with nesting)
- [x] Click heading → scroll editor to that heading
- [x] Live update via ProseMirror transaction listener (debounced 300ms)
- [x] Collapsible heading sections in outline
- [x] Active heading highlighting (track scroll position)
- [x] Add Outline tab to right sidebar (alongside Links panel)
- [x] Hotkey: `Cmd+Shift+O` to toggle outline panel

### Reference

- [x] Study Moraya's `OutlinePanel.svelte` for heading extraction patterns

### Testing

- [x] Test heading extraction from various markdown structures
- [ ] Test scroll-to-heading behavior (requires browser environment)
- [ ] Test live update debouncing (requires browser environment)

---

## Phase 3: macOS Default App Registration

### Backend (Rust)

- [x] Add `fileAssociations` to `tauri.conf.json` for `.md`, `.markdown`, `.mdx`
- [x] Handle file-open events in Rust (adapt Moraya's `lib.rs` pattern)
- [x] Emit event to frontend with file path on open
- [x] Add `resolve_file_to_vault` Tauri command

### Frontend

- [x] Handle file-open event: if file is in known vault → open vault + navigate to file
- [x] Handle file-open event: if file outside any vault → toast prompting to add folder as vault
- [ ] Support drag-and-drop `.md` files onto dock icon

### Testing

- [ ] Test file association registration
- [ ] Test `resolve_file_to_vault` logic
- [ ] Test opening file inside known vault
- [ ] Test opening file outside any vault

---

## Phase 4: Document Split View

### Frontend

- [x] Extend center editor pane to support multiple editor instances
- [x] `Cmd+\` to split editor area into two panes
- [x] Each pane opens a different file independently
- [x] Leverage existing `Resizable.PaneGroup` infrastructure
- [x] Drag tab to split, drag back to merge
- [x] `Cmd+W` to close split pane
- [x] Max 2 panes (decision: no array refactor needed; source/preview is orthogonal)
- [x] Remember split state per vault

### Editor

- [x] Support multiple concurrent Milkdown instances (separate ProseMirror sessions)
- [x] Each pane has independent dirty state, cursor, scroll position
- [x] Active pane tracking for keyboard shortcuts and status bar

### Context Menus

- [x] "Open to Side" in file tree context menu
- [x] "Open to Side" in tab bar context menu

### Vault Integration

- [x] Close split view on vault switch

### Testing

- [x] Test SplitViewStore state management (9 scenarios)
- [ ] Test split/merge lifecycle
- [ ] Test independent editing in split panes
- [ ] Test dirty state isolation between panes

---

## Phase 5: Git Enhancements

> Detailed subtasks in `carbide/scratch/scratch_highvalue.md` → Feature 1 (Git Remote Operations)

### Backend (Rust)

- [x] `git_add_remote`, `git_push`, `git_pull`, `git_fetch`, `git_push_with_upstream`
- [x] Ahead/behind counts plus remote metadata via `git_status`
- [x] CLI-backed auth flow that uses the user's existing Git/SSH configuration
- [x] Human-readable error categorization for auth, network, and pull conflict cases

### Frontend

- [x] Add Push/Pull/Fetch controls to `git_status_widget.svelte`
- [x] Show ahead/behind counts in git status bar
- [x] Sync/fetch progress indicators during remote ops
- [x] Error toasts with actionable messages
- [x] "Add Remote" dialog when no remote configured
- [ ] Full remote management in settings or a dedicated git panel

### Version history

- [x] Paginated version-history open path with 20-commit initial load
- [x] Load-more flow plus note-scoped history cache with mutation invalidation

### Auto-commit

- [ ] Auto-commit settings UI: off / on-save / every N minutes (configurable per vault)
- [ ] Extend `git_autocommit.reactor` with interval-based auto-commit

### Commands

- [x] Add to `COMMANDS_REGISTRY`: "Git Push", "Git Pull", "Git Fetch", "Add Remote"
- [x] Add default hotkeys for remote push/pull/fetch/add-remote

### Testing

- [x] Unit tests for add-remote / fetch actions
- [x] Unit tests for version-history pagination and cache behavior
- [ ] Integration test for ahead/behind counting against a real remote
- [ ] Test push/pull with SSH remote
- [ ] Test auto-commit on save / interval

---

## Phase 6: Terminal Panel

### Backend (Rust)

- [x] Add `tauri-plugin-pty` to `Cargo.toml` (handles spawn, data transport, resize, kill via plugin IPC)
- [x] Spawn PTY with user's default shell (hardcoded `/bin/zsh`; cross-platform detection deferred)
- [x] Working directory defaults to active vault root
- [x] Bidirectional streaming via Tauri plugin events

### Frontend

- [x] Add `@xterm/xterm` + `@xterm/addon-fit` to `package.json`
- [x] Create `TerminalPanel.svelte` — bottom panel
- [x] Toggle with `Cmd+Shift+\``
- [x] Draggable resize handle between editor and terminal
- [x] Terminal persists across file/tab switches
- [x] Integrate into `workspace_layout.svelte` as vertical split below editor

### Stretch

- [ ] Multiple terminal tabs (`Cmd+Shift+\``)
- [ ] Cross-platform shell detection (respect `$SHELL`, fallback to bash)
- [ ] Respawn PTY on vault change (currently keeps old cwd)
- [ ] Theme update on theme switch (currently resolved once at init)

### Testing

- [x] Test terminal store (toggle/open/close/reset — 6 tests)
- [ ] Test PTY spawn/kill lifecycle
- [ ] Test terminal resize
- [ ] Test terminal persistence across tab switches

---

## Phase 6a: Focus/Zen Mode

> Detailed design in `carbide/scratch/scratch_highvalue.md` → Feature 4

- [ ] Add `focus_mode` boolean to `UIStore`
- [ ] Add `focus_mode_toggle` action in `ui_actions.ts`
- [ ] Hotkey: `Cmd+Shift+Enter` to toggle
- [ ] In `workspace_layout.svelte`: hide file tree + right panel with animated transition
- [ ] Escape key exits focus mode (when focus is outside editor)
- [ ] Exit focus mode on vault switch
- [ ] Add to `COMMANDS_REGISTRY`: "Toggle Focus Mode"
- [ ] Unit test for UIStore focus_mode toggle + reset on vault switch

---

## Phase 6b: Math/LaTeX Support

> Detailed design in `carbide/scratch/scratch_highvalue.md` → Feature 6

- [ ] Add `@milkdown/plugin-math` and `katex` dependencies
- [ ] Register math plugin in `milkdown_adapter.ts`
- [ ] Add KaTeX CSS import
- [ ] Create `math_block_editor.svelte` (Enter/Space to edit, Cmd+Enter to apply, Escape to cancel)
- [ ] Style math blocks to match editor theme
- [ ] Exclude math nodes from wiki-link and slash-command processing
- [ ] Add `/math` slash command
- [ ] Add to help data: inline math `$expr$`, block math `$$expr$$`
- [ ] Unit tests for math node roundtrip and wikilink exclusion

---

## Phase 6c: Contextual Command Palette

> Detailed design in `carbide/scratch/scratch_highvalue.md` → Feature 3

- [ ] Add `when?: (ctx: CommandContext) => boolean` to `CommandDefinition`
- [ ] Add `CommandContext` type (has_open_note, has_git_repo, has_git_remote, is_split_view)
- [ ] Build context from stores in omnibar action (lazy, on open)
- [ ] Filter `COMMANDS_REGISTRY` by `when` predicate in `search_omnibar`
- [ ] Add contextual commands (note-only, git-only, split-view)
- [ ] Unit tests for `when` predicate evaluation and context building

---

## Phase 6d: AI CLI Integration - COMPLETED

- [x] Create `src-tauri/src/features/ai/` module
- [x] Port from Scratch: `get_expanded_path()`, `no_window_cmd()`, `check_cli_exists()`, `execute_ai_cli()`
- [x] Adapt `ai_execute_claude()`, `ai_execute_codex()`, `ai_execute_ollama()` for vault_path
- [x] Generalize `ai_check_cli(provider)` into single function
- [x] Generalize `execute_ai_cli` into a generic `pipeline` feature (Phase 3.1 in Ferrite Port Plan)
- [ ] Frontend: `src/lib/features/ai/` (types, port, adapter, service, store, dialog, toast)
- [ ] Extract `ai_markdown_parser.ts` from Scratch's parser utilities
- [ ] Add to `COMMANDS_REGISTRY`: "AI Edit (Claude)", "AI Edit (Codex)", "AI Edit (Ollama)"
- [x] Unit tests for ANSI stripping, markdown parser, store state transitions (Rust tests ported)

---

## Phase 6e: Editor Feature Ports (Remaining)

> Detailed status in `carbide/scratch/scratch_highvalue.md` → Editor Feature Ports section
> Batches 0–3 are done (commit `e8cb652`). Remaining work:

### Done

- [x] Batch 0: Floating UI infrastructure
- [x] Batch 1: Table toolbar + Image resize toolbar (core functionality)
- [x] Batch 2: Code block language picker + Mermaid preview (core functionality)
- [x] Batch 3: Emoji shortcodes

### Remaining from Batches 1–2

- [ ] Table cell alignment support (Milkdown GFM schema investigation needed)
- [ ] Image width application to actual DOM (sets attr but needs CSS hookup)
- [ ] Mermaid serial render queue + stale result guard
- [ ] Mermaid theme re-render on color scheme change (MutationObserver)

### Batch 4: Image Context Menu + Alt Text Editor

- [ ] `image_context_menu_plugin.ts` — right-click on images
- [ ] `image_context_menu.svelte` + `image_alt_editor.svelte`
- [ ] Actions: resize, copy image/URL, edit alt, open in browser, save as, delete

### Batch 5: Touch/Formatting Toolbar

- [ ] `formatting_toolbar.svelte` + `formatting_toolbar_commands.ts`
- [ ] Toolbar: undo/redo, bold/italic/strike/code/link, H1-H3, quote, lists, code block, table, image, HR
- [ ] Show/hide via settings toggle or responsive breakpoint

---

## Phase 7: In-App Document Viewer

### Architecture

- [x] Create `DocumentViewer.svelte` — dispatches to renderer by file extension
- [x] Extend editor pane: show Milkdown for `.md`, appropriate viewer for other types

### PDF Viewer

- [x] Add `pdfjs-dist` to `package.json`
- [x] Render PDF in editor pane: page navigation, zoom, scroll, text search
- [x] "Open to Side" context menu for side-by-side PDF + notes

### Image Viewer

- [x] Display PNG, JPG, SVG, GIF, WebP in editor pane
- [x] Zoom/pan controls, fit-to-width default
- [x] Dark/light checkerboard for transparent images

### CSV/TSV Viewer

- [-] Add `papaparse` to `package.json` — deferred (large file DOM performance concerns)
- [-] Render as scrollable, sortable table — deferred
- [-] Column resize, row count display — deferred

### Code/Text Viewer

- [x] Syntax-highlighted read-only view (CodeMirror with @codemirror/language-data)
- [x] Line numbers, copy button
- [x] Support: `.py`, `.R`, `.rs`, `.json`, `.yaml`, `.toml`, `.sh`

### Cross-cutting

- [x] File tree icon badges by file type
- [x] Drag non-markdown file into note → insert markdown link
- [x] PDF export of notes (jsPDF + Cmd+Shift+E)

### Stretch

- [ ] PDF text selection → "Copy as Quote" into active note
- [ ] PDF annotations stored in `.carbide/annotations/<filename>.json`

### Testing

- [x] Test PDF search logic (find_matches, navigate_match, make_search_state)
- [x] Test image viewer zoom/pan (detect_file_type coverage)
- [-] Test CSV parsing and table rendering — deferred with CSV viewer
- [x] Test syntax highlighting for each supported language (detect_file_type)
- [x] Test file drop link generation (image vs non-image, path handling)
- [x] Test PDF export (heading rendering, markdown stripping, pagination)

---

## Phase 8: Plugin System

### Backend (Rust)

- [ ] Plugin discovery: scan `<vault>/.carbide/plugins/` for `manifest.json`
- [ ] Manifest parsing and permission validation
- [ ] Tauri commands for plugin ↔ vault/git/fs operations (gated by permissions)

### Frontend

- [ ] Plugin sandbox: each plugin runs in sandboxed iframe
- [ ] `postMessage`-based RPC bridge between plugin iframe and main app
- [ ] TypeScript SDK: `@carbide/plugin-api` with types for Vault, Editor, Commands, UI, Events, Settings
- [ ] Lifecycle: discover → validate → load → activate → deactivate
- [ ] Hot-reload in dev mode

### Demo Plugins

- [ ] "Hello World" — registers command palette entry, inserts text at cursor
- [ ] "Word Count" — status bar item with live word/character count
- [ ] "LaTeX Snippets" — snippet expansion (`//frac` → `\frac{}{}`)

### Testing

- [ ] Test plugin discovery and manifest validation
- [ ] Test plugin sandbox isolation
- [ ] Test RPC bridge communication
- [ ] Test each demo plugin

---

## Phase 9: Canvas & Visual Knowledge Layout

### Architecture

- [ ] Create `canvas` feature slice (`src/lib/features/canvas/`)
- [ ] Define `CanvasPort` and `CanvasTauriAdapter` for IO
- [ ] Implement `CanvasService` and `CanvasStore` for spatial state

### JSON Canvas (Spatial Boards)

- [ ] Parser/Serializer for `.canvas` (JSON Canvas standard)
- [ ] Svelte-based renderer for nodes (Note, Text, File, Link) and edges
- [ ] Basic node manipulation (add, move, resize, delete)
- [ ] Note embedding: render Markdown content inside canvas nodes
- [ ] Image embedding: render local assets inside canvas nodes

### Excalidraw (Drawings)

- [ ] Support for `.excalidraw` and `.excalidraw.json` files
- [ ] Host Excalidraw editor (iframe sandbox or Svelte wrapper)
- [ ] Bi-directional sync between app and Excalidraw instance
- [ ] Export canvas/drawing to PNG/SVG

### Vault & Link Integration

- [ ] Canvas reactor: rename-safe backlink rewrites for note references inside canvases
- [ ] Index canvas content in search DB (text nodes, note paths)

### Testing

- [ ] Test JSON Canvas schema validation and round-trip
- [ ] Test node manipulation and state persistence
- [ ] Test canvas link rewriting on note rename
- [ ] Test canvas content indexing

---

## Notes

### Single-Vault Assumptions (relevant if simultaneous multi-vault is pursued later)

These locations assume `VaultStore.vault` is a single vault — no changes needed for
the dropdown switcher (Phase 1), but would need refactoring for simultaneous multi-vault:

| Location                          | Assumption                                           |
| --------------------------------- | ---------------------------------------------------- |
| `VaultStore.vault: Vault \| null` | Single active vault                                  |
| `VaultService.switch_vault()`     | Resets ALL stores (notes, editor, tabs, search, git) |
| `NotesStore`                      | One flat `notes[]` array for one vault               |
| `EditorStore.open_note`           | Singular open note, no vault context                 |
| `TabStore.tabs[]`                 | All tabs belong to one vault                         |
| `GitStore`                        | One branch, one dirty state                          |
| `SearchStore`                     | One index progress tracker                           |
| Omnibar scope                     | `"current_vault"` is the only vault                  |
| Wikilink resolution               | Resolves within "the" vault                          |

### Architecture Docs Reference

- `devlog/coding_guidelines.md` — Code hygiene rules
- `docs/architecture.md` — Decision tree for feature implementation (if exists)
- Layering enforced by `scripts/lint_layering_rules.mjs`
