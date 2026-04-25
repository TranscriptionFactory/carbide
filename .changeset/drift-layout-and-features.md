---
"carbide": minor
---

### Drift layout variant

- Added new "Drift" layout with overlay-first design, floating activity dock, and transparent editor canvas
- Iterative fixes: sidebar/dock alignment, grid coverage, keyframe scoping, backdrop removal, editor pane isolation

### Daily notes

- Full daily notes feature: settings, sidebar view, app integration, tests
- Configurable subfolder structure (e.g. `YYYY/MM`) and name format via settings UI
- "Open Today's Note" command palette entry with hotkey
- Fixed daily note that exists on disk but not in store

### Task query DSL

- New task query DSL parser with slash command integration
- TaskQueryState in CodeBlockView, callbacks wired through editor extension system
- CSS styles for task query results

### Source control panel

- Git staging state and `commit_staged` action
- Working-tree diff viewer
- Collapsible section extraction, layout cleanup
- Fixed duplicate source control panel, restored activity bar in lattice layout

### Lattice layout

- New lattice layout variant with title bar and right panel
- Vertical icon strip replacing context rail tab bar, overlay panel
- AI assistant moved from context rail to bottom panel with two-column layout

### Theme system overhaul

- Converted all builtin themes to `ThemeBlueprint` + `expand_blueprint`
- Added V4 CSS token aliases (`--fg-2`, `--glass`, `--accent-glow`, `--on-accent`)
- `generate_ui_tokens()` with surface params and precedence tests
- Hardcoded oklch values replaced with token references
- New Obsidian Dark theme with glass/grain/glow variant

### Query panel

- "View as graph" button added to query panel
- Documented `?` prefix for query syntax

### Folder suggest

- Drill into subfolders when selecting a parent folder in suggest

### Search improvements

- Sort/filter controls and date/source/extension metadata on search graph result list
- Prefix matching in FTS search queries
- Word-order-insensitive fuzzy scoring

### Other fixes and improvements

- Table layout toggle (fit content / full width), toolbar dismissal on blur
- Inline AI panel dismissible via Escape in all modes
- Generic suggest plugin factory extraction
- Bundled plugins shipped with Carbide
- Vault startup parallelized for non-blocking init
- Remark/image/paste bug fixes
- Sidebar icons updated for tags and bases
