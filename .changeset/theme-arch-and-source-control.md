---
"carbide": minor
---

### Theme architecture and layout variants
- Added Obsidian Dark theme with glass/grain/glow layout variant
- Added lattice layout variant with title bar and right panel

### Source control panel
- Added source control sidebar panel with git staging state and commit action
- Added working-tree diff viewer with inline unified diff display
- Extracted CollapsibleSection component for reuse across sidebar panels

### AI assistant layout
- Moved AI assistant from context rail to bottom panel with two-column layout
- Replaced context rail tab bar with vertical icon strip and overlay panel

### Search graph enhancements
- Added date/source/extension metadata to search graph nodes
- Added sort/filter controls to search graph result list

### Editor improvements
- Added table layout toggle (fit content / full width)
- Shipped bundled plugins with Carbide

### Welcome dialog polish
- Added key shortcuts inline in welcome dialog step 2
- Added built-in feature pills (Mermaid Diagrams, etc.) to welcome screen
- Removed hero tagline, consolidated into feature pills
- Renamed Open Notes to Omnifind in welcome shortcut list

### Fixes
- Fixed inline AI panel dismissibility via Escape in all modes
- Fixed FTS search to use prefix matching in queries
- Fixed table toolbar dismissal when editor loses focus
- Fixed duplicate source control panel and restored activity bar in lattice layout
