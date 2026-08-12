---
"carbide": patch
---

Renaming a note shortly after saving it no longer risks losing the file.

Carbide commits your work automatically a few seconds after a save, and it queued the *paths* it was going to commit rather than resolving them at commit time. Renaming a note inside that window left a queued path pointing at a file that no longer existed, and the commit stage treated "no file here" as "the user deleted this" — so an automatic commit labelled `Update:` could stage a deletion of the note you had just renamed. The renamed file was never queued at all, because a rename produces no save, so it stayed untracked and a later "Discard All" would delete it outright.

Automatic commits can no longer stage a deletion under any circumstances; that is now reserved for the explicit delete path. Queued paths are re-checked against the vault at commit time, and a rename inside the window moves the queued entry onto the new name, so the file that actually exists is the one that gets committed and tracked.

Two related fixes. In interval mode, a commit now lands on schedule instead of being pushed further out by every save — previously, continuous work could postpone an automatic commit indefinitely. And concurrent commits no longer overwrite each other: a commit verifies the branch is where it expected before moving it.

Finally, saving a note whose file changed on disk behind Carbide's back no longer silently overwrites those changes. Closing or quitting with such a note open now stops and asks, offering to overwrite the disk copy, discard your version, or cancel — and quitting waits for that answer rather than writing over the file on its way out. The two places that save without a user present, link repair and window restore, now skip the write and log it instead of forcing it through.
