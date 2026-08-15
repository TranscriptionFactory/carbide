---
"carbide": patch
---

Show an applied AI proposal in the editor without reopening the tab

Accepting a proposal that targeted a note changed the file on disk, but the open
editor kept showing the old text. Closing the tab and reopening it was the only
way to see what had been applied — the edit had happened, it just wasn't
visible. Proposals targeting an open document already updated in place; notes
did not.

Accepting now reconciles the open note with what was written, using the same
rules the assistant's agent mode already followed for the files it edits.

If the note has unsaved edits of its own, accepting no longer replaces them
silently. The tab is marked as changed on disk and you decide which side to
keep, exactly as when something outside Carbide edits a note you are working on.

Accept also tells you when it did not apply anything. A proposal whose note
changed after the draft was made is now reported as out of date instead of
quietly landing in the review centre as stale, and a write that fails is
reported with its reason rather than being recorded as applied.
