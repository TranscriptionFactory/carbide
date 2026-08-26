---
"carbide": patch
---

Stop indexing hidden dotfiles and MCP config files, so chat sources no longer cite `.gitignore` or `mcp.json`. Existing indexes prune these rows on the next vault sync; no re-index is required.
