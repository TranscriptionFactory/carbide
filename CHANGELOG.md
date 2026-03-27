# carbide

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
