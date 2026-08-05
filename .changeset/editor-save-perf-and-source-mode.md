---
"carbide": patch
---

Editor and save-path fixes: source mode no longer renders in the bottom half of the pane (the hidden visual row kept its flex slot); saving no longer triggers a spurious vault tree refresh + index sync from the watcher echo of our own atomic writes; and markdown serialization moved off the keystroke path onto a debounced idle task with a forced flush on every save read, removing the per-keystroke O(document) main-thread cost on large notes.
