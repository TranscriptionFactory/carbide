---
"badgerly": minor
---

Type-safe IPC, ProseMirror migration, find & replace, and theme redesign

- Add tauri-specta for type-safe IPC with 92 commands now having TypeScript bindings
- Eject Milkdown, migrate to pure ProseMirror with all 25+ plugins preserved
- Add find & replace to editor with Cmd+H toggle and replace-all in single transaction
- Redesign theme settings with two-tier UI, auto_palette system, and live preview
- Add Floating, Glass, Dense, and Linear builtin themes
- Add default timestamp name for new canvas dialog
- Make settings dialog resizable
- Add frontmatter toggle via slash command, command palette, and status bar
- Promote markdown AST to shared/, add note_headings and note_links tables
- Fix: wikilink cursor positioning, tag icon, git sync button, settings nav width
- Fix: use browse mode when opening files in non-vault folders
- Fix: canvas name input not expanding in save dialog
- Fix: restore slash commands, block input rules, and task checkboxes
- Fix: frontmatter null tag and duplicate block on visual-to-source switch
