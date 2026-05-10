---
"carbide": minor
---

### Hover panel

- Sticky hover panel with rendered markdown and clear button, clears on tab change
- Link tooltips populate the hover panel store
- Source mode hover populates panel store
- Clickable links in floating hover tooltips with `clear_hover` method

### External MCP sidecar

- Generic external MCP client in Rust for stdio-based MCP servers
- `sidecar.*` plugin API for spawning and communicating with external MCP servers
- `wiki-compiler` plugin using the sidecar system
- `vault.get_root` RPC action
- Added `.llmwiki/` to builtin vault ignore patterns
- Integration tests for sidecar RPC handler, adapter, and ExternalMcpState

### File embeds

- Route file embed "open" action through `document_open`
- Register `book-open` icon and fix reserved word in interface
- Ensure leading paragraph before NodeView at document start
- Deduplicated embed plugin code

### Sidebar

- Widen sidebar and persist width across open/close

### Fixes

- Preserve collapse state across non-note tabs and respect attachment folder for dropped files
- Flush pending `didChange` before LSP completion requests
- Fix layering violation and type error from checks
- Rename lib crate from `carbide_lib` to `carbide`
- Bridge Carbide AI provider config to wiki-compiler plugin
