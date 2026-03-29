---
"carbide": minor
---

### File tree blurbs
- AI-generated note descriptions displayed inline in the file tree
- Configurable blurb position (below heading, below caption) and toggle in Layout settings
- Markdown formatting stripped from blurbs for clean display

### Theme & CSS token editor
- New CSS token reference tab with inline editing and revert
- Theme-aware source editor styling

### Editor improvements
- Split view mode with dedicated toggle
- Heading markers toggle for visual editor
- Cursor sync fixes in split editor
- Escape key clears lightbulb decoration without dismissing dropdown
- Editor status persistence across sessions

### Settings
- Spell check toggle for rich and source editors
- Terminal customization options
- Reference manager UI wiring

### IWE dynamic transforms
- Dynamic AI provider substitution for IWE transforms
- Config-driven transform actions wired from IWE settings
- Config reset properly reapplies provider and guards redundant restarts
- Open config reveals in file manager

### LSP
- Proper client capabilities and config logging
- Undoable code actions
