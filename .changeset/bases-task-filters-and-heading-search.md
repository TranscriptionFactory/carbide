---
"carbide": patch
---

Bases views that filter on a task column (`task_count`, `tasks_done`, `tasks_todo`, `next_due_date`) now work. The row query and the count query had drifted apart — only the row query carried the `task_agg` join — so any such view errored out at the SQL layer; and because filter values arrive as strings while the joined counts are integers, SQLite ranked every count below the threshold and matched nothing. Both are fixed, and the join now has a single definition shared by all three statements so they cannot drift again. Heading search no longer sorts every heading in the vault on each keystroke, and stops early once it has enough exact matches. A cancelled vault index no longer reports itself as completed, and no longer records the git revision as fully indexed; `sync_index_paths` in particular used to roll back and then try to commit, surfacing a cancellation as an index failure.
