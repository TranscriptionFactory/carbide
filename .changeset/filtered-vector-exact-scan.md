---
"carbide": patch
---

Fixed a bug where a date-scoped chat/ask retrieval could silently drop notes that should have matched. Folder, tag, base and note scopes on retrieval now filter search results on the index itself instead of over-fetching and filtering afterward, so a narrow scope whose matches would previously rank outside the search window is now found.
