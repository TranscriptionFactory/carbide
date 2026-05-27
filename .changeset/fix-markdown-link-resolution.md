---
"carbide": patch
---

Fix markdown links with alt text (e.g. `[text](path/to/note.md)`) resolving incorrectly in nested folders. They were using vault-global lookup like wikilinks instead of resolving relative to the current file per standard markdown semantics.
