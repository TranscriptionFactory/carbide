---
"carbide": minor
---

### @ palette file filtering

- `/` prefix filters to markdown files only, `//` prefix filters across all file types
- Documented the @ palette inline mention system

### LSP/native suggest coordination

- Extensible coordination layer between LSP completions and native suggestion providers (e.g. @ palette)
- Prevents LSP popups from interfering with native suggest UIs

### MCP tool descriptions

- Improved MCP tool descriptions and CLI help text for better LLM usability

### Fixes

- `vault.list` now queries the backend instead of returning stale in-memory data
- Fixed carbide-cli sidecar builds for local Tauri development
- Reload expanded folders correctly during file tree refresh
