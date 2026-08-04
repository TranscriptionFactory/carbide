---
"carbide": patch
---

Fixed four assistant and omnibar defects, and made the status-bar assistant chip legible.

Inline AI edits no longer fail with "undefined is not an object" when vault context is
enabled. The search index carries no note summary, so every backlink, outlink and
similar-note reference reached the prompt assembler without one; the adapter now
supplies an empty summary instead of passing `undefined` through.

Non-streaming CLI providers such as Codex work in Ask again. They were refused unless a
note was open, but the one-shot call writes to a temporary file and runs in the vault
directory — it never needed a note. Only an open vault is required now, and the message
says so.

Failed assistant runs can be dismissed. The runs popover gained a "Clear finished"
action that discards finished and failed records while live runs keep streaming;
previously errors accumulated with no way to clear them.

Switching between omnibar Search and Ask carries what you typed across the switch in
both directions, instead of making you retype it. The mode segment now shows its
shortcut.

The status bar assistant chip reads "Ready" at the status bar's own text colour rather
than a dimmed muted grey on an already-recessive surface.
