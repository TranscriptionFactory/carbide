---
"carbide": patch
---

Saving a note no longer raises a spurious "modified externally" card. Carbide watches the vault so it can react to edits made outside the app, and it muted the filesystem event caused by its own save — but only one such event. A single save rarely produces exactly one: the watcher flushes a pending change event as soon as a structural event for the same path arrives, so one save could be delivered as two, and on macOS a save surfaces as several separate notifications. The extra delivery arrived unmuted, Carbide read its own save as somebody else's edit, and if the note had unsaved changes it raised a conflict card that offered to discard them. Typing while autosave ran made this the ordinary case rather than a rare one.

Carbide now recognises its own writes by what it wrote rather than by counting events: a save records the modification time it produced, and every echo of that save reports the same time and is ignored, however many arrive. An edit from anywhere else carries a different time and still raises the card immediately — that path is unchanged, and deliberately so, since silently swallowing a real external edit would be the worse failure.

Renaming or deleting a note from inside Carbide also no longer produces a spurious card or closes a tab unexpectedly; those operations previously muted nothing at all. Muting is now specific to the operation that armed it, so an internal rewrite of a file cannot hide somebody else's deletion of it.

The two places that raise the card now log distinctly, with the event type and how long ago Carbide last wrote the path, so a future report of this symptom can be read from the log rather than reconstructed.
