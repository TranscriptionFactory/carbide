---
"carbide": minor
---

### Features

- **Due date sentinels**: `due today` now resolves at query execution time via SQLite `date('now', 'localtime')` instead of at parse time, keeping saved and embedded queries fresh.

- **Relative date expressions**: Added `due this week`, `due next N days`, `due last week` with sentinel-based range filters resolved in Rust via SQLite date arithmetic.

- **Inclusive before/after**: `due before Friday` and `due after Monday` now use `<=` / `>=` instead of strict `<` / `>`.

- **Task panel DSL entry point**: Toggle button switches between simple text search and full DSL textarea with inline parse error display.

- **List view grouping**: Extracted shared `group_tasks()` function used by kanban, list view, and embedded query results. List view now renders group headers with label + count.

- **Sort controls**: Sort select (status, due date, path, text) with ascending/descending toggle in task panel toolbar.

- **Tag filtering**: `tag includes urgent` and `has tag` query expressions, implemented via text contains with auto-prepended `#`.

- **showCompleted as backend filter**: Hide-completed toggle now injects a filter atom server-side instead of client-side filtering.

- **Navigate to source note from embedded results**: Filename in embedded task query results is a clickable link that opens the source note.

- **Task count in header**: Badge displayed next to "Tasks" label when tasks > 0.

- **MCP connection details**: Added MCP connection details section for other agents.

- **In-app changelog**: Added changelog to in-app help guides.

### Fixes

- **Embedded task toggle**: Fixed double status cycle bug in embedded task query toggle.
