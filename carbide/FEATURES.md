# Carbide — Implemented Features

> Running list of shipped features. Organized by area, not by implementation phase.
> For task-level status and remaining work, see `carbide/TODO.md`.

---

## Vault management

- Dropdown vault switcher in sidebar header with pinned-first + recent ordering
- Visual vault identifiers (icon/emoji or first letter)
- Quick-switch hotkey (`Cmd+Shift+V`)
- Git branch + dirty indicator per vault in dropdown
- Add Vault (folder picker) and Manage Vaults from dropdown
- Right-click context menu: Remove from list, Reveal in Finder
- Persisted vault order across sessions
- Single active vault with full store reset on switch
- Configurable default note naming with strftime templates (`%Y %m %d %H %M %S`), collision suffixes, per-vault setting

## Editor

### Core editing (Milkdown / ProseMirror)

- WYSIWYG Markdown editing with Obsidian-flavored syntax
- Wiki-links (`[[Note]]`, `[[folder/Note]]`, `[[Note|Label]]`)
- Slash commands for block insertion
- Floating table toolbar (insert/delete rows and columns, delete table, cell alignment)
- Floating image resize toolbar (width applies to DOM)
- Code block syntax highlighting via Shiki (33 language grammars, auto light/dark theme)
- Mermaid diagram preview (live render in code blocks)
- Emoji shortcodes (`:emoji:` expansion)
- Typographic auto-substitution (6 arrow conversions: `-->` → `→`, `<--` → `←`, `<->` → `↔`, `==>` → `⇒`, `<==` → `⇐`, `<=>` → `⇔`)
- Date link auto-suggest (`@` trigger with floating popup for Today/Tomorrow/Yesterday → `[[YYYY-MM-DD]]` wiki links)
- Math/LaTeX support: inline `$expr$` and block `$$expr$$` with KaTeX rendering, `/math` slash command, direct input rules
- Insert Frontmatter command (adds empty YAML block with `tags` field to notes without frontmatter)

### Split view

- Dual-pane editing (`Cmd+\` to split, `Cmd+W` to close)
- Independent Milkdown instances per pane (separate dirty state, cursor, scroll)
- Drag tab to split, drag back to merge
- "Open to Side" in file tree and tab bar context menus
- Active pane tracking for shortcuts and status bar
- Split state remembered per vault, closed on vault switch

### Outline panel

- Live heading hierarchy (h1–h6) extracted from ProseMirror state
- Click-to-scroll navigation
- Collapsible heading sections
- Active heading highlighting based on scroll position
- Debounced live updates (300ms)
- Right sidebar tab alongside Links panel (`Cmd+Shift+O`)
- Floating outline mode with collapse/expand toggle (persists across mode changes and vault switches)

## Document viewer

Multi-format document viewing in the editor pane, dispatched by file extension.

### PDF

- Page navigation, zoom, scroll, text search (pdfjs-dist)
- "Open to Side" for side-by-side PDF + notes

### Images

- PNG, JPG, SVG, GIF, WebP display
- Zoom/pan controls, fit-to-width default
- Dark/light checkerboard for transparent images

### Code / text

- Syntax-highlighted read-only view (CodeMirror)
- Line numbers, copy button
- Supported: `.py`, `.R`, `.rs`, `.json`, `.yaml`, `.toml`, `.sh`

### Cross-cutting

- File tree icon badges by file type
- Drag non-markdown file into note → insert markdown link
- PDF export of notes (`Cmd+Shift+E`, jsPDF)

## Git integration

### Local operations

- Auto-commit on save
- Status bar widget showing branch and dirty state
- Timestamp-based file watcher suppression (prevents spurious "modified externally" toasts from app-initiated saves)

### Remote operations

- Push, pull, fetch with progress indicators
- Ahead/behind commit counts in status bar
- SSH auth using the user's existing Git/SSH configuration
- "Add Remote" dialog when no remote configured
- Human-readable error categorization (auth, network, conflict)
- Command palette entries and hotkeys for all remote ops

### Version history

- Paginated commit log (20-commit initial load + load-more)
- Note-scoped history with cache and mutation invalidation

## Terminal

- Embedded PTY panel (xterm.js + tauri-plugin-pty)
- Toggle with `Cmd+Shift+\``
- Draggable resize handle between editor and terminal
- Working directory defaults to active vault root
- Persists across file/tab switches
- Bidirectional streaming via Tauri plugin events

## AI assistant

- Multi-backend support: Claude, Codex, Ollama
- Auto backend selection with configurable default
- Conversation panel in context rail with history
- Diff-first draft review with partial apply
- Edit/ask mode toggle
- Unified "AI Assistant" command palette entry
- CLI-backed execution (uses locally installed AI CLIs)
- Generic pipeline infrastructure (reusable for future CLI integrations)

## Plugin system

- Plugin discovery from `<vault>/.carbide/plugins/` via `manifest.json`
- Manifest parsing with permission validation
- Sandboxed iframe execution per plugin
- `postMessage`-based RPC bridge with permission-checked dispatcher
- RPC namespaces: vault, editor, commands, ui
- Per-plugin error tracking with auto-disable on repeated failures
- Custom URI scheme (`badgerly-plugin://`) for plugin HTML serving
- Full lifecycle: discover → validate → load → activate → deactivate
- Demo plugins: Hello World (command palette + cursor insert), Word Count (status bar)

## Canvas

- Excalidraw drawing support (`.excalidraw`, `.excalidraw.json`)
- Hosted in iframe sandbox with custom URI scheme
- Bi-directional sync between app and Excalidraw instance
- Canvas naming dialog on create
- Theme-aware background
- Canvas feature slice architecture (CanvasPort, CanvasTauriAdapter, CanvasService, CanvasStore)

## Metadata & Bases

### Metadata cache

- YAML frontmatter indexed into SQLite alongside search (derived, not authoritative)
- `note_properties` table: per-note key-value pairs with type detection (string, number, boolean, date, json)
- `note_tags` table: per-note tag index
- Incremental updates on note create, modify, rename, delete
- Per-note accessors (`get_note_properties`, `get_note_tags`) for downstream consumers (graph, tasks, plugins)
- Batch query (`list_all_properties`) for property discovery

### Properties widget (Visual Frontmatter)

- Interactive key-value grid rendered as a Milkdown NodeView
- Type-aware editors: boolean toggle (Switch), number input, date picker, text input
- Pill-based tag editor with inline add/remove
- Two-way sync between Svelte widget and ProseMirror YAML state
- Graceful degradation on malformed YAML (error state with raw text fallback)
- Source mode: widget auto-destroyed, raw YAML fences shown

### Tags sidebar panel

- Browsable tag list with counts in activity bar
- Click tag to see notes, click note to open it
- Search input for filtering tags
- Auto-refreshes on index-complete
- Rust Tauri commands: `tags_list_all`, `tags_get_notes_for_tag`

### Bases

- Dedicated feature slice: ports, store, service, adapter, panel, table
- Query model: property equality, contains, numeric/date comparison (gt, lt, gte, lte, neq)
- Tag filters
- Sort by properties or built-in columns (title, mtime_ms)
- Table and list view modes
- Pagination (limit + offset)
- `.base` view persistence (save/load JSON definitions)
- Auto-refresh on vault change via reactor

## Performance

- Async note count on vault open (eliminates blocking WalkDir scan)
- SQLite PRAGMAs: 8MB cache, 256MB mmap for indexing throughput
- Browse mode guard: no `.badgerly/` directory creation in non-vault mode

## macOS integration

- Registered as default app for `.md`, `.markdown`, `.mdx`
- File-open events routed to matching vault or prompt to add as vault
- Native Tauri command for resolving files to vaults

## Command palette & shortcuts

All features register into a centralized `COMMANDS_REGISTRY` and are accessible via the omnibar. Default hotkeys are assigned for high-frequency actions. Full action registry pattern: UI, keyboard shortcuts, command palette, and Tauri menus all dispatch through `action_registry.execute()`.
