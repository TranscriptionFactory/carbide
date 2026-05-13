---
"carbide": minor
---

### Bases improvements

- Add search, filter, and sort capabilities to bases views
- Fix file-type routing in bases and add expand-to-tab view
- Extract `BASES_TAB_ID`/`TITLE` to domain constant
- Review fixes: `$derived.by`, state sync, deduplicate filter upsert

### Editor fixes

- Fix table toolbar appearing in source mode and blocking text selection
- Fix folder autocomplete drill-down staying open after selection

### Inline AI

- Auto-focus the "Ask AI to write" textarea when the inline AI menu opens
- Re-focus the textarea when pressing Cmd+Shift+I while the menu is already open
