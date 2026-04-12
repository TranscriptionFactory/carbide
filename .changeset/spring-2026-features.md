---
"carbide": minor
---

### Search Graph

- Full search graph tab: domain types, subgraph extraction, store, service methods, actions, DI wiring, UI components, command palette entry, and keybinding
- Visual enhancements: color-coded nodes, score-based sizing, folder clustering
- Reactivity and macOS hotkey fixes

### Graph

- Smart link edges rendered with dashed lines and hover provenance
- Smart link edges added to graph data model

### Plugin System

- `network.fetch` and `ai.execute` RPC namespaces for plugins
- RPC timeouts, rate limiting, and consecutive error budget
- Settings schema: textarea type, min/max, placeholder support
- Slash command contribution point
- Metadata-changed event bridge to plugin SDK
- AI and network namespace docs, permissions, and `allowed_origins`

### MCP Tools

- Tier 2: backlinks, outlinks, properties, references
- Tier 3: git_status, git_log, rename_note, plugin MCP bridge

### CLI

- Git, reference, bases, tasks, and dev CLI commands with backend routes
- Built-in termimad markdown renderer (replaces external glow dependency)

### Settings & UI

- Storage & Cleanup settings section
- Tool status cards in Settings > Tools
- Editor width standardized as CSS custom properties

### File System

- Symlinked files and folders supported in file explorer with full read+write
- Symlink safety guardrails on all WalkDir traversals

### Fixes

- Embedding pipeline CPU thrash resolved; Metal GPU support added
- `embed_sync` no longer cancels in-flight embeds
- Linked sources open in-app with file name as blurb
- Import linked source entries to reference library
