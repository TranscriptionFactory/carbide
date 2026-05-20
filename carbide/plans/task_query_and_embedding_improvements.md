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

## Phase 2: Task Panel UI ✅ DONE

Shipped in commits `bd7849e4` (group_tasks refactor), `283d77bd` (DSL + grouping + sort), `75ab6347` (backend filter).

### Item 1 — Query DSL entry point (Critical) ✅

**Problem**: The full boolean/date query DSL has no user-facing entry point. The task panel only exposes text search + grouping + hide-completed.

**What changed**:
- Toggle button (Code icon) next to search input switches between simple search and DSL textarea
- DSL textarea parses via `parse_task_query()`, executes directly via `taskService.queryTasks()`
- Parse errors displayed inline below textarea
- DSL grouping respected in list view
- Added `queryMode` and `queryText` to `TaskStore`

### Item 4 — Grouping in list view (High) ✅

**Problem**: The grouping `<select>` appears in list view but has no effect — tasks render flat.

**What changed**:
- Extracted shared `group_tasks()` into `domain/group_tasks.ts` with `TaskGroup` type
- Refactored kanban view (`derive_kanban_columns`) and code block plugin (`render_task_query_results`) to use shared function
- List view renders group headers with label + count when grouping !== "none"
- 7 unit tests for `group_tasks` covering all grouping types

### Item 5 — Sort controls (High) ✅

**Problem**: The query language supports `sort by` but there's no sort UI in the task panel.

**What changed**:
- Sort select (None / Status / Due Date / Path / Text) + ascending/descending toggle in toolbar
- Updates `taskStore.sort`, triggers re-query

### Item 10 — Task count in header (Low, trivial) ✅

- Task count badge displayed next to "Tasks" label when tasks > 0

---

## Phase 3: Embedded Query + Tags — PARTIALLY DONE

### Item 8 — Tag filtering (Medium) ✅

Shipped in commit `8a9b5629`.

**What changed**:
- `tag includes urgent` → `{ property: "text", operator: "contains", value: "#urgent" }`
- `has tag` → `{ property: "text", operator: "contains", value: "#" }`
- Note: tag names should not include `#` in the query (stripped as comment); hash is auto-prepended
- 3 unit tests added

### Item 11 — `showCompleted` as backend filter (Low) ✅

Shipped in commit `75ab6347`.

**What changed**:
- Simple mode: injects `{ property: "status", operator: "neq", value: "done" }` into store filter
- DSL mode: wraps parsed query filter with AND containing the hide-done atom
- Removed client-side `filteredTasks` derivation
- `showCompleted` toggle triggers re-query via `$effect` dependency

### Item 6 — Navigate to source note from embedded results (Medium)

**Problem**: Embedded task query results show filename but there's no click handler to navigate.

**Status**: Not started. Requires threading action registry through prosemirror_adapter → code_block_view_plugin callback chain.

**Approach**:
- Add `open_note: (path: string, line_number: number) => void` to `TaskQueryCallbacks` in `code_block_view_plugin.ts`
- Make the meta element (filename) clickable with appropriate cursor styling
- Wire in `prosemirror_adapter.ts` via action registry (`ACTION_IDS.note_open`)

**Files**:
- `src/lib/features/editor/adapters/code_block_view_plugin.ts` — add callback, wire click handler
- `src/lib/features/editor/adapters/prosemirror_adapter.ts` — implement `open_note` callback

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
