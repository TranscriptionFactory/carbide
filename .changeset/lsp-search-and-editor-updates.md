---
"carbide": minor
---

### Features

- **Hybrid omnibar search improvements**: Promoted the hybrid search pipeline to the primary omnibar path, added structured queries, scoped search, semantic graph edges, and graph interaction improvements
- **Heading autocomplete in wiki links**: Added heading completion support for `[[note#heading]]` and `[[#heading]]` flows
- **Editor and plugin workflow improvements**: Added plugin commands to the command palette, HTML source editing support, and document metadata access via `editor.get_info`
- **LSP provider architecture upgrades**: Introduced shared `LspProvider` abstractions, generalized provider config handling, and added Markdown Oxide support in shared client and frontend settings

### Fixes

- Fixed plugin sub-resource requests to fall back to the active vault
- Reduced embedding latency and corrected note/block embedding behavior
- Fixed link-repair bugs, hybrid search edge cases, dirty-state handling, toolbar undo, and related search indexing issues
- Hardened LSP behavior by addressing race conditions, stale responses, timeouts, diagnostics metadata, settings mismatches, and bundled default server configs
