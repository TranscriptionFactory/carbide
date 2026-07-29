---
"carbide": patch
---

fix: clip dialog folder candidates + Cmd+Q unsaved-changes guard

- **Web clip dialog**: opening the dialog now lists the vault's folders, so the Location field offers the whole folder tree and drill-down works instead of showing only the vault root; Shift+Enter leaves the folder suggestions and returns to the URL field, matching the Save As dialog.
- **Quit guard**: Cmd+Q from the app menu used to terminate the process natively, discarding unsaved changes without a prompt. It now routes through the same unsaved-changes confirmation as the window close button and the tray's Quit Carbide.
