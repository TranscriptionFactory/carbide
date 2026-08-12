---
"carbide": patch
---

An agent turn can no longer revert your own edits, or edits you refused.

Every agent turn ended by restoring each file the agent had touched back to a checkpoint taken before the turn. That restore was unconditional, and it had two ways of destroying work. If you edited one of those notes while the turn was still running, the restore wrote the pre-turn content over your edit — the end-of-turn comparison could not tell your bytes from the agent's, so it reverted both. And a tool you *denied* still had its file reverted: the agent announces which files a tool intends to touch before asking your permission, and it repeats that list when the tool finishes, including when the tool never ran because you said no. Carbide was not checking whether the tool succeeded, so refusing an edit could still lose the version you were protecting.

Both are closed. Carbide now records each file's modification time at the moment the agent last successfully wrote to it, and the restore refuses any file that changed on disk afterwards — your edit stays, and the turn reports the note as kept rather than proposed. Files belonging to tools that failed or that you denied are excluded from the restore entirely, while the vault refresh still accounts for them, so a partially completed write does not leave the file tree stale.

Two smaller hardening changes ride along: the CLI's `git restore` route now requires an explicit confirmation flag, matching the discard route it sits beside, and restoring a file refuses when the working copy differs from the last commit rather than overwriting it. That second change also applies to restoring a version from the history panel.
