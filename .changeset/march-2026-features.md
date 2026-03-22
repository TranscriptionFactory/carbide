---
"badgerly": minor
---

### IWE (Intelligent Writing Engine) LSP Integration
- Full LSP client infrastructure with hover, go-to-definition, completion, formatting, rename, inlay hints, and diagnostics
- Live log viewer in Problems panel for IWE debug output
- Dynamic completion triggers read from server capabilities
- Proper URI encoding for LSP protocol compliance
- IWE restart action and CLI trigger

### Editor Enhancements
- Collapsible headings in both visual and source editor modes with clickable fold toggles
- Inline document and PDF embedding (`![[file.pdf]]`) via pdf.js canvas rendering
- Collapsible sections (`<details>`/`<summary>`)
- Selection-wrap formatting and Tab selection safety
- Bidirectional cursor mapping for source/visual mode toggle
- Code block double-click, copy, and backtick-wrap UX improvements
- HR divider styling, line number toggle, and read-only mode
- Source editor background now themeable

### Plugin System
- Plugin runtime settings wiring and granted permission enforcement
- Auto-tag plugin with TOML-configured allow/deny lists
- Plugin lifecycle and static settings UI

### Metadata & Navigation
- Metadata sidebar panel in context rail (read-only)
- Hierarchical tag tree UI with prefix queries
- Heading anchors wired into note links (target_anchor + section_heading)
- Folder path autocomplete with Tab completion in save dialog

### Split View
- Real-time content sync between split view panes
- Fix file integrity bugs (race conditions, false mtime warnings)

### Appearance & Preferences
- System color scheme preference for automatic light/dark switching
- File tree style variants: compact, macos_finder, refined, airy_minimal
- Theme persistence across app restarts
- Color scheme preference persistence fix

### Performance & Backend
- Vault startup optimization — eliminate redundant I/O during open
- State management efficiency improvements (Tier 1–3)
- Replace fastembed/ort-sys with pure-Rust candle for embeddings
- Encoding-aware reads in search indexer for non-UTF-8 notes
- Embedding invalidation on note upsert

### AST-Indexed Schema
- Property registry wiring with inline tags, sections, and code blocks
- Compact frontmatter with auto-expand overrides and all-file indexing

### Other
- Auto-check for updates on startup with skip version support
- Copy-to-clipboard button on log panel
- External file drag-and-drop into editor with embeddable support
- Folder drag-drop race condition fix
- Settings Apply button fix and active category persistence
