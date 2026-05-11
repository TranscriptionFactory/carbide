---
"carbide": minor
---

### Attachment links

- Add attachment link detection in Rust backend (images, PDFs, etc.) — filters attachment targets from wikilink resolution
- Add Attachments section to the links panel UI with paperclip icon; opens files via system shell
- Extend `LinksSnapshot` and store/service layers with attachments field

### MCP tool surface

- Router auto-injects `vault_id` from active vault when omitted
- Add `append_note` and `prepend_note` tools
- Add `mode=semantic` to `search_notes` for hybrid vector+FTS search
- Add `query_tasks` tool with status/path/due_before filters
- `rename_note` now updates wikilinks in backlinking notes automatically

### Backlink-aware rename (in-app)

- The in-app `rename_note` Tauri command now rewrites wikilinks in backlinking notes after rename, matching MCP behavior

### Fixes

- Add standard markdown link extraction (`[text](url.md)`) to Rust `extract_links` — search DB now indexes both wikilinks and markdown-style links
- Fix cursor-past-match-end guard in `markdown_link_input_rule` preventing premature link conversion
- Fix plugin marketplace 404 by correcting default repo URL; improve error handling
