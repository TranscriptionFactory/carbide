---
"carbide": minor
---

### Features

- **HTML-to-markdown converter plugin**: New plugin that converts HTML files to markdown, with single-file conversion support and error routing
- **PDF export rewrite**: Migrated PDF export from jsPDF to PDFKit with bundled Inter fonts, standalone browser build, and hardened error handling
- **Inline note embedding on save**: Notes are now embedded inline on save using blake3 change detection for efficient diffing
- **CLI/MCP tooling improvements**: Enhanced CLI and MCP tool integrations

### Fixes

- Format and lint-fix actions are now undoable via Ctrl+Z
- Serialized xterm.js writes to eliminate TUI app flickering
- PDF export gated to only active note tabs; frontmatter stripped from export output
- Resolved CLI sidecar path in bundled macOS app directory
- Resolved cargo warnings and test failures
