# carbide

## 1.14.0

### Minor Changes

- 6c34c7c: ### LSP typed session model and reliability improvements
  - **Typed LSP status**: `MarkdownLspStatus` enum in Rust and TypeScript replaces fragile string-based status tracking. Statuses: Starting, Running, Restarting, Stopped, Failed.
  - **Provider resolution**: Extracted `provider.rs` module for markdown LSP provider resolution (IWES/Marksman) with capability metadata.
  - **Lint lifecycle fix (BUG-010)**: `lint_close_file` returns Ok when no session exists instead of erroring.
  - **Transport diagnostics (BUG-009)**: Stderr ring buffer, init timeout (30s default, 10s for cloud-backed vaults), typed init errors (`InitTimeout`, `InitEof`, `InitFailed`), retryable/non-retryable classification.
  - **IWES packaging (BUG-005)**: Populated `platform_binaries` for auto-download from upstream `iwe-org/iwe` releases. Removed vendored sidecar binary and submodule.
  - **Vault-aware startup**: Detect iCloud/Dropbox/OneDrive vault paths, apply shorter init timeouts for cloud-backed vaults.
  - **Document lifecycle**: Added `markdown_lsp_did_close` end-to-end. Editor features gated by provider health and capabilities.
  - **MCP stdio transport**: Claude Code setup now prefers stdio via `carbide mcp` CLI proxy (matching Claude Desktop), avoiding bearer tokens in `.mcp.json`.
  - **CLI install paths**: Default to `~/.local/bin/carbide` on macOS/Linux, `%LOCALAPPDATA%\Programs\Carbide\bin\carbide.exe` on Windows.
  - **Comprehensive test coverage**: Wave 4 verification tests for provider types, status serde, toolchain registry, store state, service lifecycle, and release validation script.

## 1.11.1

### Patch Changes

- 273265b: omnifind and file search memory fixes

## 1.11.0

### Minor Changes

- c8ac662: Changeset: High-Priority Feature Implementation — 2026-04-01

## 1.10.0

### Minor Changes

- f7e41dc: Linked sources & search integration: embed linked sources in vault and add search inclusion toggle. Auto-load reference library on vault open. Fix infinite reactive loop in virtual file tree ROW_HEIGHT effect.

## 1.9.0

### Minor Changes

- 6aea234: Restore reference backend (linked sources, Zotero BBT, annotations); fix window close permissions, trailing whitespace in paragraphs, find-replace after buffer switch, virtualizer row height re-measurement, and iCloud settings write.

## 1.8.1

### Patch Changes

- c58da8c: Fix process cleanup on app close via RunEvent::Exit handler; fix vault-open CPU hotspot with async URI handlers, deferred plugin iframes, and lazy images; add asset response cache with HTTP cache headers

## 1.8.0

### Minor Changes

- c1fa394: Add Editor tuning panel (font, size, line height, zoom) under Theme > Advanced; fix OmniFind FTS thread contention causing UI blocking; fix PDF export CSP violations and wire up editor zoom hotkeys

## 1.7.1

### Patch Changes

- 49641a9: Prevent .iwe directory creation in browse mode, fix ai_prompt_builder test

## 1.7.0

### Minor Changes

- 0306368: Task management improvements (M0-M6), indexing/embedding/watcher bug fixes, tree refresh on settings change, prompt builder

## 1.5.0

### Minor Changes

- 4495f15: ### File tree blurbs
  - AI-generated note descriptions displayed inline in the file tree
  - Configurable blurb position (below heading, below caption) and toggle in Layout settings
  - Markdown formatting stripped from blurbs for clean display

  ### Theme & CSS token editor
  - New CSS token reference tab with inline editing and revert
  - Theme-aware source editor styling

  ### Editor improvements
  - Split view mode with dedicated toggle
  - Heading markers toggle for visual editor
  - Cursor sync fixes in split editor
  - Escape key clears lightbulb decoration without dismissing dropdown
  - Editor status persistence across sessions

  ### Settings
  - Spell check toggle for rich and source editors
  - Terminal customization options
  - Reference manager UI wiring

  ### IWE dynamic transforms
  - Dynamic AI provider substitution for IWE transforms
  - Config-driven transform actions wired from IWE settings
  - Config reset properly reapplies provider and guards redundant restarts
  - Open config reveals in file manager

  ### LSP
  - Proper client capabilities and config logging
  - Undoable code actions

## 1.4.0

### Editor Pipeline Rewrite

- Replaced markdown-it with remark/mdast pipeline for parsing and serialization
- Extracted ProseMirror plugins into 16 composable extensions (Moraya Pattern)
- Added Yjs integration with PM-only Y.Doc binding via ySyncPlugin
- Removed prosemirror-markdown dependency

### LSP Unification — IWE → Marksman

- Replaced IWE language server with Marksman LSP
- Deleted IWE backend, frontend modules, and all related tests
- Renamed LSP plugins (iwe*\* → lsp*\*) and cleaned DI wiring
- Unified document sync reactor across all LSP clients

### Backend Simplification

- Deleted Rust-side parsers, tags service, references service, and graph service
- Moved link extraction, metadata extraction, and graph building to frontend
- Removed ~5,000 lines of dead backend code (link_parser, frontmatter, markdown_doc, linked_source)

### Layout System

- Added 10 new layout variants: Spotlight, Cockpit, Theater, Triptych, Grounded Heavy, HUD, Zen Deck, Dashboard, Command Deck, Monolith
- Replaced split-view system with multi-tab side pane
- Added ActivityBar component with layout-aware positioning

### Stability & Performance

- Fixed memory leaks, data races, and timer deduplication issues (11 findings from state/memory audit)
- Fixed git sync spinner hang and cache thrashing
- Repaired broken CSS in glass, zen-deck, and command-deck themes
- Fixed linked source PDF loading (vault scheme, double-slash normalization)

### Status Bar

- Merged count displays, collapsed git section, removed sync button

## 1.3.0

### Minor Changes

- Reskinning prototypes: bases panel UI, LSP results redesign, IWE results streamlined
- Linked source watcher refactored to pull-based; fixed PDF loading in content pane
- Toolchain manager with binary resolver, SHA-256 verification, lifecycle management
- Composable query language with parser, evaluator, saved `.query` files, lens views
- Unified diagnostics store, AST error surfacing, unresolved link diagnostics
- Tag completion plugin, ParsedNote frontend cache, unified LSP document sync

## 1.1.0

### Minor Changes

- Full LSP client infrastructure (hover, go-to-definition, completion, formatting, rename, inlay hints, diagnostics)
- Resizable code blocks, inline SVG preview, collapsible headings and details sections
- Plugin system with lifecycle, settings UI, iframe sandboxing
- Metadata sidebar, hierarchical tag tree, heading anchors, folder path autocomplete
- Split view with real-time content sync
- System color scheme preference, file tree style variants, theme persistence
- Vault startup optimization, state management efficiency improvements
- AST-indexed schema with property registry

## 1.0.0

### Major Changes

- Plugin system and markdown lint infrastructure
- Semantic search integration with vault graph visualization
- PDF viewer, canvas, fuzzy matching, and editor polish
- Tags sidebar panel, date links, note naming templates
- Type-safe IPC, ProseMirror migration, find & replace, and theme redesign

## 0.4.0

### Minor Changes

- Plugin system, semantic search, PDF viewer, canvas, tags, ProseMirror migration

## 0.3.0

### Major Changes

- Full-vault graph view, sqlite-vec embeddings, zen mode, native menubar
