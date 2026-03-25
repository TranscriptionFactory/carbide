---
"carbide": minor
---

### Reskinning Prototypes

- Bases panel UI with actions for base management
- LSP results panel redesign with expanded code action support
- IWE results panel streamlined; actions moved to service layer
- New hotkey bindings for bases and LSP features

### Linked Sources

- Refactored linked source watcher from event-driven to pull-based file listing
- Fixed linked source PDFs failing to load in content pane viewer — absolute file paths are now served via a `file` prefix in the `carbide-asset://` protocol

### UX

- Changed folder-to-filename shortcut from Shift+Tab to Shift+Enter
