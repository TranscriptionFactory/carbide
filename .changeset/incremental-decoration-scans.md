---
"carbide": patch
---

Long notes no longer re-scan the whole document on every keystroke for block-id, tag and task decorations: each edit rebuilds only the blocks it touched, and a caret move only revisits the blocks on either side of it. Diagnostics stay responsive while typing, because a publish now builds its markdown-to-document mapping index in a single walk and waits for the serialized snapshot instead of decorating a document that has moved on.
