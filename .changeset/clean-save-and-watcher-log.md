---
"carbide": patch
---

Saving a note whose buffer is already clean no longer rewrites the file. A redundant write bumped the mtime and fanned out a burst of watcher events for nothing; "Keep my changes" on the conflict card still overwrites the disk. The watcher's self-write suppression log now records the event kind and mtime so repeated events can be traced to a save or an external touch, and `read_note` no longer logs at info on every note open.
