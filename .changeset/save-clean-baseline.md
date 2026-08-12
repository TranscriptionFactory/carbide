---
"carbide": patch
---

Typing while a note saves no longer risks losing those keystrokes.

When a save finished, Carbide marked the buffer clean against whatever text the editor had most recently handed to it — not against the bytes it had actually written to disk. Those two can differ. Serialising the editor's document is deferred slightly, so a save that takes longer than that delay writes one version and then baselines a newer one. The buffer went clean over content that had never been written, autosave stops re-firing once a buffer is clean, and the next automatic commit captured the older file.

A save now baselines exactly the bytes it wrote, and then re-checks the live document. If you kept typing during the write, the buffer stays dirty — correctly, because what you see genuinely differs from what is on disk — and the next autosave picks it up.

The check reads from whichever surface is actually live, so this behaves correctly in source mode and split view, where the rich-text document is intentionally not the authority.
