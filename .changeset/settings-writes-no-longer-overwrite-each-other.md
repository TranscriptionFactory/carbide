---
"carbide": patch
---

fix(settings): saving two settings at once no longer discards one of them

Saving a setting read the whole settings file, added the one key and wrote the file back, with
nothing stopping two of those cycles from overlapping. Two settings changed at the same moment
could end with one of them silently discarded — the write appeared to succeed and the value was
back to its old state on the next read. Those writes are now serialized.

Reading or writing a setting also no longer occupies a background worker while it waits on the
disk. This matters most for per-vault settings, which live inside the vault folder itself and so
sit on the same cloud-synced storage that could stall vault open.
