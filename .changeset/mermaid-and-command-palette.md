---
"carbide": minor
---

### Features

- **Mermaid diagrams in slides export**: Mermaid code blocks are now rendered as diagrams when exporting to slides.

- **Vault graph and neighborhood canvas exports in command palette**: Added commands to export vault graph and neighborhood canvas directly from the command palette.

### Fixes

- **Mermaid SVG export uses Tauri save dialog**: Mermaid SVG export now uses the native Tauri save dialog instead of a browser download.

- **Command palette caret and mermaid zoom/pan/export**: Fixed command palette caret positioning and mermaid diagram zoom, pan, and export interactions.

- **Last list item bottom margin**: Removed extra bottom margin from the last paragraph in the last list item for cleaner spacing.
