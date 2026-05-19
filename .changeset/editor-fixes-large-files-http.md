---
"carbide": patch
---

### Editor fixes

- Preserve cursor position when switching between visual and source mode
- Use block-anchor for stable cursor position across mode toggles
- Allow Ctrl+Shift selection across callout/details blocks

### Linked source resolution

- Resolve linked source paths in wiki link navigation
- Resolve linked source PDF paths in citation picker and editor embeds

### AI provider

- Preserve AI result when switching providers

### Large files

- Show file size and "Load anyway" button for files exceeding 5 MB

### Infrastructure

- Start HTTP server unconditionally at app launch
