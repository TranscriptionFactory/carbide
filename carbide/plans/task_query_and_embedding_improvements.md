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

## Phase 3: Embedded Query + Tags ✅ DONE

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

### Item 6 — Navigate to source note from embedded results (Medium) ✅

Shipped in commit `5a1a5768`.

**What changed**:
- Added `open_note?: (path: string) => void` to `TaskQueryCallbacks`
- Filename in embedded results is now a clickable link (dotted underline, hover highlight)
- Wired through `build_task_query_callbacks` → `on_internal_link_click` from session events
- CSS: `.task-query-file-link` with cursor pointer + dotted underline styling

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

## Phase 4 Implementation Prompt

```
Implement Phase 4 (Saved Task Views) from @carbide/plans/task_query_and_embedding_improvements.md

### What to build

Saved task views: persist DSL queries + grouping + sort as named views in the vault.

### Storage

- Path: `.carbide/task-views.json` (single file, array of views — simpler than a directory)
- Type: `{ id: string, name: string, query_text: string, grouping: TaskGrouping, sort: TaskSort[] }`
- `id` is a nanoid or timestamp-based unique key

### Rust layer (src-tauri/src/features/tasks/)

Follow the pattern from `smart_links/config.rs` — `load_rules`/`save_rules` with `atomic_write`:

1. Add `task_views.rs`:
   - `const CONFIG_REL: &str = ".carbide/task-views.json";`
   - `TaskView` struct (serde): `{ id, name, query_text, grouping, sort }`
   - `load_views(vault_root: &Path) -> Result<Vec<TaskView>, String>` — return `[]` if file missing
   - `save_views(vault_root: &Path, views: &[TaskView]) -> Result<(), String>`
   - `delete_view(vault_root: &Path, id: &str) -> Result<(), String>` — load, filter, save

2. Add IPC commands in `mod.rs`:
   - `tasks_views_list(app, vault_id) -> Vec<TaskView>`
   - `tasks_views_save(app, vault_id, view: TaskView) -> ()` — upsert by id
   - `tasks_views_delete(app, vault_id, id: String) -> ()`
   - Register in `src-tauri/src/main.rs` invoke_handler

3. Don't forget to add to the specta type generation if the project uses it.

### TypeScript port layer

1. `src/lib/features/task/types.ts` — add `TaskView` type
2. `src/lib/features/task/ports.ts` — add to `TaskPort`:
   - `listTaskViews(vaultId: string): Promise<TaskView[]>`
   - `saveTaskView(vaultId: string, view: TaskView): Promise<void>`
   - `deleteTaskView(vaultId: string, id: string): Promise<void>`
3. `src/lib/features/task/adapters/task_tauri_adapter.ts` — implement via `invoke()`
4. `src/lib/features/task/index.ts` — re-export `TaskView`

### Store

In `TaskStore`:
- `savedViews = $state<TaskView[]>([])` + `setSavedViews(views)`
- No need for a separate store; it's a small amount of state

### UI (task_panel.svelte)

- **Save button**: visible only in DSL mode when `queryText` is non-empty. Click opens a small inline prompt for the view name, then saves via `taskService`.
- **View selector**: dropdown/select at top of panel (visible always), lists saved views. Selecting one:
  1. Switches to DSL mode
  2. Sets `queryText` to the view's `query_text`
  3. Sets grouping + sort from the view
  4. Executes the query
- **Delete**: small X button next to each saved view in the dropdown, or a trash icon.

### Task Service

Add methods to `TaskService` (or handle directly in the panel — check existing patterns):
- `loadSavedViews()` — called on mount
- `saveCurrentView(name)` — takes current queryText + grouping + sort, generates id, saves
- `deleteSavedView(id)` — removes and refreshes list

### Tests

- Unit tests for Rust `load_views`/`save_views`/`delete_view` (in `src-tauri/tests/`)
- TypeScript: test the save/load/delete roundtrip if there's an existing pattern for IPC mocking

### Key constraints

- Follow existing patterns exactly (smart_links config.rs for Rust, TaskTauriAdapter for TS)
- Keep it simple — no complex state management, no optimistic updates
- The `id` field enables upsert semantics (save overwrites if id matches)
- Load views on panel mount, not eagerly
```

---

## Key Decisions

1. **Sentinels resolved in Rust** — parser stays pure and testable, embedded/saved queries stay fresh
2. **Textarea over filter builder** — full DSL power, fraction of the complexity; visual builder can layer on later
3. **Tag filtering via `text LIKE`** — no schema migration, fast enough for typical vault sizes (<10K tasks)
4. **Inclusive `before`/`after`** — breaking change acceptable per 0-user policy
5. **Shared `group_tasks` function** — eliminates three-way duplication of grouping logic
