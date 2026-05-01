---
"carbide": minor
---

### Collapsible node views

- Code blocks, file embeds, and note embeds now support a collapse toggle
- Collapse state is persisted via ProseMirror node attributes

### Image drag-to-resize

- Dropped images now have a drag handle for resizing

### Plugin system enhancements

- Bridged action registry to plugin RPC system
- Added plugin icon registry with ~50 curated Lucide icons
- Fixed `vault.read` RPC to return markdown string instead of NoteDoc object

### Source mode (CodeMirror) improvements

- LSP hover and completion support in source mode
- Fixed diagnostic tooltip, hover flicker, and completion paths
- Prevented duplicate LSP hover tooltip on wiki links
- Fixed lifecycle crash when switching to source mode

### Editor polish

- Task checkbox no longer reverts to bullet after multiple toggles
- Codeblock list layout and table toolbar dismiss fixes
- Nodeview collapse requires single click, fixed sticky focus
- Added remark parse plugin for wikilink embeds (`![[...]]`)

### Performance & startup

- Decoupled startup from blocking dialog and deferred heavy rescan
- Git history no longer hangs for single document

### UI fixes

- Use file-text icon for smart-templates sidebar panel
