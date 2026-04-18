---
"carbide": minor
---

### Features

- **Callout blocks**: Full callout block support — remark plugin, ProseMirror schema/node view, slash commands, foldable toggle, keymap navigation, Backspace deletion, and drag handle
- **Block operations**: Turn-into, duplicate, delete operations; content-visibility optimization; multi-block selection
- **Code editor improvements**: markdown-it port with insert handle, focus mode, language memory, fallback parse; Tab/Shift-Tab indent in both editors; focus and scroll to cursor on source→visual switch
- **LSP enhancements**: Toggle UI controls, inline diagnostics in visual editor, LSP-sourced suggestion labels, code document sync and language server operations, position mapping and tooltip improvements, Cmd+. hover at cursor
- **Graph view**: "View as graph" action in omnibar search results; Phase 4 performance — degradation profiles, edge sampling, degree sizing
- **References pane**: Flat/by-source/tree view modes
- **File explorer**: Setting to hide @linked sources from tree
- **Plugin system**: Sidebar panel rendering with live iframe UI, plugin lifecycle activation, Smart Templates plugin, SDK extensibility — all 42 RPC methods exposed
- **Terminal & editing**: Native xterm defaults; Paste HTML as Markdown command; within-document anchor link scrolling
- **Theming**: Removed unused themes; lightened default dark mode
- **Offline**: Bundled fonts for offline use

### Fixes

- Fixed multiple tab-switch bugs: source editor dirty state, cursor restoration, stale content, visual editor persisting after last tab closed, source-mode edits lost
- Fixed frontmatter loss on selectAll and undoable doc replacements
- Fixed invisible blocks after Enter in visual editor
- Fixed Cmd+. code actions conflict and diagnostic tooltip labels
- Fixed missing linked-sources toggle and broken catalog categories
- Fixed LSP & plugin coexistence: block ref handoff, hover panel routing
