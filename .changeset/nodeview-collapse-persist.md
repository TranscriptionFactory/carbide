---
"carbide": patch
---

fix(editor): persist collapsed state of code/query/mermaid blocks across note reopen and app restart

The `collapsed` node attr shared by all `code_block`-based views (plain code, mermaid, smart-block queries) was never serialized, so a folded block sprang back open on save→load. It now round-trips through the fence meta string (like the existing `preview` token), giving reopen- and restart-persistence via a single serialize/parse path.
