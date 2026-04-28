---
"carbide": minor
---

### Help guides

- Added Guides section to Help dialog with categorized, searchable help articles
- Guide data module with keyboard shortcuts, markdown syntax, and navigation guides

### Note embeds

- New `note_embed` schema node for `![[note]]` syntax
- Block suggest mode with editor_service block handling
- Note embed detection, rendering, serialization, and CSS
- Wired note_embed through lazy adapter, prod ports, and full scan
- Fixed note embed converting while cursor is inside brackets

### Fixes

- Auto-update CLI symlink on server start
- Removed duplicate `cat` visible_alias in CLI
- Allow empty daily notes folder (vault root)
- Resolve linked source PDFs from omnibar/graph views
