# badgerly

## 0.4.0

### Minor Changes

- 6b747ef: Plugin system and markdown lint infrastructure
  - Plugin lifecycle with load/unload, settings UI, iframe sandboxing, and event system
  - Markdown linting via rumdl LSP sidecar with real-time diagnostics and gutter markers
  - CodeMirror lint integration with inline diagnostics and fix-all action
  - VS Code-style problems panel in tabbed bottom bar (terminal + problems)
  - Format-on-save with configurable formatter (rumdl or Prettier)
  - Format-now action (Cmd+Shift+F) and bottom toolbar lint status indicator
  - Sidecar download wired into build pipeline with platform-specific hashing
  - Fix: CLI fallback for format operations, LSP path resolution, format-on-save loop prevention
  - Fix: prevent rumdl config files from leaking into browsed folders
  - Fix: source mode effects now re-run after CodeMirror mounts (reactive view_mounted flag)
  - Fix: sync ProseMirror and source editor views after lint format/fix edits

- 16589bb: Add semantic search integration with vault graph visualization
  - Semantic similarity edges in vault graph with configurable threshold and edges-per-note settings
  - WebGL renderer with worker-based force simulation and viewport culling for graph performance
  - Batch semantic KNN via single IPC call with pure Rust backend (replacing sqlite-vec)
  - Streaming vault graph backend with granular neighborhood cache invalidation
  - Semantic omnibar fallback for search
  - Suggested links panel with reactor-driven refresh
  - Configurable semantic embedding parameters in settings
  - Graph as a first-class tab type with dedicated graph tab view and tab persistence
  - Renderer refactored with Svelte action-based canvas lifecycle for reliable mount/cleanup
  - Fix Svelte reactive array deproxying before postMessage to web workers
  - Fix worker postMessage clone errors and URL resolution

- 6b747ef: PDF viewer, canvas, fuzzy matching, and editor polish
  - PDF viewer with continuous scroll mode, paginated mode setting, and text selection
  - Excalidraw/canvas support in file explorer and visual editor
  - Fuzzy scoring for omnibar commands, settings, slash commands, and wikilink suggestions
  - Tab-to-accept in all suggest plugins and file explorer fuzzy filter
  - Inline image rendering with image path autocomplete
  - Tab indent, strikethrough shortcut, and date picker fix
  - Source editor line numbers toggle in settings
  - Bold, italic, and inline code keyboard shortcuts and input rules
  - Preserve undo history and cursor position across editor mode switches
  - VS Code-style thin colored resizable handles for panels
  - Atomic write+parse+index pipeline for vault operations
  - Rename .carbide plugin directory to .badgerly
  - Fix: heading backspace, cursor drift, phantom tasks, mermaid rendering crashes
  - Fix: code block escape behavior, language picker portal, toolbar flicker
  - Fix: AI settings migration wired into vault load path

- 5c544f3: Tags sidebar panel, date links, note naming templates, and editor improvements
  - Tags sidebar panel with Rust backend and full vertical slice
  - @-trigger date link auto-suggest with floating popup
  - Configurable default note naming with strftime templates
  - Replace Prism with Shiki for code block syntax highlighting
  - Add divider style setting for horizontal rules
  - Fix: replace counter-based watcher suppression with timestamp-based approach
  - Fix: strip stray backslash hard breaks and clean clipboard copy
  - Fix: wrap-around navigation in slash command menu

- d81b2a4: Type-safe IPC, ProseMirror migration, find & replace, and theme redesign
  - Add tauri-specta for type-safe IPC with 92 commands now having TypeScript bindings
  - Eject Milkdown, migrate to pure ProseMirror with all 25+ plugins preserved
  - Add find & replace to editor with Cmd+H toggle and replace-all in single transaction
  - Redesign theme settings with two-tier UI, auto_palette system, and live preview
  - Add Floating, Glass, Dense, and Linear builtin themes
  - Add default timestamp name for new canvas dialog
  - Make settings dialog resizable
  - Add frontmatter toggle via slash command, command palette, and status bar
  - Promote markdown AST to shared/, add note_headings and note_links tables
  - Fix: wikilink cursor positioning, tag icon, git sync button, settings nav width
  - Fix: use browse mode when opening files in non-vault folders
  - Fix: canvas name input not expanding in save dialog
  - Fix: restore slash commands, block input rules, and task checkboxes
  - Fix: frontmatter null tag and duplicate block on visual-to-source switch

## 0.3.0

### Major Changes

- f289d9e: Edit/ask for AI assistants; graph & canvas views; new themes; Badgerly icon
- db5a9b5: Full-vault graph visualization and sqlite-vec semantic embeddings infrastructure

  **A1: Full-Vault Graph View**
  - Force-directed graph rendering of all vault notes using d3-force layout with SVG
  - New Rust command `graph_load_vault_graph` returning flat node + edge arrays with dedicated LRU cache
  - Viewport culling for efficient rendering at scale (up to 5000 nodes)
  - Graph view mode toggle between neighborhood and vault-wide views in GraphStore
  - New `VaultGraphCanvas` Svelte component with zoom, pan, and node interaction
  - Layout domain module with force simulation state management

  **B1: sqlite-vec Embeddings Infrastructure**
  - Embedding inference via `fastembed` crate with `bge-small-en-v1.5` (int8 quantized, 384-dim)
  - Vector storage via `sqlite-vec` extension with `vec0` virtual tables in existing per-vault SQLite DB
  - Hybrid search pipeline: FTS + vector KNN + Reciprocal Rank Fusion (k=60) with heuristic re-ranking
  - New Tauri commands: `semantic_search`, `hybrid_search`, `get_embedding_status`, `rebuild_embeddings`, `embed_sync`
  - Background embedding pipeline: batch processing (50 notes/batch) with progress events and cancellation
  - Graceful degradation when model or extension unavailable — FTS search continues unaffected
  - Frontend ports, adapters, and types for all embedding operations

### Minor Changes

- 68bae92: Zen mode, native menubar, cache infrastructure, and backend hardening
  - Zen mode: distraction-free writing toggle (Cmd+Shift+Enter) that hides sidebar panels with animated transitions; integrated into omnibar command palette
  - Native macOS menu bar with app-specific items (File, Edit, View, Window, Help)
  - LRU cache with observability for graph neighborhood queries (Rust, 64-entry) and Mermaid SVG rendering (TypeScript, 128-entry); tracks hits, misses, evictions, and hit rate
  - Fix: settings service now uses atomic_write with fsync for crash-safe persistence
  - Fix: watcher suppression replaced with consume-on-use tokens (eliminates race conditions)
  - Fix: AI panel and task panel alignment at narrow viewport widths
