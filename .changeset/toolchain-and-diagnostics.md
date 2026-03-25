---
"carbide": minor
---

### Toolchain Manager

- Pluggable toolchain manager feature module with binary resolver, installation, SHA-256 verification, and lifecycle management
- RestartableLspClient wrapper for shared LSP client infrastructure across lint and IWE
- Refactored lint and IWE to use shared toolchain resolver and restartable client
- Removed sidecar from build pipeline in favor of runtime-resolved toolchains
- Frontend toolchain feature module with settings UI and lifecycle reactor
- Windows PATH support and mutex scope fixes

### Composable Query Language

- Full query language with parser, evaluator, and UI integration
- Saved queries persisted as `.query` files in vault
- Lens views for rendering query results inline

### Unified Diagnostics

- DiagnosticsStore unifying lint and IWE diagnostic sources
- Plugin API extensions for search, diagnostics, and note-indexed events
- Decoupled active file tracking from lint readiness
- AST parse error surfacing with severity mapping
- Unresolved link diagnostics

### Editor Enhancements

- Tag completion ProseMirror plugin with inline suggestions
- ParsedNote frontend cache for faster re-renders
- ToolSpec capability metadata for plugin introspection

### Unified LSP Document Sync

- Single reactor managing document open/close/change events across all LSP clients
