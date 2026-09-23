---
"carbide": patch
---

Search graph fixes. A slower, older search can no longer overwrite a newer result, and neither can an expand or semantic-edge toggle that finishes after it. A new query clears the previous selection and expansions. The graph stays on screen with a "Searching…" overlay instead of being torn down on every query. Switching between search tabs no longer carries filters, selection or a pending search from one tab to another. Search tabs restored at startup now run their query, keep their id and active state, and save query edits. The smart-link toggle loads smart links when the vault graph hasn't. Dashed and search-graph edges are drawn with one stroke per style group instead of one per dash.
