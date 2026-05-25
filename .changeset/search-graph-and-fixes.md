---
"carbide": minor
---

### Features

- **Search graph multi-select and filtering**: Cmd/Ctrl+click to toggle individual node selection, Shift+click for range selection. Added toolbar controls for hiding neighbor nodes and filtering by minimum score threshold. Canvas export respects multi-selection.

### Fixes

- **Mermaid fullscreen close controls**: Added floating toolbar with zoom, export, and close button to fullscreen mermaid view. Escape key also exits fullscreen.

- **Mermaid diagram drag and sizing**: Removed CSS transition during drag to eliminate lag/jitter, removed max-width constraint for natural SVG sizing, added vertical resize and fullscreen expand/collapse.

- **Terminal WebGL error suppression**: Scoped error interceptor catches xterm WebGL addon errors from advanced escape sequences, disposes the addon (falling back to canvas), and prevents error toast spam.
