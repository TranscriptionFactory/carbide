---
"carbide": patch
---

DSL query/base autocomplete now sources note-name suggestions from the search index instead of a full-vault file walk. Suggestions are always fresh — newly created or renamed notes appear immediately — and there is no first-use lag on large vaults.

Vault loading also does less disk work: note metadata (title, blurb, color/icon/type) is now derived from a single read of each note's head instead of reading the file three times.
