---
"carbide": patch
---

Keep a chosen retrieval token budget across restarts, and stop saves from
re-indexing excluded files

Picking a specific retrieval context budget in AI settings appeared to save, but
the value was dropped the next time settings loaded and the setting reverted to
Automatic — so the explicit half of that control had never actually worked.
Stored values are now validated against the type the setting declares rather
than against a default it does not have, so an explicit budget survives a
restart while Automatic still stays Automatic.

Saving a hidden or ignored file no longer puts it back into the search index.
Indexing now applies the same exclusion rule on the save path that a vault scan
applies, so a dotfile note edited with hidden files shown does not produce
search hits that appear after every save and disappear at the next sync; any row
left over from an earlier save is removed.

When settings fail to persist, the underlying reason for each key is now written
to the log instead of being discarded, so a failure is diagnosable from the log
rather than only from the list of key names shown in the dialog.
