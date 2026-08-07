---
"carbide": minor
---

The filesystem watcher no longer loses external edits or orphans renamed notes. Rapid successive writes from an external editor or sync client used to be dropped outright when they landed within half a second of one another; they are now trailing-edge debounced, so the last write always reaches the app (and no write waits longer than 750ms). Renaming a note or folder outside Carbide is now reported as a removal plus an addition instead of two "changed" events, so the old path stops lingering in the search index and the file tree refreshes for renamed folders. Deleting a note that has unsaved changes now marks the tab as conflicted instead of silently discarding the buffer, matching how external modifications already behave.
