---
"carbide": patch
---

### Theming

- Expose Tier 3 component tokens in CSS token reference UI
- Add activity bar Tier 3 tokens for independent customization
- Remove redundant foreground token entries from theme blueprints and palette generator

### Vault indexing

- Resolve wikilink targets to vault-relative paths at index time
- Add backlinks resolution tests and register snapshot in specta

### External MCP sidecar

- Inject expanded PATH into external MCP sidecar process
- Skip non-JSON stdout lines in external MCP stdio reader
