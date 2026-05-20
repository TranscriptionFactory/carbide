# Task Query & Embedding Improvements

## Context

Evaluation of the task query language, embedded task rendering, and task panel UI identified several functional gaps. The double-cycle bug in embedded task toggle has been fixed (commit `bcc695fc`). This plan covers the remaining improvements in priority order.

## Phase 1: Query Foundation ✅ DONE

Items 2 + 3 + 9 all touch the parser (`parse_task_query.ts`) and Rust SQL builder (`service.rs`) — shipped in commits `f5bf1c4a` and `3ebca5e5`.

### Item 2 — `due today` sentinel (Critical) ✅

**Problem**: `parse_date_comparator` resolves `due today` to a fixed `YYYY-MM-DD` at parse time. Saved queries and embedded `tasks` code blocks become stale immediately.

**Approach**:
- Parser returns `"__today__"` sentinel string instead of calling `new Date()`
- Rust `build_atom_sql` substitutes `date('now', 'localtime')` (SQLite function) when it encounters the sentinel — resolves at query execution time
- No changes to `TaskFilter` type needed — `value` is already a string

**Files**:
- `src/lib/features/task/parse_task_query.ts` — return `"__today__"` sentinel
- `src-tauri/src/features/tasks/service.rs` — handle sentinel in `build_atom_sql`
- `tests/unit/domain/parse_task_query.test.ts` — update `due today` test to assert sentinel

### Item 3 — Relative date expressions (High) ✅

**Problem**: Only `due today` and fixed dates work. `due this week`, `due next 7 days`, `due last week` are the most common task queries.

**Approach**:
- Extend `parse_date_comparator` to recognize relative patterns and produce sentinel-based filter expressions:
  - `due this week` → AND range: `due_date >= __week_start__` AND `due_date <= __week_end__`
  - `due next N days` → AND range: `due_date >= __today__` AND `due_date <= __today_plus_N__`
  - `due last week` → AND range with `__last_week_start__` / `__last_week_end__`
- Refactor `parse_atom` return type from `TaskFilter | string` to `FilterExpr | string` to support range expansions cleanly
- Rust resolves sentinels via SQLite date arithmetic:
  - `__week_start__` → `date('now', 'localtime', 'weekday 0', '-6 days')`
  - `__week_end__` → `date('now', 'localtime', 'weekday 0')`
  - `__today_plus_N__` → `date('now', 'localtime', '+N days')`

**Files**:
- `src/lib/features/task/parse_task_query.ts` — new date patterns, refactor `parse_atom` return type
- `src-tauri/src/features/tasks/service.rs` — sentinel resolution in `build_atom_sql`
- `tests/unit/domain/parse_task_query.test.ts` — tests for each relative date expression

### Item 9 — Inclusive `before`/`after` (Medium, cheapest to do here) ✅

**Problem**: `due before Friday` uses strict `<`, excluding Friday. Most users expect inclusive behavior.

**Approach**:
- Change `parse_date_comparator`: `before` → `lte`, `after` → `gte`
- Rust `build_atom_sql` already handles `lte`/`gte` correctly
- 0 users, clean break acceptable per AGENTS.md

**Files**:
- `src/lib/features/task/parse_task_query.ts` — change `op_map`
- `tests/unit/domain/parse_task_query.test.ts` — update assertions

---

## Phase 2: Task Panel UI

### Item 1 — Query DSL entry point (Critical)

**Problem**: The full boolean/date query DSL has no user-facing entry point. The task panel only exposes text search + grouping + hide-completed.

**Approach**:
- Add a toggle button next to the search input that expands it into a multi-line `<textarea>` for raw DSL entry
- In query mode, textarea value parsed via `parse_task_query()` — resulting `TaskQuery` passed directly to `taskService.queryTasks()`
- Parse errors displayed inline below the textarea
- Simple search mode unchanged for quick text filtering
- Grouping select and showCompleted toggle layer on top as additional filter atoms

**Files**:
- `src/lib/features/task/ui/task_panel.svelte` — toggle, textarea, parse+execute logic
- `src/lib/features/task/state/task_store.svelte.ts` — add `query_text: string` field

### Item 4 — Grouping in list view (High)

**Problem**: The grouping `<select>` appears in list view but has no effect — tasks render flat.

**Approach**:
- Extract shared `group_tasks(tasks: Task[], grouping: TaskGrouping): Map<string, Task[]>` into `domain/group_tasks.ts`
- Refactor kanban view and code block plugin to use it (eliminate three-way duplication)
- List view renders group headers when grouping !== "none"

**Files**:
- New: `src/lib/features/task/domain/group_tasks.ts`
- `src/lib/features/task/ui/task_panel.svelte` — use `group_tasks` for list view
- `src/lib/features/task/ui/kanban_view.svelte` — refactor to use shared function
- `src/lib/features/editor/adapters/code_block_view_plugin.ts` — refactor to use shared function
- Tests for `group_tasks` with each grouping type

### Item 5 — Sort controls (High)

**Problem**: The query language supports `sort by` but there's no sort UI in the task panel.

**Approach**:
- Sort `<select>` (None / Status / Due Date / Path / Text) + direction toggle in the toolbar
- Updates `taskStore.sort`, triggers re-query (already wired in `build_query`)

**Files**:
- `src/lib/features/task/ui/task_panel.svelte`

---

## Phase 3: Embedded Query + Tags

### Item 6 — Navigate to source note from embedded results (Medium)

**Problem**: Embedded task query results show filename but there's no click handler to navigate.

**Approach**:
- Add `open_note: (path: string, line_number: number) => void` to `TaskQueryCallbacks` in `code_block_view_plugin.ts`
- Make the meta element (filename) clickable with appropriate cursor styling
- Wire in `prosemirror_adapter.ts` via action registry (`ACTION_IDS.note_open`)

**Files**:
- `src/lib/features/editor/adapters/code_block_view_plugin.ts` — add callback, wire click handler
- `src/lib/features/editor/adapters/prosemirror_adapter.ts` — implement `open_note` callback

### Item 8 — Tag filtering (Medium)

**Problem**: Tasks often have inline tags (`#urgent`) but the DSL has no `tag` clause.

**Approach**:
- `tag includes urgent` → `{ property: "text", operator: "contains", value: "#urgent" }`
- `has tag` → `{ property: "text", operator: "contains", value: "#" }`
- Zero schema changes — reuses `text LIKE`

**Files**:
- `src/lib/features/task/parse_task_query.ts` — add tag clause parsing
- `tests/unit/domain/parse_task_query.test.ts` — tests

### Item 11 — `showCompleted` as backend filter (Low)

**Problem**: Client-side filtering via `filteredTasks` derivation. Interacts poorly with `limit`.

**Approach**:
- Inject `{ property: "status", operator: "neq", value: "done" }` into the query when `showCompleted === false`
- Remove client-side `filteredTasks` filter
- Couples naturally with Item 1 (DSL UI)

**Files**:
- `src/lib/features/task/ui/task_panel.svelte`

---

## Phase 4 : Saved Views & Polish

### Item 7 — Saved task views (Medium)

**Problem**: General queries have saved `.query` files. Task queries have no equivalent.

**Approach**:
- Store in `.carbide/task-views/` as JSON: `{ name, query_text, grouping, sort }`
- Save/load UI in task panel (save button when in DSL mode, dropdown for saved views)
- Port methods: `loadTaskViews`, `saveTaskView`, `deleteTaskView`
- Depends on Phase 1 (sentinels) + Phase 2 (DSL UI)

**Files**:
- New: `src/lib/features/task/domain/task_view.ts` — type
- `src/lib/features/task/ports.ts` — new port methods
- `src/lib/features/task/adapters/task_tauri_adapter.ts` — IPC implementation
- `src-tauri/src/features/tasks/mod.rs` — new commands
- `src/lib/features/task/ui/task_panel.svelte` — save/load UI
- `src/lib/features/task/state/task_store.svelte.ts` — `saved_views` state

### Item 10 — Task count in header (Low, trivial)

- Display count next to "Tasks" label in `task_panel.svelte`

---

## Dependency Graph

```
Phase 1 (sentinels + dates) ──→ Phase 2 (DSL UI needs sentinels to be useful)
Phase 2 (DSL UI) ──→ Phase 4 (saved views needs DSL UI)
Phase 3 (embedded + tags) ──→ independent, can ship anytime
Phase 4 (saved views) ──→ last
```

## Key Decisions

1. **Sentinels resolved in Rust** — parser stays pure and testable, embedded/saved queries stay fresh
2. **Textarea over filter builder** — full DSL power, fraction of the complexity; visual builder can layer on later
3. **Tag filtering via `text LIKE`** — no schema migration, fast enough for typical vault sizes (<10K tasks)
4. **Inclusive `before`/`after`** — breaking change acceptable per 0-user policy
5. **Shared `group_tasks` function** — eliminates three-way duplication of grouping logic
