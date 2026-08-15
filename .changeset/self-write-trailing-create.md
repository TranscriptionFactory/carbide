---
"carbide": patch
---

Stop every save from triggering a file-tree refresh and an index sync

Saving a note produces more than one filesystem event, and Carbide recognised
only the first of them as its own. The trailing event — the one the atomic write
produces when it moves the finished file into place — looked like somebody else
had touched the note, so each save also refreshed the file tree, re-synced the
note into the index, and refreshed the task list.

That event now reports the same modification time as the write that produced it,
which is how Carbide already recognises its own saves, so it is matched rather
than acted on. A note genuinely created or replaced on disk by something else
still reports a different time and is still picked up.
