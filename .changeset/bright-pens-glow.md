---
"badgerly": minor
---

Plugin system and markdown lint infrastructure

- Plugin lifecycle with load/unload, settings UI, iframe sandboxing, and event system
- Markdown linting via rumdl LSP sidecar with real-time diagnostics and gutter markers
- CodeMirror lint integration with inline diagnostics and fix-all action
- VS Code-style problems panel in tabbed bottom bar (terminal + problems)
- Format-on-save with configurable formatter (rumdl or Prettier)
- Format-now action (Cmd+Shift+F) and bottom toolbar lint status indicator
- Sidecar download wired into build pipeline with platform-specific hashing
- Fix: CLI fallback for format operations, LSP path resolution, format-on-save loop prevention
- Fix: prevent rumdl config files from leaking into browsed folders
- Fix: source mode effects now re-run after CodeMirror mounts (reactive view_mounted flag)
- Fix: sync ProseMirror and source editor views after lint format/fix edits
