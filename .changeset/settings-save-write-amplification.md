---
"carbide": patch
---

Make switching the file-tree tab (Tree / Folders / Recents / Bases) fast again. Persisting any editor setting rewrote all 89 global-only keys as 89 separate `set_setting` invokes, each a full read-parse-rewrite of `settings.json` behind one process-wide lock — around 1.1s of blocking IO for a tab switch that changed one key. Only keys whose value actually moved since the last load or successful write are now sent, and a failed write still retries on the next save. `UIStore.set_editor_settings` also replaced the whole settings object, waking all 18 reactors that read any settings field, so an unrelated change restarted the lint and markdown language servers, the git timers and the terminals; it now merges field-wise so only the fields that changed wake their readers.
