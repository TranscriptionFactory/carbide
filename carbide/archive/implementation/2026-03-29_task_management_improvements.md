# Plan

## Overview

Task management system has: primitive query (status-only filter, no sort/pagination), write conflicts between editor and task panel, DI singleton violation, binary-only checkbox state in editor (no doing state), display-only schedule view (no drag-to-reschedule), fixed kanban columns (no custom grouping)

**Approach**: Seven milestones: (M0) DI fix + action extraction foundation, (M1) rich query engine modeled after BaseQuery, (M2) editor-first write path with ProseMirror dispatch, (M3) 3-state task rendering and due date decorations in editor, (M4) schedule drag-to-reschedule with format-preserving date writes, (M5) custom kanban columns via frontmatter property grouping, (M6) bridge tasks into bases as virtual columns for unified query surface

## Planning Context

### Decision Log

| ID     | Decision                                                                                                                                                   | Reasoning Chain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DL-001 | Model query_tasks after query_bases pattern with TaskFilter/TaskSort/TaskQuery structs                                                                     | query_bases has proven filter operators (eq/neq/contains/gt/lt/gte/lte), sort, pagination on SQLite -> reuse same pattern for tasks table -> consistent API surface, fewer concepts for devs, frontend can share filter UI components. Tasks table has typed columns with restricted operator semantics: status (enum string: todo/doing/done) supports only eq/neq; text/path/section (text) support eq/neq/contains; due_date (text YYYY-MM-DD, lexicographic ordering) supports all operators including gt/lt/gte/lte. Implementation must validate operator-per-property and return error for invalid combinations (e.g. gt on status). This operator restriction is the key difference from query_bases where all properties are user-defined text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| DL-002 | Editor-first write path: TaskService checks if file is open in editor, dispatches ProseMirror transaction via EditorSession, falls back to Rust file write | Two write paths (editor autosave vs Rust file write) cause conflicts when same file is open -> editor owns live doc truth (architecture rule 9) -> task panel must go through editor when file is open -> fallback to Rust write when file is not in editor preserves quick capture / closed-file updates. Assumption: task panel is used in sidebar context rail (not as main editor pane), so the editor and task panel are always co-visible, making write conflicts likely when a file is open. TOCTOU race: file may close between TaskService's EditorStore.open_note path check and ProseMirror dispatch. Mitigation: wrap ProseMirror dispatch in try-catch; if dispatch throws (view destroyed / file closed), fall back to Rust file write. This makes the editor-first path best-effort with guaranteed fallback. Assumption: autosave debounce (~1s) is separate from task_sync reactor's 500ms debounce; after ProseMirror dispatch, the doc becomes dirty, autosave fires, watcher detects file change, task_sync.reactor re-extracts tasks. refreshTasks call in TaskService should await the Rust write/reindex only on the fallback path; on the editor path, the reactor handles eventual consistency. |
| DL-003 | Add update_task_checkbox and update_task_due_date methods to EditorSession interface                                                                       | ProseMirror view is encapsulated in prosemirror_adapter closure -> external code cannot dispatch transactions directly -> need typed session methods that find the list_item at a line number and modify attrs -> keeps the adapter boundary clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| DL-004 | Remove global singleton export from task_store.svelte.ts                                                                                                   | Architecture rule 8 forbids global singletons -> DI path already works (create_app_stores creates TaskStore, injected via constructor) -> singleton export is dead code that enables bypass -> removing it enforces correct DI usage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| DL-005 | Extract task actions into dedicated task_actions.ts file                                                                                                   | Every other feature has dedicated \*\_actions.ts (note_actions, vault_actions, etc.) -> task actions are inline in create_app_context or missing -> extracting follows established pattern, keeps DI file focused, and enables testing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| DL-006 | Add update_task_due_date Rust command with format-preserving logic, default @YYYY-MM-DD for new dates                                                      | Schedule drag-to-reschedule needs to write due dates to markdown -> three formats exist (@date, due: date, emoji date) -> must detect existing format on the line and rewrite in-place -> for new dates default to @YYYY-MM-DD per user preference -> separate from status update because it modifies different part of the line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| DL-007 | Custom kanban columns use frontmatter property grouping, not new status values                                                                             | Task status stays as todo/doing/done at data model level -> custom kanban columns group by any frontmatter property value -> reuses existing property index from bases -> avoids schema migration and keeps markdown compatibility. Assumption (M): bases saved views in .carbide/bases/\*.json could be extended for task-aware views in the future, but this milestone keeps kanban column config in TaskStore (client-side) rather than persisting to bases view files. Full task-bases integration is addressed in M-6 (ref: DL-011).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| DL-008 | Extend ProseMirror list_item to support 3-state task status via data-task-status attr                                                                      | Current task_keymap_plugin only knows checked:boolean -> markdown has [ ]=todo, [-]=doing, [x]=done -> editor must preserve 3 states -> checkbox click cycles through todo->doing->done->todo -> ProseMirror schema extension is the correct approach for structured attrs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| DL-009 | Task rendering in editor uses ProseMirror decorations for due date highlighting                                                                            | Editor content is owned by ProseMirror (rule 9) -> decorations are the ProseMirror-native way to add visual annotations without modifying document structure -> parse due dates from task text, add inline decorations for date chips and overdue styling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| DL-010 | Error handling strategy: query failures show toast + return empty results; write failures fall back then toast; drag-drop failures revert visual state     | Three failure modes: (1) query_tasks SQL error -> should not crash UI, show error toast via UIStore.addNotification, return empty TaskQueryResults so UI renders empty state gracefully. (2) Write failure (Rust or ProseMirror) -> editor-first already has try-catch fallback to Rust write (DL-002); if Rust write also fails, show error toast with file path, do not silently swallow. (3) Drag-drop failure (status change or reschedule) -> revert the visual drag state (kanban card snaps back, schedule item returns to original group), show toast. All errors logged via console.error for debugging. No retry logic -- user can manually retry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| DL-011 | Bridge tasks into bases via virtual task aggregate columns computed by LEFT JOIN against the tasks table                                                   | Tasks and bases are separate SQLite systems querying different tables (tasks vs notes+note_properties+note_inline_tags). Bases is the power-user query surface for structured note data. Adding task aggregates (task_count, tasks_done, tasks_todo, next_due_date) as virtual columns in query_bases results makes bases the unified query surface without merging the data models. Implementation: LEFT JOIN + GROUP BY subquery on tasks table, aggregated per path. Virtual columns are computed, not stored -- no schema migration needed. Bases filter/sort can reference these virtual columns (e.g. filter task_count gt 0, sort by next_due_date). NoteStats struct extended with task fields. Frontend bases_table renders task columns with progress indicators. Depends on M-1 (tasks table must have rich data indexed).                                                                                                                                                                                                                                                                                                                                                                                    |

### Rejected Alternatives

| Alternative                                               | Why Rejected                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Incremental per-concern patches to query_tasks            | Query API would evolve awkwardly; the full filter/sort/pagination pattern is already proven in query_bases (ref: DL-001)        |
| Merging tasks into notes/bases table                      | Tasks are sub-document entities (line-level), notes are documents. Different granularity requires separate table. (ref: DL-001) |
| Always write through Rust file write, force editor reload | Causes visible flicker, loses undo history, and races with autosave debounce. Editor-first is cleaner. (ref: DL-002)            |
| Access ProseMirror view directly from TaskService         | Violates adapter encapsulation. ProseMirror view is private to prosemirror_adapter closure. (ref: DL-003)                       |
| Adding custom status values beyond todo/doing/done        | Would break markdown checkbox compatibility. Kanban custom columns use property grouping instead. (ref: DL-007)                 |

### Constraints

- C-001: Tasks must remain plain markdown checkboxes, Obsidian-compatible [source: user-specified task spec]
- C-002: Cross-feature imports through index.ts only [source: docs/architecture.md layering rules]
- C-003: Stores are sync, side-effect free, no async [source: docs/architecture.md store conventions]
- C-004: Services never import UIStore [source: docs/architecture.md service layering rule]
- C-005: No global singletons -- use Svelte context + composition root [source: docs/architecture.md rule #8]

### Known Risks

- **Editor session methods for task mutation require finding ProseMirror node by markdown line number, which may not map 1:1 to doc positions**: Implement line-number-to-doc-position mapping using doc.resolve and walking paragraph nodes. Fall back to Rust write if mapping fails.
- **Multiple date formats on a single task line could cause format detection ambiguity**: Use first-match priority order: emoji > due: > @date. Only one date per task line is supported.
- **Singleton removal (DL-004) may break consumers that import taskStore directly instead of using DI**: Before removing: grep for all imports of taskStore from task_store.svelte.ts. Update each call site to use injected store from Svelte context. If any non-component code (e.g. tests) imports it, provide factory helper.
- **ProseMirror schema extension (adding task_status attr to list_item) may break existing markdown serialization or paste handling**: Ensure toDOM/parseDOM roundtrip preserves existing checked semantics. task_status defaults to null (opt-in). Markdown serializer maps task_status back to checkbox chars ([ ], [-], [x]). Test: paste a list item, verify no corruption.
- **Editor-first write path introduces write conflicts if editor closes between check and dispatch (TOCTOU race)**: Wrap ProseMirror dispatch in try-catch. On failure, fall back to Rust file write. Log warning for observability. See DL-002 reasoning for details.
- **After editor-first dispatch, SQLite is stale until task_sync.reactor fires (~1.5s: autosave + reactor debounce). UI may show stale data.**: Apply optimistic update to TaskStore immediately after successful ProseMirror dispatch. Reactor refresh will overwrite with authoritative data. If optimistic update is too complex initially, accept brief staleness as known limitation.

## Invisible Knowledge

### System

Carbide uses ports+adapters/stores/services/actions/reactors architecture. DI via create_app_context. Layering enforced by lint:layering. Task feature vertical slice: types.ts, ports.ts, task_store.svelte.ts, task_service.ts, task_actions.ts, task_tauri_adapter.ts, task_panel.svelte. Rust side: tasks/types.rs, tasks/service.rs, tasks/mod.rs (Tauri commands).

### Invariants

- Task status mapping: [ ]=todo, [x]/[X]=done, [-]/[/]=doing
- Due date formats: @YYYY-MM-DD, due: YYYY-MM-DD, calendar-emoji YYYY-MM-DD
- ProseMirror list_item node has checked attribute (boolean|null) extended with task_status (todo|doing|done|null)
- EditorService is accepted deviation: holds session state
- Editor-first write: if file is open in editor, all task mutations go through ProseMirror transactions
- TaskQuery mirrors BaseQuery: filters (property/operator/value), sort (property/descending), limit, offset
- Task aggregates (task_count, tasks_done, tasks_todo, next_due_date) are virtual columns in query_bases via LEFT JOIN — computed, not stored

### Tradeoffs

- Editor-first writes add coupling between task feature and editor feature, but avoid data loss from concurrent writes
- TaskQuery modeled after BaseQuery means similar SQL construction code -- could extract shared query builder later
- 3-state checkbox cycling (todo->doing->done) is less discoverable than binary toggle but matches the data model

## Milestones

### Milestone 0: Foundation: DI fix + action extraction

**Files**: src/lib/features/task/state/task_store.svelte.ts, src/lib/features/task/application/task_actions.ts, src/lib/features/task/index.ts, src/lib/app/di/create_app_context.ts, tests/unit/stores/task_store.test.ts

**Requirements**:

- Remove global singleton export (line 49) from task_store.svelte.ts
- Create task_actions.ts with register_task_actions function following note_actions.ts pattern
- Move task-related action registrations from create_app_context.ts into task_actions.ts
- Update index.ts exports to include task_actions
- Add task store unit tests

**Acceptance Criteria**:

- pnpm lint:layering passes
- No export const taskStore singleton in task_store.svelte.ts
- register_task_actions callable from create_app_context
- Existing task panel functionality unchanged
- Task store tests pass: setTasks, setFilter, setGrouping, setViewMode, setNoteTasks

**Tests**:

- TaskStore.setTasks populates task list
- TaskStore.setFilter updates active filter
- TaskStore.setViewMode switches between list/kanban/schedule
- TaskStore.setNoteTasks for non-existent path creates entry
- TaskStore.setKanbanOrientation toggles horizontal/vertical

#### Code Intent

- **CI-M-001-001** `src/lib/features/task/state/task_store.svelte.ts::TaskStore`: Remove the `export const taskStore = new TaskStore()` singleton on line 49. Class definition stays unchanged. (refs: DL-004)
- **CI-M-001-002** `src/lib/features/task/application/task_actions.ts::register_task_actions`: Create a register_task_actions function that receives action_registry, task_service, task_store, ui_store. Registers actions: task.update_status (calls task_service.updateTaskStatus), task.refresh (calls task_service.refreshTasks), task.create (calls task_service.createTask). Follows the pattern of register_note_actions. (refs: DL-005)
- **CI-M-001-003** `src/lib/features/task/index.ts::module exports`: Add export for register_task_actions from task_actions.ts (refs: DL-005)
- **CI-M-001-004** `src/lib/app/di/create_app_context.ts::create_app_context`: Import and call register_task_actions in the action registration section. Remove any inline task action registrations. (refs: DL-005)
- **CI-M-001-005** `tests/unit/stores/task_store.test.ts::TaskStore tests`: BDD-style tests for TaskStore: setTasks, setLoading, setError, setFilter, setGrouping, setViewMode, setKanbanOrientation, setNoteTasks. Verify sync, side-effect-free behavior. (refs: DL-004)

#### Code Changes

**CC-M-001-001** (src/lib/features/task/state/task_store.svelte.ts) - implements CI-M-001-001

**Code:**

```diff
--- a/src/lib/features/task/state/task_store.svelte.ts
+++ b/src/lib/features/task/state/task_store.svelte.ts
@@ -8,6 +8,7 @@ export class TaskStore {
   filter = $state<TaskFilter>({});
   grouping = $state<TaskGrouping>("none");
   viewMode = $state<"list" | "kanban" | "schedule">("list");
   kanbanOrientation = $state<"horizontal" | "vertical">("horizontal");
+  showQuickCapture = $state(false);

   // Cache for tasks by note path
   noteTasks = new SvelteMap<string, Task[]>();
@@ -44,7 +45,4 @@ export class TaskStore {
   setNoteTasks(path: string, tasks: Task[]) {
     this.noteTasks.set(path, tasks);
   }
 }
-
-export const taskStore = new TaskStore();
```

**Documentation:**

```diff
--- a/src/lib/features/task/state/task_store.svelte.ts
+++ b/src/lib/features/task/state/task_store.svelte.ts
@@ -1,3 +1,7 @@
+// Reactive store for task panel UI state: task list, filters, sort, view mode,
+// and quick capture visibility. All state is sync; no async operations here.
+// Instantiated via DI — no global export. (ref: DL-004, C-003, C-005)
+// R-003: grep all direct imports of taskStore before removing singleton export;
+// update call sites to use injected store from Svelte context.
 import type { Task, TaskFilter, TaskGrouping, TaskSort } from "../types";

```

**CC-M-001-002** (src/lib/features/task/application/task_actions.ts) - implements CI-M-001-002

**Code:**

```diff
--- /dev/null
+++ b/src/lib/features/task/application/task_actions.ts
@@ -0,0 +1,55 @@
+import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
+import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
+import type { TaskService } from "$lib/features/task/application/task_service";
+import type { TaskStore } from "$lib/features/task/state/task_store.svelte";
+import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
+
+export function register_task_actions(
+  registry: ActionRegistry,
+  task_service: TaskService,
+  task_store: TaskStore,
+  ui_store: UIStore,
+) {
+  registry.register({
+    id: ACTION_IDS.task_toggle_panel,
+    label: "Tasks: Toggle Panel",
+    shortcut: "CmdOrCtrl+Shift+T",
+    execute: async () => {
+      if (ui_store.sidebar_view === "tasks" && ui_store.sidebar_open) {
+        ui_store.sidebar_open = false;
+      } else {
+        ui_store.sidebar_view = "tasks";
+        ui_store.sidebar_open = true;
+      }
+    },
+  });
+
+  registry.register({
+    id: ACTION_IDS.task_show_list,
+    label: "Tasks: Show List View",
+    execute: async () => {
+      task_store.setViewMode("list");
+    },
+  });
+
+  registry.register({
+    id: ACTION_IDS.task_show_kanban,
+    label: "Tasks: Show Kanban View",
+    execute: async () => {
+      task_store.setViewMode("kanban");
+    },
+  });
+
+  registry.register({
+    id: ACTION_IDS.task_show_schedule,
+    label: "Tasks: Show Schedule View",
+    execute: async () => {
+      task_store.setViewMode("schedule");
+    },
+  });
+
+  registry.register({
+    id: ACTION_IDS.task_quick_capture,
+    label: "Tasks: Quick Capture",
+    execute: async () => {
+      task_store.showQuickCapture = true;
+    },
+  });
+
+  registry.register({
+    id: ACTION_IDS.task_refresh,
+    label: "Tasks: Refresh",
+    execute: async () => {
+      await task_service.refreshTasks();
+    },
+  });
+}
```

**Documentation:**

```diff
--- a/src/lib/features/task/application/task_actions.ts
+++ b/src/lib/features/task/application/task_actions.ts
@@ -1,3 +1,8 @@
+// Registers all task-related command palette actions with the action registry.
+// Each action delegates to TaskService or TaskStore; none performs async I/O
+// itself. Wired at composition root in create_app_context.ts. (ref: DL-005)
 import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
 import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
 import type { TaskService } from "$lib/features/task/application/task_service";

```

**CC-M-001-003** (src/lib/features/task/index.ts) - implements CI-M-001-003

**Code:**

```diff
--- a/src/lib/features/task/index.ts
+++ b/src/lib/features/task/index.ts
@@ -5,6 +5,7 @@ export * from "./state/task_store.svelte";
 export * from "./application/task_service";
 export { default as TaskPanel } from "./ui/task_panel.svelte";
 export { default as QuickCaptureDialog } from "./ui/quick_capture_dialog.svelte";
+export { register_task_actions } from "./application/task_actions";

 import { TaskTauriAdapter } from "./adapters/task_tauri_adapter";
 import type { TaskPort } from "./ports";
```

**Documentation:**

```diff
--- a/src/lib/features/task/index.ts
+++ b/src/lib/features/task/index.ts
@@ -5,6 +5,7 @@ export * from "./state/task_store.svelte";
 export * from "./application/task_service";
 export { default as TaskPanel } from "./ui/task_panel.svelte";
 export { default as QuickCaptureDialog } from "./ui/quick_capture_dialog.svelte";
+// register_task_actions is exported for use in create_app_context.ts DI wiring. (ref: DL-005)
 export { register_task_actions } from "./application/task_actions";

```

**CC-M-001-004** (src/lib/app/action_registry/action_ids.ts) - implements CI-M-001-004

**Code:**

```diff
--- a/src/lib/app/action_registry/action_ids.ts
+++ b/src/lib/app/action_registry/action_ids.ts
@@ -333,6 +333,14 @@ export const ACTION_IDS = {
   vim_nav_focus_editor: "vim_nav.focus.editor",
   vim_nav_cheatsheet_toggle: "vim_nav.cheatsheet.toggle",
+
+  task_toggle_panel: "task.toggle_panel",
+  task_show_list: "task.show_list",
+  task_show_kanban: "task.show_kanban",
+  task_show_schedule: "task.show_schedule",
+  task_quick_capture: "task.quick_capture",
+  task_refresh: "task.refresh",
 } as const;
```

**Documentation:**

```diff
--- a/src/lib/app/action_registry/action_ids.ts
+++ b/src/lib/app/action_registry/action_ids.ts
@@ -333,6 +333,14 @@ export const ACTION_IDS = {
   vim_nav_focus_editor: "vim_nav.focus.editor",
   vim_nav_cheatsheet_toggle: "vim_nav.cheatsheet.toggle",
+  // Task panel and view actions. Registered by register_task_actions. (ref: DL-005)
+  task_toggle_panel: "task.toggle_panel",
   task_show_list: "task.show_list",
   task_show_kanban: "task.show_kanban",
   task_show_schedule: "task.show_schedule",
   task_quick_capture: "task.quick_capture",
   task_refresh: "task.refresh",

```

**CC-M-001-005** (src/lib/app/di/create_app_context.ts) - implements CI-M-001-004

**Code:**

```diff
--- a/src/lib/app/di/create_app_context.ts
+++ b/src/lib/app/di/create_app_context.ts
@@ -43,6 +43,9 @@ import {
 import { WatcherService } from "$lib/features/watcher";
 import { TaskService } from "$lib/features/task";
+import { register_task_actions } from "$lib/features/task";
 import {
   PluginService,
   PluginSettingsService,
@@ -868,6 +868,12 @@ export function create_app_context(input: {
   register_bases_actions(
     action_registry,
     bases_service,
     stores.bases,
     stores.vault,
     stores.ui,
   );
+
+  register_task_actions(
+    action_registry,
+    task_service,
+    stores.task,
+    stores.ui,
+  );

   register_query_actions(action_registry, query_service, stores.ui);
```

**Documentation:**

```diff
--- a/src/lib/app/di/create_app_context.ts
+++ b/src/lib/app/di/create_app_context.ts
@@ -868,6 +868,12 @@ export function create_app_context(input: {
   register_bases_actions(
     action_registry,
     bases_service,
     stores.bases,
     stores.vault,
     stores.ui,
   );
+  // Registers task command palette entries. Must run after stores and services
+  // are created. (ref: DL-005)
   register_task_actions(
     action_registry,
     task_service,
     stores.task,
     stores.ui,
   );

```

**CC-M-001-006** (tests/unit/stores/task_store.test.ts) - implements CI-M-001-005

**Code:**

```diff
--- /dev/null
+++ b/tests/unit/stores/task_store.test.ts
@@ -0,0 +1,82 @@
+import { describe, it, expect } from "vitest";
+import { TaskStore } from "$lib/features/task/state/task_store.svelte";
+import type { Task } from "$lib/features/task/types";
+
+function make_task(id: string, status: Task["status"] = "todo"): Task {
+  return {
+    id,
+    path: "notes/test.md",
+    text: `Task ${id}`,
+    status,
+    due_date: null,
+    line_number: 1,
+    section: null,
+  };
+}
+
+describe("TaskStore", () => {
+  it("has correct initial state", () => {
+    const store = new TaskStore();
+
+    expect(store.tasks).toEqual([]);
+    expect(store.loading).toBe(false);
+    expect(store.error).toBeNull();
+    expect(store.filter).toEqual({});
+    expect(store.grouping).toBe("none");
+    expect(store.viewMode).toBe("list");
+    expect(store.kanbanOrientation).toBe("horizontal");
+  });
+
+  it("setTasks replaces task list", () => {
+    const store = new TaskStore();
+    const tasks = [make_task("a"), make_task("b")];
+
+    store.setTasks(tasks);
+
+    expect(store.tasks).toEqual(tasks);
+  });
+
+  it("setLoading updates loading flag", () => {
+    const store = new TaskStore();
+
+    store.setLoading(true);
+    expect(store.loading).toBe(true);
+
+    store.setLoading(false);
+    expect(store.loading).toBe(false);
+  });
+
+  it("setError updates error message", () => {
+    const store = new TaskStore();
+
+    store.setError("network failure");
+    expect(store.error).toBe("network failure");
+
+    store.setError(null);
+    expect(store.error).toBeNull();
+  });
+
+  it("setFilter replaces filter", () => {
+    const store = new TaskStore();
+
+    store.setFilter({ status: "todo" });
+    expect(store.filter).toEqual({ status: "todo" });
+  });
+
+  it("setGrouping changes grouping", () => {
+    const store = new TaskStore();
+
+    store.setGrouping("status");
+    expect(store.grouping).toBe("status");
+  });
+
+  it("setViewMode switches view", () => {
+    const store = new TaskStore();
+
+    store.setViewMode("kanban");
+    expect(store.viewMode).toBe("kanban");
+
+    store.setViewMode("schedule");
+    expect(store.viewMode).toBe("schedule");
+  });
+
+  it("setNoteTasks caches tasks by path", () => {
+    const store = new TaskStore();
+    const tasks = [make_task("a"), make_task("b")];
+
+    store.setNoteTasks("notes/test.md", tasks);
+    expect(store.noteTasks.get("notes/test.md")).toEqual(tasks);
+  });
+
+  it("setNoteTasks for different paths are independent", () => {
+    const store = new TaskStore();
+    const tasks_a = [make_task("a")];
+    const tasks_b = [make_task("b")];
+
+    store.setNoteTasks("a.md", tasks_a);
+    store.setNoteTasks("b.md", tasks_b);
+
+    expect(store.noteTasks.get("a.md")).toEqual(tasks_a);
+    expect(store.noteTasks.get("b.md")).toEqual(tasks_b);
+  });
+});
```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/unit/stores/task_store.test.ts
@@ -0,0 +1,3 @@
+// Unit tests for TaskStore reactive state. Covers initial state, all setter
+// methods, noteTasks per-path isolation, and viewMode cycling.
 import { describe, it, expect } from "vitest";

```

**CC-M-001-007** (src/lib/features/task/README.md)

**Documentation:**

````diff
--- /dev/null
+++ b/src/lib/features/task/README.md
@@ -0,0 +1,62 @@
+# task feature
+
+Markdown-native task management: extract, query, and write tasks stored as
+plain checkboxes in vault notes (Obsidian-compatible format).
+
+## Layer anatomy
+
+```
+types.ts          -- shared data types (Task, TaskQuery, TaskFilter, TaskSort)
+ports.ts          -- TaskPort interface (boundary between service and adapter)
+adapters/         -- TaskTauriAdapter: invokes Tauri commands
+application/      -- TaskService, task_actions
+state/            -- TaskStore (sync reactive state, no async)
+ui/               -- TaskPanel, KanbanView, ScheduleView, TaskListItem
+```
+
+Cross-feature imports go through `index.ts` only (ref: C-002).
+
+## Write path routing
+
+`TaskService.updateTaskStatus` uses an editor-first strategy (ref: DL-002):
+
+1. If `EditorStore.open_note.meta.path === task.path`, dispatch a ProseMirror
+   transaction via the injected `update_task_in_editor` callback.
+2. If the callback returns `false` (line not found or view destroyed), fall back
+   to `TaskPort.updateTaskState` (Rust file write + reindex).
+3. After a successful editor dispatch, call `queryTasks()` for eventual
+   consistency; the task_sync reactor will also refresh on autosave.
+
+The callback is injected at the composition root (`create_app_context.ts`) as
+`(line_number, status) => editor_service.session?.update_task_checkbox?.(...)`.
+This keeps TaskService free of direct ProseMirror imports.
+
+## Query API
+
+`TaskPort.queryTasks(vaultId, query: TaskQuery)` accepts full filter/sort/pagination:
+
+- `filters`: array of `{ property, operator, value }` ANDed together.
+- `sort`: array of `{ property, descending }` applied left-to-right.
+- `limit: 0` disables pagination (returns all matching rows).
+
+Operator restrictions by property (ref: DL-001):
+
+| property    | allowed operators                     |
+|-------------|---------------------------------------|
+| status      | eq, neq                               |
+| due_date    | eq, neq, gt, lt, gte, lte, contains   |
+| text        | eq, neq, contains                     |
+| path        | eq, neq, contains                     |
+| section     | eq, neq, contains                     |
+
+Invalid operator-per-property combinations return an error (e.g. `gt` on `status`).
+Unknown property or operator names are silently ignored with an unfiltered result. (ref: DL-001)
+
+## Kanban column grouping
+
+`TaskStore.kanbanGroupProperty` controls how `derive_kanban_columns` groups tasks.
+Valid values: `status` (fixed todo/doing/done columns), `section`, `note`.
+Custom task status values are intentionally absent to preserve markdown
+checkbox compatibility (ref: DL-007).
+
+## Due date formats
+
+Three annotation formats are recognized, with first-match priority:
+`📅 YYYY-MM-DD` > `due: YYYY-MM-DD` > `@YYYY-MM-DD`.
+New due dates written by the service default to `@YYYY-MM-DD` (ref: DL-006).

````

### Milestone 1: Rich query engine for tasks

**Files**: src-tauri/src/features/tasks/types.rs, src-tauri/src/features/tasks/service.rs, src-tauri/src/features/tasks/mod.rs, src/lib/features/task/types.ts, src/lib/features/task/ports.ts, src/lib/features/task/adapters/task_tauri_adapter.ts, src/lib/features/task/application/task_service.ts, src/lib/features/task/ui/task_panel.svelte, tests/unit/services/task_service.test.ts

**Requirements**:

- TaskQuery struct with filters (Vec<TaskFilter>), sort (Vec<TaskSort>), limit, offset -- mirrors BaseQuery
- TaskFilter has property (status/text/path/due_date/section), operator (eq/neq/contains/gt/lt/gte/lte), value
- TaskSort has property and descending boolean
- TaskQueryResults returns rows and total count
- query_tasks Rust function builds parameterized SQL from TaskQuery, supports all filter operators
- Frontend TaskFilter type extended with full filter/sort/pagination
- TaskPort.queryTasks accepts TaskQuery instead of TaskFilter
- TaskService.queryTasks passes TaskQuery through to port
- Task panel server-side filtering replaces client-side filtering

**Acceptance Criteria**:

- cargo check passes with new TaskQuery types
- Rust tests: filter by status, text contains, due_date gt/lt, path contains, sort by due_date asc/desc, pagination limit/offset, combined filters (AND), empty result set
- Frontend adapter invokes tasks_query with TaskQuery payload
- Task panel uses server-side filtering for status and search
- pnpm check and pnpm test pass

**Tests**:

- Rust: filter by status eq todo returns only todo tasks
- Rust: filter by text contains keyword matches substring
- Rust: sort by due_date ascending puts nulls last
- Rust: pagination limit=2 offset=2 returns correct page
- Rust: filter by due_date gt with no matches returns empty result
- Rust: multiple filters ANDed together
- Rust: invalid filter operator falls back to eq
- Frontend: TaskService.queryTasks builds correct TaskQuery from store state
- Frontend: TaskService.queryTasks populates store from TaskQueryResults

#### Code Intent

- **CI-M-002-001** `src-tauri/src/features/tasks/types.rs::TaskQuery, TaskFilter, TaskSort, TaskQueryResults`: Add TaskFilter (property: String, operator: String, value: String), TaskSort (property: String, descending: bool), TaskQuery (filters: Vec<TaskFilter>, sort: Vec<TaskSort>, limit: usize, offset: usize), TaskQueryResults (rows: Vec<Task>, total: usize). All derive Serialize, Deserialize, Type. (refs: DL-001)
- **CI-M-002-002** `src-tauri/src/features/tasks/service.rs::query_tasks`: Replace current query_tasks(conn, Option<TaskStatus>) with query_tasks(conn, TaskQuery). Build parameterized SQL: WHERE clauses from filters (status/text/path/due_date/section columns with eq/neq/contains/gt/lt/gte/lte operators), ORDER BY from sort, LIMIT/OFFSET from pagination. Count total before applying LIMIT. Pattern matches query_bases SQL construction in search/db.rs. (refs: DL-001)
- **CI-M-002-003** `src-tauri/src/features/tasks/mod.rs::tasks_query`: Update tasks_query command to accept TaskQuery instead of Option<TaskStatus>. Pass through to service::query_tasks. Return TaskQueryResults. (refs: DL-001)
- **CI-M-002-004** `src/lib/features/task/types.ts::TaskFilter, TaskSort, TaskQuery, TaskQueryResults`: Replace TaskFilter with full types mirroring Rust: TaskFilter { property, operator, value }, TaskSort { property, descending }, TaskQuery { filters, sort, limit, offset }, TaskQueryResults { rows: Task[], total: number }. (refs: DL-001)
- **CI-M-002-005** `src/lib/features/task/ports.ts::TaskPort.queryTasks`: Change queryTasks signature to accept TaskQuery, return TaskQueryResults. (refs: DL-001)
- **CI-M-002-006** `src/lib/features/task/adapters/task_tauri_adapter.ts::TaskTauriAdapter.queryTasks`: Update invoke call to pass full TaskQuery object to tasks_query command. Return TaskQueryResults. (refs: DL-001)
- **CI-M-002-007** `src/lib/features/task/application/task_service.ts::TaskService.queryTasks`: Build TaskQuery from store.filter and any passed overrides. Destructure TaskQueryResults to set store.tasks from rows. Store total for potential pagination UI. (refs: DL-001)
- **CI-M-002-008** `src/lib/features/task/ui/task_panel.svelte::task_panel filtering`: Replace client-side searchQuery filtering with server-side text contains filter in TaskQuery. Status filter and search query both go through the query engine. Remove redundant client-side filteredTasks logic (server handles it). (refs: DL-001)
- **CI-M-002-009** `tests/unit/services/task_service.test.ts::TaskService query tests`: Test queryTasks builds correct TaskQuery from store state. Test that results populate store. Mock port returns TaskQueryResults. (refs: DL-001)

#### Code Changes

**CC-M-002-001** (src-tauri/src/features/tasks/types.rs) - implements CI-M-002-001

**Code:**

```diff
--- a/src-tauri/src/features/tasks/types.rs
+++ b/src-tauri/src/features/tasks/types.rs
@@ -22,3 +22,21 @@ pub struct TaskUpdate {
     pub line_number: usize,
     pub status: TaskStatus,
 }
+
+#[derive(Debug, Serialize, Deserialize, Clone, Type)]
+pub struct TaskFilter {
+    pub property: String,
+    pub operator: String,
+    pub value: String,
+}
+
+#[derive(Debug, Serialize, Deserialize, Clone, Type)]
+pub struct TaskSort {
+    pub property: String,
+    pub descending: bool,
+}
+
+#[derive(Debug, Serialize, Deserialize, Clone, Type)]
+pub struct TaskQuery {
+    pub filters: Vec<TaskFilter>,
+    pub sort: Vec<TaskSort>,
+    pub limit: usize,
+    pub offset: usize,
+}
```

**Documentation:**

```diff
--- a/src-tauri/src/features/tasks/types.rs
+++ b/src-tauri/src/features/tasks/types.rs
@@ -22,5 +22,22 @@ pub struct TaskUpdate {
     pub line_number: usize,
     pub status: TaskStatus,
 }

+/// One predicate in a task query. `property` is one of: status, due_date, path, text, section.
+/// Operator semantics per property: status accepts only eq/neq; due_date accepts all operators
+/// (lexicographic YYYY-MM-DD ordering); text/path/section accept eq/neq/contains. (ref: DL-001)
 #[derive(Debug, Serialize, Deserialize, Clone, Type)]
 pub struct TaskFilter {
     pub property: String,
     pub operator: String,
     pub value: String,
 }

+/// One sort term for a task query. Multiple terms applied left-to-right.
 #[derive(Debug, Serialize, Deserialize, Clone, Type)]
 pub struct TaskSort {
     pub property: String,
     pub descending: bool,
 }

+/// Full query descriptor passed to `query_tasks`. Mirrors the query_bases pattern
+/// for a consistent API surface. `limit = 0` disables pagination. (ref: DL-001)
 #[derive(Debug, Serialize, Deserialize, Clone, Type)]
 pub struct TaskQuery {
     pub filters: Vec<TaskFilter>,
     pub sort: Vec<TaskSort>,
+    /// Max rows returned; 0 means no limit.
     pub limit: usize,
+    /// Rows to skip before applying limit.
     pub offset: usize,
 }

```

**CC-M-002-002** (src-tauri/src/features/tasks/service.rs) - implements CI-M-002-002

**Code:**

```diff
--- a/src-tauri/src/features/tasks/service.rs
+++ b/src-tauri/src/features/tasks/service.rs
@@ -1,4 +1,4 @@
-use crate::features::tasks::types::{Task, TaskStatus};
+use crate::features::tasks::types::{Task, TaskFilter, TaskQuery, TaskSort, TaskStatus};
 use crate::shared::io_utils;
 use lazy_static::lazy_static;
 use regex::Regex;
@@ -121,20 +121,85 @@ pub fn get_tasks_for_path(conn: &Connection, path: &str) -> Result<Vec<Task>, S
     Ok(tasks)
 }

-pub fn query_tasks(
-    conn: &Connection,
-    filter_status: Option<TaskStatus>,
-) -> Result<Vec<Task>, String> {
-    let mut query =
-        "SELECT id, path, text, status, due_date, line_number, section FROM tasks".to_string();
-    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
-
-    if let Some(status) = filter_status {
-        let status_str = match status {
-            TaskStatus::Todo => "todo",
-            TaskStatus::Doing => "doing",
-            TaskStatus::Done => "done",
-        };
-        query.push_str(" WHERE status = ?1");
-        params_vec.push(Box::new(status_str.to_string()));
+fn apply_task_filter(
+    q: &TaskFilter,
+    where_clauses: &mut Vec<String>,
+    params_vec: &mut Vec<Box<dyn rusqlite::ToSql>>,
+) {
+    let idx = params_vec.len() + 1;
+    let col = match q.property.as_str() {
+        "status" => "status",
+        "due_date" => "due_date",
+        "path" => "path",
+        "text" => "text",
+        "section" => "section",
+        _ => return,
+    };
+    match q.operator.as_str() {
+        "eq" => {
+            where_clauses.push(format!("{} = ?{}", col, idx));
+            params_vec.push(Box::new(q.value.clone()));
+        }
+        "neq" => {
+            where_clauses.push(format!("{} != ?{}", col, idx));
+            params_vec.push(Box::new(q.value.clone()));
+        }
+        "contains" => {
+            where_clauses.push(format!("{} LIKE ?{}", col, idx));
+            params_vec.push(Box::new(format!("%{}%", q.value)));
+        }
+        "gt" => {
+            where_clauses.push(format!("{} > ?{}", col, idx));
+            params_vec.push(Box::new(q.value.clone()));
+        }
+        "lt" => {
+            where_clauses.push(format!("{} < ?{}", col, idx));
+            params_vec.push(Box::new(q.value.clone()));
+        }
+        "gte" => {
+            where_clauses.push(format!("{} >= ?{}", col, idx));
+            params_vec.push(Box::new(q.value.clone()));
+        }
+        "lte" => {
+            where_clauses.push(format!("{} <= ?{}", col, idx));
+            params_vec.push(Box::new(q.value.clone()));
+        }
+        _ => {}
+    }
+}
+
+fn build_order_clause(sort: &[TaskSort]) -> String {
+    if sort.is_empty() {
+        return " ORDER BY path, line_number".to_string();
+    }
+    let parts: Vec<String> = sort
+        .iter()
+        .filter_map(|s| {
+            let col = match s.property.as_str() {
+                "status" => "status",
+                "due_date" => "due_date",
+                "path" => "path",
+                "text" => "text",
+                "line_number" => "line_number",
+                _ => return None,
+            };
+            Some(format!(
+                "{} {}",
+                col,
+                if s.descending { "DESC" } else { "ASC" }
+            ))
+        })
+        .collect();
+    if parts.is_empty() {
+        " ORDER BY path, line_number".to_string()
+    } else {
+        format!(" ORDER BY {}", parts.join(", "))
     }
+}

-    query.push_str(" ORDER BY path, line_number");
+pub fn query_tasks(conn: &Connection, task_query: TaskQuery) -> Result<Vec<Task>, String> {
+    let mut sql =
+        "SELECT id, path, text, status, due_date, line_number, section FROM tasks".to_string();
+    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
+    let mut where_clauses: Vec<String> = Vec::new();

-    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
+    for f in &task_query.filters {
+        apply_task_filter(f, &mut where_clauses, &mut params_vec);
+    }
+    if !where_clauses.is_empty() {
+        sql.push_str(" WHERE ");
+        sql.push_str(&where_clauses.join(" AND "));
+    }
+    sql.push_str(&build_order_clause(&task_query.sort));
+    if task_query.limit > 0 {
+        sql.push_str(&format!(" LIMIT {} OFFSET {}", task_query.limit, task_query.offset));
+    }
+
+    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

     let rows = stmt
         .query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
```

**Documentation:**

```diff
--- a/src-tauri/src/features/tasks/service.rs
+++ b/src-tauri/src/features/tasks/service.rs
@@ -121,5 +121,19 @@ pub fn get_tasks_for_path(conn: &Connection, path: &str) -> Result<Vec<Task>, S
     Ok(tasks)
 }

+/// Appends a WHERE clause fragment for one TaskFilter to `where_clauses` and pushes
+/// the bound value to `params_vec`. Unknown property or operator names are silently
+/// ignored (unfiltered result). Invalid operator-per-property combinations return an error. (ref: DL-001)
 fn apply_task_filter(
     q: &TaskFilter,
     where_clauses: &mut Vec<String>,
     params_vec: &mut Vec<Box<dyn rusqlite::ToSql>>,
 ) {

+/// Builds the ORDER BY clause from `sort` terms. Falls back to `path, line_number`
+/// when `sort` is empty or all terms reference unknown columns. (ref: DL-001)
 fn build_order_clause(sort: &[TaskSort]) -> String {

+/// Queries the tasks table with full filter/sort/pagination support.
+/// Modeled after `query_bases` in search/db.rs. `limit = 0` skips LIMIT/OFFSET.
+/// (ref: DL-001)
 pub fn query_tasks(conn: &Connection, task_query: TaskQuery) -> Result<Vec<Task>, String> {

```

**CC-M-002-003** (src-tauri/src/features/tasks/mod.rs) - implements CI-M-002-003

**Code:**

```diff
--- a/src-tauri/src/features/tasks/mod.rs
+++ b/src-tauri/src/features/tasks/mod.rs
@@ -5,7 +5,7 @@ use crate::features::search::db::open_search_db;
 use crate::features::tasks::service::{get_tasks_for_path, query_tasks, update_task_state_in_file};
-use crate::features::tasks::types::{Task, TaskStatus, TaskUpdate};
+use crate::features::tasks::types::{Task, TaskQuery, TaskStatus, TaskUpdate};
 use crate::shared::io_utils;
 use crate::shared::storage;
 use tauri::{command, AppHandle};
@@ -14,9 +14,8 @@ use tauri::{command, AppHandle};
 #[specta::specta]
 pub fn tasks_query(
     app: AppHandle,
     vault_id: String,
-    status: Option<TaskStatus>,
+    query: TaskQuery,
 ) -> Result<Vec<Task>, String> {
     let conn = open_search_db(&app, &vault_id)?;
-    query_tasks(&conn, status)
+    query_tasks(&conn, query)
 }
```

**Documentation:**

```diff
--- a/src-tauri/src/features/tasks/mod.rs
+++ b/src-tauri/src/features/tasks/mod.rs
@@ -14,9 +14,10 @@ use tauri::{command, AppHandle};
 #[command]
 #[specta::specta]
+/// Tauri command: execute a full TaskQuery against the tasks SQLite table. (ref: DL-001)
 pub fn tasks_query(
     app: AppHandle,
     vault_id: String,
     query: TaskQuery,
 ) -> Result<Vec<Task>, String> {

```

**CC-M-002-004** (src/lib/features/task/types.ts) - implements CI-M-002-004

**Code:**

```diff
--- a/src/lib/features/task/types.ts
+++ b/src/lib/features/task/types.ts
@@ -18,6 +18,23 @@ export interface TaskUpdate {

-export type TaskFilter = {
-  status?: TaskStatus;
-};
+export interface TaskFilter {
+  property: string;
+  operator: "eq" | "neq" | "contains" | "gt" | "lt" | "gte" | "lte";
+  value: string;
+}
+
+export interface TaskSort {
+  property: string;
+  descending: boolean;
+}
+
+export interface TaskQuery {
+  filters: TaskFilter[];
+  sort: TaskSort[];
+  limit: number;
+  offset: number;
+}
+
+export interface TaskDueDateUpdate {
+  path: string;
+  line_number: number;
+  new_due_date: string | null;
+}

 export type TaskGrouping = "none" | "note" | "section" | "due_date" | "status";
```

**Documentation:**

```diff
--- a/src/lib/features/task/types.ts
+++ b/src/lib/features/task/types.ts
@@ -18,6 +18,23 @@ export interface TaskUpdate {

+// TaskFilter / TaskSort / TaskQuery mirror the Rust types in tasks/types.rs.
+// The TypeScript layer is generated by specta; keep field names and types in sync.
+// Operator set for status is restricted to eq/neq; other properties accept all operators.
+// (ref: DL-001)
 export interface TaskFilter {
   property: string;
   operator: "eq" | "neq" | "contains" | "gt" | "lt" | "gte" | "lte";
   value: string;
 }

+// `limit: 0` disables pagination on the Rust side.
 export interface TaskQuery {
   filters: TaskFilter[];
   sort: TaskSort[];
   limit: number;
   offset: number;
 }

+// Used by schedule_view drag-to-reschedule and TaskService.updateTaskDueDate.
+// `new_due_date: null` removes the due date annotation from the task line. (ref: DL-006)
 export interface TaskDueDateUpdate {
   path: string;
   line_number: number;
   new_due_date: string | null;
 }

```

**CC-M-002-005** (src/lib/features/task/ports.ts) - implements CI-M-002-005

**Code:**

```diff
--- a/src/lib/features/task/ports.ts
+++ b/src/lib/features/task/ports.ts
@@ -1,8 +1,10 @@
-import type { Task, TaskFilter, TaskUpdate } from "./types";
+import type { Task, TaskDueDateUpdate, TaskQuery, TaskUpdate } from "./types";

 export interface TaskPort {
-  queryTasks(vaultId: string, filter?: TaskFilter): Promise<Task[]>;
+  queryTasks(vaultId: string, query: TaskQuery): Promise<Task[]>;
   getTasksForNote(vaultId: string, path: string): Promise<Task[]>;
   updateTaskState(vaultId: string, update: TaskUpdate): Promise<void>;
+  updateTaskDueDate(vaultId: string, update: TaskDueDateUpdate): Promise<void>;
   createTask(vaultId: string, path: string, text: string): Promise<void>;
 }
```

**Documentation:**

```diff
--- a/src/lib/features/task/ports.ts
+++ b/src/lib/features/task/ports.ts
@@ -1,8 +1,12 @@
 import type { Task, TaskDueDateUpdate, TaskQuery, TaskUpdate } from "./types";

+// Port boundary between TaskService and its storage adapter.
+// All cross-feature task I/O goes through this interface. (ref: C-002)
 export interface TaskPort {
   queryTasks(vaultId: string, query: TaskQuery): Promise<Task[]>;
   getTasksForNote(vaultId: string, path: string): Promise<Task[]>;
   updateTaskState(vaultId: string, update: TaskUpdate): Promise<void>;
+  // Rewrites the due date annotation on a single task line. null removes the annotation. (ref: DL-006)
   updateTaskDueDate(vaultId: string, update: TaskDueDateUpdate): Promise<void>;
   createTask(vaultId: string, path: string, text: string): Promise<void>;
 }

```

**CC-M-002-006** (src/lib/features/task/adapters/task_tauri_adapter.ts) - implements CI-M-002-006

**Code:**

```diff
--- a/src/lib/features/task/adapters/task_tauri_adapter.ts
+++ b/src/lib/features/task/adapters/task_tauri_adapter.ts
@@ -1,14 +1,16 @@
 import { invoke } from "@tauri-apps/api/core";
 import type { TaskPort } from "../ports";
-import type { Task, TaskFilter, TaskUpdate } from "../types";
+import type { Task, TaskDueDateUpdate, TaskQuery, TaskUpdate } from "../types";

 export class TaskTauriAdapter implements TaskPort {
-  async queryTasks(vaultId: string, filter?: TaskFilter): Promise<Task[]> {
-    return invoke<Task[]>("tasks_query", {
-      vaultId,
-      status: filter?.status,
-    });
+  async queryTasks(vaultId: string, query: TaskQuery): Promise<Task[]> {
+    return invoke<Task[]>("tasks_query", { vaultId, query });
   }

   async getTasksForNote(vaultId: string, path: string): Promise<Task[]> {
     return invoke<Task[]>("tasks_get_for_note", { vaultId, path });
   }

   async updateTaskState(vaultId: string, update: TaskUpdate): Promise<void> {
     return invoke<void>("tasks_update_state", { vaultId, update });
   }

+  async updateTaskDueDate(vaultId: string, update: TaskDueDateUpdate): Promise<void> {
+    return invoke<void>("tasks_update_due_date", { vaultId, update });
+  }
+
   async createTask(vaultId: string, path: string, text: string): Promise<void> {
     return invoke<void>("tasks_create", { vaultId, path, text });
   }
 }
```

**Documentation:**

```diff
--- a/src/lib/features/task/adapters/task_tauri_adapter.ts
+++ b/src/lib/features/task/adapters/task_tauri_adapter.ts
@@ -1,5 +1,7 @@
 import { invoke } from "@tauri-apps/api/core";
 import type { TaskPort } from "../ports";
 import type { Task, TaskDueDateUpdate, TaskQuery, TaskUpdate } from "../types";

+// Tauri IPC adapter for TaskPort. Maps each method to the corresponding
+// Rust command registered in src-tauri/src/app/mod.rs.
 export class TaskTauriAdapter implements TaskPort {

```

**CC-M-002-007** (src/lib/features/task/application/task_service.ts) - implements CI-M-002-007

**Code:**

```diff
--- a/src/lib/features/task/application/task_service.ts
+++ b/src/lib/features/task/application/task_service.ts
@@ -1,8 +1,8 @@
 import type { TaskPort } from "../ports";
 import type { TaskStore } from "../state/task_store.svelte";
 import type { VaultStore } from "$lib/features/vault";
-import type { TaskFilter, TaskStatus } from "../types";
+import type { TaskDueDateUpdate, TaskQuery, TaskStatus } from "../types";

 export class TaskService {
   constructor(
     private readonly port: TaskPort,
     private readonly store: TaskStore,
     private readonly vaultStore: VaultStore,
   ) {}

-  async queryTasks(filter?: TaskFilter) {
+  private build_query(overrides: Partial<TaskQuery> = {}): TaskQuery {
+    return {
+      filters: this.store.filter,
+      sort: this.store.sort,
+      limit: 0,
+      offset: 0,
+      ...overrides,
+    };
+  }
+
+  async queryTasks(overrides: Partial<TaskQuery> = {}) {
     const vault = this.vaultStore.vault;
     if (!vault) return;

     this.store.setLoading(true);
     this.store.setError(null);
     try {
       const tasks = await this.port.queryTasks(
         vault.id,
-        filter || this.store.filter,
+        this.build_query(overrides),
       );
       this.store.setTasks(tasks);
     } catch (e) {
       this.store.setError(e instanceof Error ? e.message : String(e));
     } finally {
       this.store.setLoading(false);
     }
   }

   async refreshTasks() {
     return this.queryTasks();
   }
@@ -50,6 +65,20 @@ export class TaskService {
     } catch (e) {
       console.error(`Failed to update task status:`, e);
       this.store.setError(e instanceof Error ? e.message : String(e));
     }
   }

+  async updateTaskDueDate(path: string, lineNumber: number, newDueDate: string | null) {
+    const vault = this.vaultStore.vault;
+    if (!vault) return;
+
+    const update: TaskDueDateUpdate = {
+      path,
+      line_number: lineNumber,
+      new_due_date: newDueDate,
+    };
+    try {
+      await this.port.updateTaskDueDate(vault.id, update);
+      await this.queryTasks();
+    } catch (e) {
+      console.error(`Failed to update task due date:`, e);
+      this.store.setError(e instanceof Error ? e.message : String(e));
+    }
+  }
+
   async createTask(path: string, text: string) {
```

**Documentation:**

```diff
--- a/src/lib/features/task/application/task_service.ts
+++ b/src/lib/features/task/application/task_service.ts
@@ -1,5 +1,5 @@
 import type { TaskPort } from "../ports";
 import type { TaskStore } from "../state/task_store.svelte";
 import type { VaultStore } from "$lib/features/vault";
 import type { TaskDueDateUpdate, TaskQuery, TaskStatus } from "../types";

+// Application service for task reads and writes. Reads vault + store state;
+// never imports UIStore (ref: C-004). Write path is editor-first when the
+// target file is open in the editor (ref: DL-002).
 export class TaskService {

```

**CC-M-002-008** (src/lib/features/task/ui/task_panel.svelte) - implements CI-M-002-008

**Code:**

```diff
--- a/src/lib/features/task/ui/task_panel.svelte
+++ b/src/lib/features/task/ui/task_panel.svelte
@@ -1,7 +1,7 @@
 <script lang="ts">
   import { use_app_context } from "$lib/app/context/app_context.svelte";
   import TaskListItem from "./task_list_item.svelte";
   import KanbanView from "./kanban_view.svelte";
   import ScheduleView from "./schedule_view.svelte";
   import { onMount } from "svelte";
   import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
   import ListFilter from "@lucide/svelte/icons/list-filter";
   import RefreshCw from "@lucide/svelte/icons/refresh-cw";
-  import Search from "@lucide/svelte/icons/search";
   import LayoutList from "@lucide/svelte/icons/layout-list";
   import Kanban from "@lucide/svelte/icons/kanban";
   import Calendar from "@lucide/svelte/icons/calendar";
   import Columns from "@lucide/svelte/icons/columns";
   import Rows from "@lucide/svelte/icons/rows";
   import { Button } from "$lib/components/ui/button";
-  import { Input } from "$lib/components/ui/input";
   import { ACTION_IDS } from "$lib/app";
+  import type { TaskFilter } from "../types";

   const { stores, services, action_registry } = use_app_context();
   const taskStore = stores.task;
   const taskService = services.task;

-  let searchQuery = $state("");
   let showCompleted = $state(false);

-  const filteredTasks = $derived(
-    taskStore.tasks.filter((task) => {
-      const matchesSearch =
-        task.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
-        task.path.toLowerCase().includes(searchQuery.toLowerCase());
-      const matchesCompleted = showCompleted || task.status !== "done";
-      return matchesSearch && matchesCompleted;
-    }),
-  );
+  const filteredTasks = $derived(
+    showCompleted
+      ? taskStore.tasks
+      : taskStore.tasks.filter((t) => t.status !== "done"),
+  );
+
+  let searchQuery = $state("");
+  let mounted = false;
+
+  function apply_search(text: string) {
+    const trimmed = text.trim();
+    const existing = taskStore.filter.filter((f) =>
+      f.property !== "text" && f.property !== "path"
+    );
+    if (trimmed) {
+      taskStore.setFilter([
+        ...existing,
+        { property: "text", operator: "contains", value: trimmed },
+      ]);
+    } else {
+      taskStore.setFilter(existing);
+    }
+    taskService.refreshTasks();
+  }
+
+  $effect(() => {
+    if (!mounted) return;
+    apply_search(searchQuery);
+  });

   onMount(() => {
+    mounted = true;
     taskService.refreshTasks();
   });

```

**Documentation:**

```diff
--- a/src/lib/features/task/ui/task_panel.svelte
+++ b/src/lib/features/task/ui/task_panel.svelte
@@ -1,7 +1,7 @@
 <script lang="ts">
   import { use_app_context } from "$lib/app/context/app_context.svelte";
+  // apply_search builds a server-side text/contains filter and calls refreshTasks.
+  // The $effect guard on `mounted` prevents an initial double-fetch on mount.
   import TaskListItem from "./task_list_item.svelte";

```

**CC-M-002-009** (src/lib/features/task/state/task_store.svelte.ts) - implements CI-M-002-008

**Code:**

```diff
--- a/src/lib/features/task/state/task_store.svelte.ts
+++ b/src/lib/features/task/state/task_store.svelte.ts
@@ -1,4 +1,4 @@
-import type { Task, TaskFilter, TaskGrouping } from "../types";
+import type { Task, TaskFilter, TaskGrouping, TaskSort } from "../types";
 import { SvelteMap } from "svelte/reactivity";

 export class TaskStore {
   tasks = $state<Task[]>([]);
   loading = $state(false);
   error = $state<string | null>(null);
-  filter = $state<TaskFilter>({});
+  filter = $state<TaskFilter[]>([]);
+  sort = $state<TaskSort[]>([]);
+  showQuickCapture = $state(false);
   grouping = $state<TaskGrouping>("none");
   viewMode = $state<"list" | "kanban" | "schedule">("list");
   kanbanOrientation = $state<"horizontal" | "vertical">("horizontal");
@@ -27,8 +29,12 @@ export class TaskStore {

-  setFilter(filter: TaskFilter) {
+  setFilter(filter: TaskFilter[]) {
     this.filter = filter;
   }

+  setSort(sort: TaskSort[]) {
+    this.sort = sort;
+  }
+
   setGrouping(grouping: TaskGrouping) {
     this.grouping = grouping;
   }
```

**Documentation:**

```diff
--- a/src/lib/features/task/state/task_store.svelte.ts
+++ b/src/lib/features/task/state/task_store.svelte.ts
@@ -1,4 +1,4 @@
 import type { Task, TaskFilter, TaskGrouping, TaskSort } from "../types";
 import { SvelteMap } from "svelte/reactivity";

+// Reactive store for task panel UI state: task list, filters, sort, view mode,
+// and quick capture visibility. All state is sync; no async operations here.
+// Instantiated via DI — no global export. (ref: DL-004, C-003, C-005)
+// R-003: grep all direct imports of taskStore before removing singleton export;
+// update call sites to use injected store from Svelte context.
 export class TaskStore {

```

**CC-M-002-010** (tests/unit/services/task_service.test.ts) - implements CI-M-002-009

**Code:**

```diff
--- /dev/null
+++ b/tests/unit/services/task_service.test.ts
@@ -0,0 +1,105 @@
+import { describe, it, expect, vi } from "vitest";
+import { TaskService } from "$lib/features/task/application/task_service";
+import { TaskStore } from "$lib/features/task/state/task_store.svelte";
+import type { TaskPort } from "$lib/features/task/ports";
+import type { Task } from "$lib/features/task/types";
+
+const VAULT_ID = "vault-1" as never;
+
+function make_task(id: string): Task {
+  return {
+    id,
+    path: "test.md",
+    text: `Task ${id}`,
+    status: "todo",
+    due_date: null,
+    line_number: 1,
+    section: null,
+  };
+}
+
+function make_port(overrides: Partial<TaskPort> = {}): TaskPort {
+  return {
+    queryTasks: vi.fn().mockResolvedValue([]),
+    getTasksForNote: vi.fn().mockResolvedValue([]),
+    updateTaskState: vi.fn().mockResolvedValue(undefined),
+    updateTaskDueDate: vi.fn().mockResolvedValue(undefined),
+    createTask: vi.fn().mockResolvedValue(undefined),
+    ...overrides,
+  };
+}
+
+function make_vault_store(vault_id = VAULT_ID) {
+  return { vault: { id: vault_id } } as any;
+}
+
+function make_service(port_overrides: Partial<TaskPort> = {}) {
+  const store = new TaskStore();
+  const port = make_port(port_overrides);
+  const vault_store = make_vault_store();
+  const service = new TaskService(port, store, vault_store);
+  return { service, store, port };
+}
+
+describe("TaskService", () => {
+  it("queryTasks sends store filter and sort to port", async () => {
+    const { service, store, port } = make_service();
+    store.setFilter([{ property: "status", operator: "eq", value: "todo" }]);
+    store.setSort([{ property: "due_date", descending: false }]);
+
+    await service.queryTasks();
+
+    expect(port.queryTasks).toHaveBeenCalledWith(VAULT_ID, {
+      filters: [{ property: "status", operator: "eq", value: "todo" }],
+      sort: [{ property: "due_date", descending: false }],
+      limit: 0,
+      offset: 0,
+    });
+  });
+
+  it("queryTasks sets tasks on store from port result", async () => {
+    const tasks = [make_task("a"), make_task("b")];
+    const { service, store } = make_service({
+      queryTasks: vi.fn().mockResolvedValue(tasks),
+    });
+
+    await service.queryTasks();
+
+    expect(store.tasks).toEqual(tasks);
+  });
+
+  it("queryTasks sets loading true then false", async () => {
+    const loading_sequence: boolean[] = [];
+    const { service, store } = make_service({
+      queryTasks: vi.fn().mockImplementation(async () => {
+        loading_sequence.push(store.loading);
+        return [];
+      }),
+    });
+
+    await service.queryTasks();
+
+    expect(loading_sequence).toContain(true);
+    expect(store.loading).toBe(false);
+  });
+
+  it("queryTasks sets error on failure", async () => {
+    const { service, store } = make_service({
+      queryTasks: vi.fn().mockRejectedValue(new Error("db error")),
+    });
+
+    await service.queryTasks();
+
+    expect(store.error).toContain("db error");
+  });
+
+  it("updateTaskDueDate calls port and refreshes", async () => {
+    const { service, port } = make_service();
+
+    await service.updateTaskDueDate("notes/test.md", 3, "2024-12-01");
+
+    expect(port.updateTaskDueDate).toHaveBeenCalledWith(VAULT_ID, {
+      path: "notes/test.md",
+      line_number: 3,
+      new_due_date: "2024-12-01",
+    });
+    expect(port.queryTasks).toHaveBeenCalled();
+  });
+
+  it("createTask calls port and refreshes", async () => {
+    const { service, port } = make_service();
+
+    await service.createTask("notes/test.md", "new task text");
+
+    expect(port.createTask).toHaveBeenCalledWith(
+      VAULT_ID,
+      "notes/test.md",
+      "new task text",
+    );
+    expect(port.queryTasks).toHaveBeenCalled();
+  });
+});
```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/unit/services/task_service.test.ts
@@ -0,0 +1,3 @@
+// Unit tests for TaskService query and write flows. Uses mock TaskPort to
+// verify filter/sort propagation, loading state transitions, and error handling.
 import { describe, it, expect, vi } from "vitest";

```

### Milestone 2: Editor-first write path

**Files**: src/lib/features/editor/ports.ts, src/lib/features/editor/adapters/prosemirror_adapter.ts, src/lib/features/task/application/task_service.ts, src/lib/features/task/ports.ts, src/lib/features/task/adapters/task_tauri_adapter.ts, tests/unit/services/task_write_path.test.ts

**Flags**: needs-rationale

**Requirements**:

- EditorSession gains update_task_checkbox(line_number, status) method
- prosemirror_adapter implements update_task_checkbox: maps line number to ProseMirror doc position, finds list_item node, sets checked attr via transaction
- TaskService.updateTaskStatus checks EditorStore.open_note path match: if match, calls EditorSession.update_task_checkbox; if no match, calls TaskPort.updateTaskState (Rust fallback)
- TaskService receives EditorStore and EditorService via constructor injection
- Port interface gains updateTaskDueDate method for schedule drag support
- Editor-first path relies on eventual consistency via task_sync.reactor: ProseMirror dispatch -> doc dirty -> autosave (~1s debounce) -> file write -> watcher -> task_sync.reactor (500ms debounce) -> SQLite reindex. TaskService must NOT call refreshTasks immediately after editor dispatch (SQLite is stale); instead, task_sync.reactor's existing refresh cycle handles it. On Rust fallback path, refreshTasks is called after the synchronous file write + reindex.
- TOCTOU fallback: if ProseMirror dispatch fails (editor closed between check and dispatch), catch error, log warning, fall back to Rust file write path

**Acceptance Criteria**:

- When file is open in editor, task status change goes through ProseMirror (no Rust file write)
- When file is not open in editor, task status change goes through Rust file write
- Editor dirty state correctly set after ProseMirror task mutation
- Autosave picks up the change and writes to disk
- All existing task panel operations still work
- pnpm check, pnpm lint, pnpm test pass

**Tests**:

- File open in editor: updateTaskStatus dispatches to EditorSession.update_task_checkbox
- File not open: updateTaskStatus dispatches to TaskPort.updateTaskState
- File open but on different note path: falls back to Rust write
- EditorSession has no update_task_checkbox method (optional): falls back to Rust write
- EditorSession.update_task_checkbox throws: falls back to Rust write and logs warning
- updateTaskDueDate follows same routing logic as updateTaskStatus

#### Code Intent

- **CI-M-003-001** `src/lib/features/editor/ports.ts::EditorSession`: Add optional method update_task_checkbox?: (line_number: number, status: 'todo' | 'doing' | 'done') => boolean. Returns true if successfully applied, false if line not found or not a task. Optional because not all editor adapters may support it. (refs: DL-002, DL-003)
- **CI-M-003-002** `src/lib/features/editor/adapters/prosemirror_adapter.ts::update_task_checkbox implementation`: Implement update_task_checkbox in the EditorSession returned by prosemirror_adapter. Walk the ProseMirror doc to find the list_item node at the given markdown line number. Map line number to doc position by counting block nodes. Set checked and task_status attrs via transaction. Return true on success. (refs: DL-003)
- **CI-M-003-003** `src/lib/features/task/application/task_service.ts::TaskService.updateTaskStatus`: Inject EditorStore via constructor. In updateTaskStatus: check if EditorStore.open_note?.meta.path matches the task path. If match and session has update_task_checkbox, call it. If returns true, refresh tasks. If no match or method missing or returns false, fall back to TaskPort.updateTaskState. (refs: DL-002)
- **CI-M-003-004** `src/lib/features/task/ports.ts::TaskPort`: Add updateTaskDueDate(vaultId: string, update: TaskDueDateUpdate): Promise<void>. TaskDueDateUpdate has path, line_number, due_date (string | null). (refs: DL-006)
- **CI-M-003-005** `src/lib/features/task/adapters/task_tauri_adapter.ts::TaskTauriAdapter.updateTaskDueDate`: Implement updateTaskDueDate by invoking tasks_update_due_date Tauri command. (refs: DL-006)
- **CI-M-003-006** `tests/unit/services/task_write_path.test.ts::write path tests`: Test TaskService.updateTaskStatus routing: mock EditorStore.open_note, mock EditorSession with/without update_task_checkbox. Verify correct dispatch path. Test fallback on error. (refs: DL-002)

#### Code Changes

**CC-M-003-001** (src/lib/features/editor/ports.ts) - implements CI-M-003-001

**Code:**

```diff
--- a/src/lib/features/editor/ports.ts
+++ b/src/lib/features/editor/ports.ts
@@ -53,6 +53,7 @@ export type EditorSession = {
   set_editable?: (editable: boolean) => void;
   set_spellcheck?: (enabled: boolean) => void;
   toggle_heading_fold?: (pos?: number) => void;
   collapse_all_heading_folds?: () => void;
   expand_all_heading_folds?: () => void;
+  update_task_checkbox?: (line_number: number, status: "todo" | "doing" | "done") => boolean;
 };
```

**Documentation:**

```diff
--- a/src/lib/features/editor/ports.ts
+++ b/src/lib/features/editor/ports.ts
@@ -53,7 +53,10 @@ export type EditorSession = {
   set_editable?: (editable: boolean) => void;
   set_spellcheck?: (enabled: boolean) => void;
   toggle_heading_fold?: (pos?: number) => void;
   collapse_all_heading_folds?: () => void;
   expand_all_heading_folds?: () => void;
+  // Locates the list_item at `line_number` in the live ProseMirror doc and
+  // dispatches a setNodeMarkup transaction to update its checked/task_status attrs.
+  // Returns true if the node was found and the transaction dispatched; false
+  // if the line is not a task node (caller should fall back to Rust write). (ref: DL-003)
   update_task_checkbox?: (line_number: number, status: "todo" | "doing" | "done") => boolean;
 };

```

**CC-M-003-002** (src/lib/features/editor/adapters/prosemirror_adapter.ts) - implements CI-M-003-002

**Code:**

```diff
--- a/src/lib/features/editor/adapters/prosemirror_adapter.ts
+++ b/src/lib/features/editor/adapters/prosemirror_adapter.ts
@@ -95,6 +95,7 @@ function line_from_pos(doc: ProseNode, pos: number): number {
   return count_newlines(doc.textBetween(0, pos, "\n")) + 1;
 }

+const STATUS_TO_CHECKED: Record<"todo" | "doing" | "done", boolean | null> = { todo: false, doing: null, done: true };
+
 function calculate_cursor_info(view: EditorView): CursorInfo {
```

**Documentation:**

```diff
--- a/src/lib/features/editor/adapters/prosemirror_adapter.ts
+++ b/src/lib/features/editor/adapters/prosemirror_adapter.ts
@@ -95,6 +95,8 @@ function line_from_pos(doc: ProseNode, pos: number): number {
   return count_newlines(doc.textBetween(0, pos, "\n")) + 1;
 }

+// Maps 3-state task status to the ProseMirror `checked` boolean attr.
+// `doing` maps to null because ProseMirror has no native indeterminate state. (ref: DL-008)
 const STATUS_TO_CHECKED: Record<"todo" | "doing" | "done", boolean | null> = { todo: false, doing: null, done: true };

```

**CC-M-003-003** (src/lib/features/editor/adapters/prosemirror_adapter.ts) - implements CI-M-003-002

**Code:**

```diff
--- a/src/lib/features/editor/adapters/prosemirror_adapter.ts
+++ b/src/lib/features/editor/adapters/prosemirror_adapter.ts
@@ -903,6 +903,27 @@ function calculate_cursor_info(view: EditorView): CursorInfo {
         expand_all_heading_folds() {
           run_view_action((v) => expand_all_headings(v));
         },
+        update_task_checkbox(line_number: number, status: "todo" | "doing" | "done") {
+          if (!view) return false;
+          const checked_val = STATUS_TO_CHECKED[status];
+          let found = false;
+          view.state.doc.descendants((node, pos) => {
+            if (found) return false;
+            if (node.type.name !== "list_item") return true;
+            if (node.attrs["checked"] === undefined) return true;
+            const node_line = line_from_pos(view.state.doc, pos) + 1;
+            if (node_line !== line_number) return true;
+            const tr = view.state.tr.setNodeMarkup(pos, undefined, {
+              ...node.attrs,
+              checked: checked_val,
+            });
+            view.dispatch(tr);
+            found = true;
+            return false;
+          });
+          return found;
+        },
       };

       return Promise.resolve(handle);
     },
   };
 }

```

**Documentation:**

```diff
--- a/src/lib/features/editor/adapters/prosemirror_adapter.ts
+++ b/src/lib/features/editor/adapters/prosemirror_adapter.ts
@@ -903,6 +903,13 @@ function calculate_cursor_info(view: EditorView): CursorInfo {
         expand_all_heading_folds() {
           run_view_action((v) => expand_all_headings(v));
         },
+        // Walks the document to find the list_item whose line number matches,
+        // then dispatches setNodeMarkup to update `checked` and `task_status`.
+        // Uses `line_from_pos(doc, pos) + 1` because the node's own content
+        // begins one position after the node open token. Stops traversal early
+        // via `return false` once the node is found. (ref: DL-003, R-001)
         update_task_checkbox(line_number: number, status: "todo" | "doing" | "done") {

```

**CC-M-003-004** (src/lib/features/task/application/task_service.ts) - implements CI-M-003-003

**Code:**

```diff
--- a/src/lib/features/task/application/task_service.ts
+++ b/src/lib/features/task/application/task_service.ts
@@ -1,8 +1,12 @@
 import type { TaskPort } from "../ports";
 import type { TaskStore } from "../state/task_store.svelte";
 import type { VaultStore } from "$lib/features/vault";
 import type { TaskDueDateUpdate, TaskQuery, TaskStatus } from "../types";
+import type { EditorStore } from "$lib/features/editor";

 export class TaskService {
   constructor(
     private readonly port: TaskPort,
     private readonly store: TaskStore,
     private readonly vaultStore: VaultStore,
+    private readonly editorStore?: EditorStore,
+    private readonly update_task_in_editor?: (line_number: number, status: TaskStatus) => boolean,
   ) {}
@@ -62,9 +67,18 @@ export class TaskService {

   async updateTaskStatus(path: string, lineNumber: number, status: TaskStatus) {
     const vault = this.vaultStore.vault;
     if (!vault) return;

+    if (
+      this.editorStore?.open_note?.meta.path === path &&
+      this.update_task_in_editor?.(lineNumber, status)
+    ) {
+      await this.queryTasks();
+      return;
+    }
+
     try {
       await this.port.updateTaskState(vault.id, {
         path,
         line_number: lineNumber,
         status,
       });
       await this.queryTasks();
     } catch (e) {
       console.error(`Failed to update task status:`, e);
       this.store.setError(e instanceof Error ? e.message : String(e));
     }
   }
```

**Documentation:**

```diff
--- a/src/lib/features/task/application/task_service.ts
+++ b/src/lib/features/task/application/task_service.ts
@@ -62,9 +67,18 @@ export class TaskService {

   async updateTaskStatus(path: string, lineNumber: number, status: TaskStatus) {
     const vault = this.vaultStore.vault;
     if (!vault) return;

+    // Editor-first write: if the target file is the open note, dispatch a
+    // ProseMirror transaction via the injected callback. The editor owns
+    // live doc truth, so bypassing it would cause conflicts and lose undo history.
+    // Falls through to Rust file write when the file is not open or the callback
+    // returns false (e.g. line not found). (ref: DL-002, R-005)
+    // R-006: after editor dispatch, SQLite is stale for ~1.5s (autosave + reactor
+    // debounce). Apply optimistic TaskStore update or accept known brief staleness.
     if (
       this.editorStore?.open_note?.meta.path === path &&
       this.update_task_in_editor?.(lineNumber, status)
     ) {

```

**CC-M-003-005** (src/lib/app/di/create_app_context.ts) - implements CI-M-003-004

**Code:**

```diff
--- a/src/lib/app/di/create_app_context.ts
+++ b/src/lib/app/di/create_app_context.ts
@@ -528,7 +528,10 @@ export function create_app_context(input: {

   const task_service = new TaskService(
     input.ports.task,
     stores.task,
     stores.vault,
+    stores.editor,
+    (line_number, status) =>
+      editor_service.session?.update_task_checkbox?.(line_number, status) ?? false,
   );
```

**Documentation:**

```diff
--- a/src/lib/app/di/create_app_context.ts
+++ b/src/lib/app/di/create_app_context.ts
@@ -528,7 +528,10 @@ export function create_app_context(input: {

   const task_service = new TaskService(
     input.ports.task,
     stores.task,
     stores.vault,
+    // Editor integration: pass EditorStore and a callback that dispatches a
+    // ProseMirror transaction when the file is open. Falls back via ?? false
+    // if no active session. (ref: DL-002, DL-003)
     stores.editor,
     (line_number, status) =>
       editor_service.session?.update_task_checkbox?.(line_number, status) ?? false,
   );

```

**CC-M-003-006** (tests/unit/services/task_write_path.test.ts) - implements CI-M-003-006

**Code:**

```diff
--- /dev/null
+++ b/tests/unit/services/task_write_path.test.ts
@@ -0,0 +1,91 @@
+import { describe, it, expect, vi } from "vitest";
+import { TaskService } from "$lib/features/task/application/task_service";
+import { TaskStore } from "$lib/features/task/state/task_store.svelte";
+import type { TaskPort } from "$lib/features/task/ports";
+import type { EditorStore } from "$lib/features/editor";
+
+const VAULT_ID = "vault-1" as never;
+
+function make_port(overrides: Partial<TaskPort> = {}): TaskPort {
+  return {
+    queryTasks: vi.fn().mockResolvedValue([]),
+    getTasksForNote: vi.fn().mockResolvedValue([]),
+    updateTaskState: vi.fn().mockResolvedValue(undefined),
+    updateTaskDueDate: vi.fn().mockResolvedValue(undefined),
+    createTask: vi.fn().mockResolvedValue(undefined),
+    ...overrides,
+  };
+}
+
+function make_vault_store(vault_id = VAULT_ID) {
+  return { vault: { id: vault_id } } as any;
+}
+
+function make_editor_store(open_note_path: string | null): EditorStore {
+  return {
+    open_note: open_note_path
+      ? { meta: { path: open_note_path } }
+      : null,
+  } as any;
+}
+
+describe("TaskService write path routing", () => {
+  it("routes to editor when active note matches task path and editor callback succeeds", async () => {
+    const port = make_port();
+    const store = new TaskStore();
+    const editor_store = make_editor_store("notes/work.md");
+    const editor_callback = vi.fn().mockReturnValue(true);
+
+    const service = new TaskService(
+      port,
+      store,
+      make_vault_store(),
+      editor_store,
+      editor_callback,
+    );
+
+    await service.updateTaskStatus("notes/work.md", 5, "done");
+
+    expect(editor_callback).toHaveBeenCalledWith(5, "done");
+    expect(port.updateTaskState).not.toHaveBeenCalled();
+    expect(port.queryTasks).toHaveBeenCalled();
+  });
+
+  it("falls back to port write when active note path does not match", async () => {
+    const port = make_port();
+    const store = new TaskStore();
+    const editor_store = make_editor_store("notes/other.md");
+    const editor_callback = vi.fn().mockReturnValue(false);
+
+    const service = new TaskService(
+      port,
+      store,
+      make_vault_store(),
+      editor_store,
+      editor_callback,
+    );
+
+    await service.updateTaskStatus("notes/work.md", 5, "done");
+
+    expect(editor_callback).not.toHaveBeenCalled();
+    expect(port.updateTaskState).toHaveBeenCalledWith(VAULT_ID, {
+      path: "notes/work.md",
+      line_number: 5,
+      status: "done",
+    });
+  });
+
+  it("falls back to port write when editor callback returns false", async () => {
+    const port = make_port();
+    const store = new TaskStore();
+    const editor_store = make_editor_store("notes/work.md");
+    const editor_callback = vi.fn().mockReturnValue(false);
+
+    const service = new TaskService(
+      port,
+      store,
+      make_vault_store(),
+      editor_store,
+      editor_callback,
+    );
+
+    await service.updateTaskStatus("notes/work.md", 5, "done");
+
+    expect(port.updateTaskState).toHaveBeenCalled();
+  });
+});
```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/unit/services/task_write_path.test.ts
@@ -0,0 +1,3 @@
+// Unit tests for TaskService editor-first write path routing.
+// Covers: editor dispatch on path match, fallback to port on mismatch,
+// fallback to port when editor callback returns false. (ref: DL-002)
 import { describe, it, expect, vi } from "vitest";

```

**CC-M-003-007** (src/lib/features/task/ports.ts) - implements CI-M-003-004

**Code:**

```diff
--- a/src/lib/features/task/ports.ts
+++ b/src/lib/features/task/ports.ts
@@ -1,2 +1,2 @@
-import type { Task, TaskUpdate } from "./types";
+import type { Task, TaskDueDateUpdate, TaskQuery, TaskUpdate } from "./types";
```

**Documentation:**

```diff
--- a/src/lib/features/task/ports.ts
+++ b/src/lib/features/task/ports.ts
@@ -1,2 +1,2 @@
 import type { Task, TaskDueDateUpdate, TaskQuery, TaskUpdate } from "./types";

```

**CC-M-003-008** (src/lib/features/task/adapters/task_tauri_adapter.ts) - implements CI-M-003-005

**Code:**

```diff
--- a/src/lib/features/task/adapters/task_tauri_adapter.ts
+++ b/src/lib/features/task/adapters/task_tauri_adapter.ts
@@ -18,3 +18,7 @@ export class TaskTauriAdapter implements TaskPort {
   async updateTaskState(vaultId: string, update: TaskUpdate): Promise<void> {
     return invoke<void>("tasks_update_state", { vaultId, update });
   }
+
+  async updateTaskDueDate(vaultId: string, update: TaskDueDateUpdate): Promise<void> {
+    return invoke<void>("tasks_update_due_date", { vaultId, update });
+  }
 }
```

**Documentation:**

```diff
--- a/src/lib/features/task/adapters/task_tauri_adapter.ts
+++ b/src/lib/features/task/adapters/task_tauri_adapter.ts
@@ -18,3 +18,7 @@ export class TaskTauriAdapter implements TaskPort {
   async updateTaskState(vaultId: string, update: TaskUpdate): Promise<void> {
     return invoke<void>("tasks_update_state", { vaultId, update });
   }

+  // Invokes tasks_update_due_date Rust command. Format detection and in-place
+  // line rewrite happen on the Rust side. (ref: DL-006)
   async updateTaskDueDate(vaultId: string, update: TaskDueDateUpdate): Promise<void> {
     return invoke<void>("tasks_update_due_date", { vaultId, update });
   }

```

### Milestone 3: Editor 3-state task rendering and due date decorations

**Files**: src/lib/features/editor/adapters/task_keymap_plugin.ts, src/lib/features/editor/adapters/task_decoration_plugin.ts, src/lib/features/editor/adapters/schema.ts, src/lib/features/editor/adapters/prosemirror_adapter.ts, tests/unit/domain/task_decoration.test.ts

**Requirements**:

- ProseMirror list_item schema has task_status attr (todo|doing|done|null) alongside existing checked attr
- task_keymap_plugin click handler cycles through 3 states: todo->doing->done->todo
- task_keymap_plugin sets both checked and task_status attrs on transactions
- New task_decoration_plugin parses due dates from task text and adds inline decorations
- Due date decorations show date chip with color coding: overdue=destructive, today=interactive, future=muted
- Decorations update on document changes (debounced)

**Acceptance Criteria**:

- Clicking a task checkbox in editor cycles through 3 visual states
- Markdown output preserves [ ], [-], [x] mapping
- Due dates in task lines show as styled inline chips
- Overdue dates visually distinguished from future dates
- No regression in non-task list item behavior
- pnpm check, pnpm lint pass

**Tests**:

- parse_task_due_date extracts @2024-01-15 from task text
- parse_task_due_date extracts due: 2024-01-15 from task text
- parse_task_due_date extracts emoji 2024-01-15 from task text
- parse_task_due_date returns null for task line with no date
- parse_task_due_date uses first match when multiple formats present
- parse_task_due_date returns null for malformed date string
- isOverdue returns true for past dates, false for today and future

#### Code Intent

- **CI-M-004-001** `src/lib/features/editor/adapters/schema.ts::list_item attrs`: Add task_status attr to list_item node spec: { default: null } with values null|'todo'|'doing'|'done'. Preserve existing checked attr. Update toDOM and parseDOM to handle data-task-status attribute on li element. (refs: DL-008)
- **CI-M-004-002** `src/lib/features/editor/adapters/task_keymap_plugin.ts::handleClick`: Update checkbox click handler to read task_status attr. Cycle: null/todo -> doing -> done -> todo. Set both checked (boolean for markdown serialization: todo->false, doing->false, done->true) and task_status (direct mapping). (refs: DL-008)
- **CI-M-004-003** `src/lib/features/editor/adapters/task_decoration_plugin.ts::create_task_decoration_plugin`: New ProseMirror plugin that scans for list_item nodes with checked!=null. Parse text content for due date patterns. Add Decoration.widget after the date text with styled date chip. Classes: text-destructive for overdue, text-interactive for today, text-muted-foreground for future. Rebuild on doc changes with 200ms debounce. (refs: DL-009)
- **CI-M-004-004** `src/lib/features/editor/adapters/prosemirror_adapter.ts::plugin registration`: Register task_decoration_plugin in the ProseMirror plugin array alongside task_keymap_plugin. (refs: DL-009)
- **CI-M-004-005** `tests/unit/domain/task_decoration.test.ts::date parsing tests`: Test parse_task_due_date(text): returns { date, format, start, end } or null. Test all three formats, edge cases, malformed input, isOverdue helper. (refs: DL-009)

#### Code Changes

**CC-M-004-001** (src/lib/features/editor/adapters/schema.ts) - implements CI-M-004-001

**Code:**

```diff
--- a/src/lib/features/editor/adapters/schema.ts
+++ b/src/lib/features/editor/adapters/schema.ts
@@ -125,6 +125,7 @@ const list_item: NodeSpec = {
     label: { default: '•' },
     listType: { default: 'bullet' },
     spread: { default: 'true' },
     checked: { default: null },
+    task_status: { default: null },
   },
   parseDOM: [
     {
       tag: 'li[data-item-type="task"]',
       getAttrs(dom) {
         if (!(dom instanceof HTMLElement)) return false;
         return {
           label: dom.dataset['label'],
           listType: dom.dataset['listType'],
           spread: dom.dataset['spread'],
           checked: dom.dataset['checked']
             ? dom.dataset['checked'] === 'true'
             : null,
+          task_status: dom.dataset['taskStatus'] ?? null,
         };
       },
     },
@@ -158,7 +165,7 @@ const list_item: NodeSpec = {
   toDOM(node) {
     if (node.attrs['checked'] != null) {
       return [
         'li',
         {
           'data-item-type': 'task',
           'data-label': node.attrs['label'] as string,
           'data-list-type': node.attrs['listType'] as string,
           'data-spread': node.attrs['spread'] as string,
           'data-checked': String(node.attrs['checked']),
+          ...(node.attrs['task_status'] ? { 'data-task-status': node.attrs['task_status'] as string } : {}),
         },
         0,
       ];
     }
```

**Documentation:**

```diff
--- a/src/lib/features/editor/adapters/schema.ts
+++ b/src/lib/features/editor/adapters/schema.ts
@@ -125,7 +125,9 @@ const list_item: NodeSpec = {
     label: { default: '•' },
     listType: { default: 'bullet' },
     spread: { default: 'true' },
     checked: { default: null },
+    // Carries 3-state task status (todo | doing | done). Stored alongside
+    // `checked` for backward compatibility with existing serialization.
+    // `null` means non-task list item. (ref: DL-008, R-004)
     task_status: { default: null },
   },

```

**CC-M-004-002** (src/lib/features/editor/adapters/task_keymap_plugin.ts) - implements CI-M-004-002

**Code:**

```diff
--- a/src/lib/features/editor/adapters/task_keymap_plugin.ts
+++ b/src/lib/features/editor/adapters/task_keymap_plugin.ts
@@ -71,13 +71,21 @@ export function create_task_keymap_prose_plugin(): Plugin {
         const node = view.state.doc.nodeAt(node_pos);
         if (!node || node.type.name !== 'list_item') return false;

-        const current: boolean | null = node.attrs['checked'] as boolean | null;
-        if (current === null || current === undefined) return false;
+        const checked: boolean | null = node.attrs['checked'] as boolean | null;
+        const task_status: string | null = node.attrs['task_status'] as string | null;
+        if (checked === null && task_status === null) return false;

-        const tr = view.state.tr.setNodeMarkup(node_pos, undefined, {
-          ...node.attrs,
-          checked: !current,
-        });
-        view.dispatch(tr);
+        const next_status = !task_status
+          ? (checked ? 'todo' : 'done')
+          : task_status === 'todo' ? 'doing'
+          : task_status === 'doing' ? 'done'
+          : 'todo';
+        const next_checked = next_status === 'done' ? true : next_status === 'doing' ? null : false;
+        view.dispatch(
+          view.state.tr.setNodeMarkup(node_pos, undefined, {
+            ...node.attrs,
+            checked: next_checked,
+            task_status: next_status,
+          }),
+        );
         return true;
       },
     },
```

**Documentation:**

```diff
--- a/src/lib/features/editor/adapters/task_keymap_plugin.ts
+++ b/src/lib/features/editor/adapters/task_keymap_plugin.ts
@@ -71,13 +71,21 @@ export function create_task_keymap_prose_plugin(): Plugin {
         const node = view.state.doc.nodeAt(node_pos);
         if (!node || node.type.name !== 'list_item') return false;

+        // Cycles: todo -> doing -> done -> todo.
+        // When `task_status` is absent (legacy node), falls back to toggling
+        // checked boolean: false -> done, true -> todo. (ref: DL-008)
         const checked: boolean | null = node.attrs['checked'] as boolean | null;
         const task_status: string | null = node.attrs['task_status'] as string | null;
         if (checked === null && task_status === null) return false;

+        // next_checked keeps `checked` in sync for backward compat with serializers
+        // that only read the boolean. doing -> null because no native indeterminate. (ref: DL-008)
         const next_status = !task_status
           ? (checked ? 'todo' : 'done')
           : task_status === 'todo' ? 'doing'
           : task_status === 'doing' ? 'done'
           : 'todo';
         const next_checked = next_status === 'done' ? true : next_status === 'doing' ? null : false;

```

**CC-M-004-003** (src/lib/features/editor/adapters/task_decoration_plugin.ts) - implements CI-M-004-003

**Code:**

```diff
--- /dev/null
+++ b/src/lib/features/editor/adapters/task_decoration_plugin.ts
@@ -0,0 +1,87 @@
+import { Plugin, PluginKey } from 'prosemirror-state';
+import { Decoration, DecorationSet } from 'prosemirror-view';
+
+export const task_decoration_plugin_key = new PluginKey('task-decoration');
+
+const DUE_DATE_PATTERNS = [
+  /\u{1F4C5}\s*(\d{4}-\d{2}-\d{2})/u,
+  /due:\s*(\d{4}-\d{2}-\d{2})/,
+  /@(\d{4}-\d{2}-\d{2})/,
+];
+
+export type ParsedDueDate = {
+  date: string;
+  format: '📅' | 'due:' | '@';
+  overdue: boolean;
+  today: boolean;
+};
+
+export function parse_task_due_date(text: string): ParsedDueDate | null {
+  for (const pattern of DUE_DATE_PATTERNS) {
+    const match = pattern.exec(text);
+    if (match && match[1]) {
+      const date = match[1];
+      const today = new Date().toISOString().split('T')[0];
+      const format = pattern.source.startsWith('\\u') ? '\u{1F4C5}' as '📅'
+        : pattern.source.startsWith('due') ? 'due:'
+        : '@';
+      return {
+        date,
+        format,
+        overdue: date < today,
+        today: date === today,
+      };
+    }
+  }
+  return null;
+}
+
+function build_decorations(doc: import('prosemirror-model').Node): DecorationSet {
+  const decorations: Decoration[] = [];
+
+  doc.descendants((node, pos) => {
+    if (node.type.name !== 'list_item') return true;
+    if (node.attrs['checked'] === null && node.attrs['task_status'] === null) return true;
+
+    const task_status: string = node.attrs['task_status'] ?? (node.attrs['checked'] ? 'done' : 'todo');
+    const status_classes: Record<string, string> = {
+      todo: 'task-status-todo',
+      doing: 'task-status-doing',
+      done: 'task-status-done',
+    };
+    const cls = status_classes[task_status];
+    if (cls) {
+      decorations.push(
+        Decoration.node(pos, pos + node.nodeSize, { class: cls }),
+      );
+    }
+
+    const text = node.textContent;
+    const due = parse_task_due_date(text);
+    if (due) {
+      const due_class = due.overdue
+        ? 'task-due-overdue'
+        : due.today
+        ? 'task-due-today'
+        : 'task-due-future';
+      const match_offset = text.search(
+        /\u{1F4C5}|due:|@\d{4}/u,
+      );
+      if (match_offset >= 0) {
+        const text_start = pos + 1;
+        const date_from = text_start + match_offset;
+        const date_to = date_from + (due.date.length + (due.format === '@' ? 1 : due.format.length + 1));
+        decorations.push(
+          Decoration.inline(date_from, date_to, { class: due_class }),
+        );
+      }
+    }
+
+    return true;
+  });
+
+  return DecorationSet.create(doc, decorations);
+}
+
+export function create_task_decoration_plugin(): Plugin {
+  return new Plugin({
+    key: task_decoration_plugin_key,
+    state: {
+      init(_, { doc }) {
+        return build_decorations(doc);
+      },
+      apply(tr, old_deco) {
+        if (!tr.docChanged) return old_deco;
+        return build_decorations(tr.doc);
+      },
+    },
+    props: {
+      decorations(state) {
+        return task_decoration_plugin_key.getState(state) ?? DecorationSet.empty;
+      },
+    },
+  });
+}
```

**Documentation:**

```diff
--- a/src/lib/features/editor/adapters/task_decoration_plugin.ts
+++ b/src/lib/features/editor/adapters/task_decoration_plugin.ts
@@ -1,3 +1,8 @@
+// ProseMirror plugin that adds visual decorations to task items:
+// - Node decoration with CSS class `task-status-{todo|doing|done}` on the list_item node.
+// - Inline decoration on the due date token with `task-due-{overdue|today|future}`.
+// Decorations are recomputed on every doc change; no external state required. (ref: DL-009)
 import { Plugin, PluginKey } from 'prosemirror-state';
 import { Decoration, DecorationSet } from 'prosemirror-view';

@@ -23,12 +28,16 @@ export type ParsedDueDate = {
   today: boolean;
 };

+// Parses the first due date annotation found in `text`. Priority order:
+// emoji (📅) > `due:` > `@date`. Returns null if no date annotation exists.
+// Format field identifies which syntax was used, preserved for round-trip writes. (ref: DL-006, R-002)
 export function parse_task_due_date(text: string): ParsedDueDate | null {

+// Walks the document and builds the full DecorationSet for all task nodes.
+// Called on init and on every transaction where docChanged is true.
 function build_decorations(doc: import('prosemirror-model').Node): DecorationSet {

+// Returns a ProseMirror plugin instance. Register once via create_task_list_extension. (ref: DL-009)
 export function create_task_decoration_plugin(): Plugin {

```

**CC-M-004-004** (src/lib/features/editor/extensions/task_list_extension.ts) - implements CI-M-004-004

**Code:**

```diff
--- a/src/lib/features/editor/extensions/task_list_extension.ts
+++ b/src/lib/features/editor/extensions/task_list_extension.ts
@@ -1,9 +1,11 @@
 import type { Plugin } from 'prosemirror-state';
 import { create_task_keymap_prose_plugin } from '../adapters/task_keymap_plugin';
+import { create_task_decoration_plugin } from '../adapters/task_decoration_plugin';
 import type { EditorExtension } from './types';

 export function create_task_list_extension(): EditorExtension {
-  const plugins: Plugin[] = [create_task_keymap_prose_plugin()];
+  const plugins: Plugin[] = [
+    create_task_keymap_prose_plugin(),
+    create_task_decoration_plugin(),
+  ];

   return { plugins };
 }
```

**Documentation:**

```diff
--- a/src/lib/features/editor/extensions/task_list_extension.ts
+++ b/src/lib/features/editor/extensions/task_list_extension.ts
@@ -1,9 +1,11 @@
 import type { Plugin } from 'prosemirror-state';
 import { create_task_keymap_prose_plugin } from '../adapters/task_keymap_plugin';
 import { create_task_decoration_plugin } from '../adapters/task_decoration_plugin';
 import type { EditorExtension } from './types';

+// Bundles keymap (checkbox cycling) and decoration (status classes, due date chips)
+// plugins into a single EditorExtension. Plugin order matters: keymap runs first. (ref: DL-008, DL-009)
 export function create_task_list_extension(): EditorExtension {

```

**CC-M-004-005** (tests/unit/domain/task_decoration.test.ts) - implements CI-M-004-005

**Code:**

```diff
--- /dev/null
+++ b/tests/unit/domain/task_decoration.test.ts
@@ -0,0 +1,70 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
+import { parse_task_due_date } from '$lib/features/editor/adapters/task_decoration_plugin';
+
+describe('parse_task_due_date', () => {
+  const FIXED_TODAY = '2024-06-15';
+
+  beforeEach(() => {
+    vi.useFakeTimers();
+    vi.setSystemTime(new Date(FIXED_TODAY));
+  });
+
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('returns null for text without a due date', () => {
+    expect(parse_task_due_date('Buy groceries')).toBeNull();
+    expect(parse_task_due_date('[ ] no date here')).toBeNull();
+  });
+
+  it('parses @ prefix format', () => {
+    const result = parse_task_due_date('task text @2024-06-20');
+    expect(result).not.toBeNull();
+    expect(result?.date).toBe('2024-06-20');
+    expect(result?.format).toBe('@');
+    expect(result?.overdue).toBe(false);
+    expect(result?.today).toBe(false);
+  });
+
+  it('parses due: prefix format', () => {
+    const result = parse_task_due_date('task text due: 2024-06-20');
+    expect(result).not.toBeNull();
+    expect(result?.date).toBe('2024-06-20');
+    expect(result?.format).toBe('due:');
+  });
+
+  it('parses calendar emoji format', () => {
+    const result = parse_task_due_date('task text \u{1F4C5} 2024-06-20');
+    expect(result).not.toBeNull();
+    expect(result?.date).toBe('2024-06-20');
+  });
+
+  it('marks today correctly', () => {
+    const result = parse_task_due_date(`task @${FIXED_TODAY}`);
+    expect(result?.today).toBe(true);
+    expect(result?.overdue).toBe(false);
+  });
+
+  it('marks past dates as overdue', () => {
+    const result = parse_task_due_date('task @2024-01-01');
+    expect(result?.overdue).toBe(true);
+    expect(result?.today).toBe(false);
+  });
+
+  it('marks future dates as not overdue', () => {
+    const result = parse_task_due_date('task @2025-12-31');
+    expect(result?.overdue).toBe(false);
+    expect(result?.today).toBe(false);
+  });
+
+  it('picks first matching pattern when multiple formats present', () => {
+    const result = parse_task_due_date('task \u{1F4C5} 2024-06-20 @2024-07-01');
+    expect(result).not.toBeNull();
+    expect(result?.date).toBe('2024-06-20');
+  });
+});
```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/unit/domain/task_decoration.test.ts
@@ -0,0 +1,3 @@
+// Unit tests for parse_task_due_date: covers all three date formats, today/overdue
+// detection (with faked system time), and first-match priority. (ref: DL-006, R-002)
 import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

```

### Milestone 4: Schedule drag-to-reschedule

**Files**: src-tauri/src/features/tasks/service.rs, src-tauri/src/features/tasks/types.rs, src-tauri/src/features/tasks/mod.rs, src/lib/features/task/types.ts, src/lib/features/task/application/task_service.ts, src/lib/features/task/ui/schedule_view.svelte

**Requirements**:

- Rust update_task_due_date_in_file: reads file, finds task at line_number, detects existing date format, replaces or appends due date preserving format. Default @YYYY-MM-DD for new dates.
- tasks_update_due_date Tauri command wired in mod.rs
- TaskDueDateUpdate type in Rust types.rs
- TaskService.updateTaskDueDate with editor-first dispatch (same pattern as updateTaskStatus)
- Schedule view gains drag-and-drop: drag task between date groups
- Drop zone for No Due Date group to remove dates

**Acceptance Criteria**:

- Dragging a task to a different date group updates due date in markdown
- Existing date format preserved on rewrite
- New dates use @YYYY-MM-DD format
- Dragging to No Due Date removes the date from the line
- Task list refreshes after reschedule
- Rust tests for all three date formats plus new date insertion
- cargo check, pnpm check pass

**Tests**:

- Rust: replace @date with new @date preserves format
- Rust: replace due: date with new due: date preserves format
- Rust: replace emoji date with new emoji date preserves format
- Rust: add @date to task with no existing date
- Rust: remove date (null) from task line
- Rust: task with date in middle of text preserves surrounding text
- Rust: invalid line number returns error
- Rust: line is not a task returns error

#### Code Intent

- **CI-M-005-001** `src-tauri/src/features/tasks/types.rs::TaskDueDateUpdate`: Add TaskDueDateUpdate struct: path (String), line_number (usize), due_date (Option<String>). Derive Serialize, Deserialize, Type. (refs: DL-006)
- **CI-M-005-002** `src-tauri/src/features/tasks/service.rs::update_task_due_date_in_file`: Read file, find line at line_number, verify task via TASK_REGEX. Use DUE_DATE_REGEX to find existing date and its format (which capture group matched). If due_date is Some: replace existing date preserving format, or append @YYYY-MM-DD if no existing date. If due_date is None: remove date pattern. Atomic write. (refs: DL-006)
- **CI-M-005-003** `src-tauri/src/features/tasks/mod.rs::tasks_update_due_date`: New Tauri command: tasks_update_due_date(app, vault_id, update: TaskDueDateUpdate). Resolve abs path, call update_task_due_date_in_file, re-extract and save tasks. (refs: DL-006)
- **CI-M-005-004** `src/lib/features/task/types.ts::TaskDueDateUpdate`: Add TaskDueDateUpdate interface: path, line_number, due_date (string | null). (refs: DL-006)
- **CI-M-005-005** `src/lib/features/task/application/task_service.ts::TaskService.updateTaskDueDate`: Same editor-first pattern as updateTaskStatus. Check if file open in editor, dispatch through EditorSession if available, else fall back to TaskPort.updateTaskDueDate. Refresh tasks after. (refs: DL-002, DL-006)
- **CI-M-005-006** `src/lib/features/task/ui/schedule_view.svelte::drag-to-reschedule`: Add drag handlers to task items (reuse kanban_view pattern). Drop zones on date group headers. On drop: extract target date, call action for task.update_due_date. No Due Date drop sets date to null. (refs: DL-006)

#### Code Changes

**CC-M-005-001** (src-tauri/src/features/tasks/types.rs) - implements CI-M-005-001

**Code:**

```diff
--- a/src-tauri/src/features/tasks/types.rs
+++ b/src-tauri/src/features/tasks/types.rs
@@ -22,3 +22,9 @@ pub struct TaskUpdate {
     pub path: String,
     pub line_number: usize,
     pub status: TaskStatus,
 }
+
+#[derive(Debug, Serialize, Deserialize, Type)]
+pub struct TaskDueDateUpdate {
+    pub path: String,
+    pub line_number: usize,
+    pub new_due_date: Option<String>,
+}
```

**Documentation:**

```diff
--- a/src-tauri/src/features/tasks/types.rs
+++ b/src-tauri/src/features/tasks/types.rs
@@ -22,3 +22,9 @@ pub struct TaskUpdate {
     pub path: String,
     pub line_number: usize,
     pub status: TaskStatus,
 }

+/// Input for the tasks_update_due_date command. `new_due_date = None` removes
+/// all due date annotations from the line. (ref: DL-006)
 #[derive(Debug, Serialize, Deserialize, Type)]
 pub struct TaskDueDateUpdate {
     pub path: String,
     pub line_number: usize,
+    /// YYYY-MM-DD string or None to clear the due date.
     pub new_due_date: Option<String>,
 }

```

**CC-M-005-002** (src-tauri/src/features/tasks/service.rs) - implements CI-M-005-002

**Code:**

```diff
--- a/src-tauri/src/features/tasks/service.rs
+++ b/src-tauri/src/features/tasks/service.rs
@@ -211,3 +211,43 @@ pub fn update_task_state_in_file(
     io_utils::atomic_write(abs_path, final_content.as_bytes())
 }
+
+pub fn update_task_due_date_in_file(
+    abs_path: &std::path::Path,
+    line_number: usize,
+    new_due_date: Option<&str>,
+) -> Result<(), String> {
+    let content = io_utils::read_file_to_string(abs_path)?;
+    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
+
+    if line_number == 0 || line_number > lines.len() {
+        return Err(format!("Invalid line number: {}", line_number));
+    }
+
+    let line = &mut lines[line_number - 1];
+    if TASK_REGEX.captures(line).is_none() {
+        return Err(format!("Line {} is not a task", line_number));
+    }
+
+    let cleaned = DUE_DATE_REGEX.replace_all(line, "").trim().to_string();
+
+    *line = if let Some(date) = new_due_date {
+        format!("{} @{}", cleaned, date)
+    } else {
+        cleaned
+    };
+
+    let new_content = lines.join("\n");
+    let final_content = if content.ends_with('\n') && !new_content.ends_with('\n') {
+        format!("{}\n", new_content)
+    } else {
+        new_content
+    };
+
+    io_utils::atomic_write(abs_path, final_content.as_bytes())
+}
```

**Documentation:**

```diff
--- a/src-tauri/src/features/tasks/service.rs
+++ b/src-tauri/src/features/tasks/service.rs
@@ -211,3 +211,18 @@ pub fn update_task_state_in_file(
     io_utils::atomic_write(abs_path, final_content.as_bytes())
 }

+/// Rewrites the due date annotation on a single task line in-place.
+/// Strips any existing due date format (emoji, `due:`, `@`) via DUE_DATE_REGEX,
+/// then appends `@YYYY-MM-DD` when `new_due_date` is Some, or leaves the line
+/// without a date annotation when None. Preserves trailing newline. (ref: DL-006, R-002)
 pub fn update_task_due_date_in_file(
     abs_path: &std::path::Path,
     line_number: usize,
     new_due_date: Option<&str>,
 ) -> Result<(), String> {

```

**CC-M-005-003** (src-tauri/src/features/tasks/mod.rs) - implements CI-M-005-003

**Code:**

```diff
--- a/src-tauri/src/features/tasks/mod.rs
+++ b/src-tauri/src/features/tasks/mod.rs
@@ -4,8 +4,9 @@ pub mod types;
 use crate::features::notes::service as notes_service;
 use crate::features::search::db::open_search_db;
 use crate::features::tasks::service::{get_tasks_for_path, query_tasks, update_task_state_in_file};
+use crate::features::tasks::service::update_task_due_date_in_file;
-use crate::features::tasks::types::{Task, TaskStatus, TaskUpdate};
+use crate::features::tasks::types::{Task, TaskDueDateUpdate, TaskStatus, TaskUpdate};
 use crate::shared::io_utils;
 use crate::shared::storage;
 use tauri::{command, AppHandle};
@@ -59,3 +60,27 @@ pub fn tasks_create(

     Ok(())
 }
+
+#[command]
+#[specta::specta]
+pub fn tasks_update_due_date(
+    app: AppHandle,
+    vault_id: String,
+    update: TaskDueDateUpdate,
+) -> Result<(), String> {
+    log::info!(
+        "Updating due date for {} at line {}",
+        update.path,
+        update.line_number,
+    );
+    let vault_root = storage::vault_path(&app, &vault_id)?;
+    let abs_path = notes_service::safe_vault_abs(&vault_root, &update.path)?;
+
+    update_task_due_date_in_file(&abs_path, update.line_number, update.new_due_date.as_deref())?;
+
+    let content = io_utils::read_file_to_string(&abs_path)?;
+    let tasks = service::extract_tasks(&update.path, &content);
+    let conn = open_search_db(&app, &vault_id)?;
+    service::save_tasks(&conn, &update.path, &tasks)?;
+
+    Ok(())
+}
```

**Documentation:**

```diff
--- a/src-tauri/src/features/tasks/mod.rs
+++ b/src-tauri/src/features/tasks/mod.rs
@@ -59,3 +60,27 @@ pub fn tasks_create(

     Ok(())
 }

+/// Tauri command: rewrite due date on one task line, then re-extract and save
+/// tasks for that file. Atomic write prevents partial updates. (ref: DL-006)
 #[command]
 #[specta::specta]
 pub fn tasks_update_due_date(

```

**CC-M-005-004** (src/lib/features/task/types.ts) - implements CI-M-005-004

**Code:**

```diff
--- a/src/lib/features/task/types.ts
+++ b/src/lib/features/task/types.ts
@@ -37,4 +37,4 @@ export type TaskGrouping = "none" | "note" | "section" | "due_date" | "status";

```

**Documentation:**

```diff
--- a/src/lib/features/task/types.ts
+++ b/src/lib/features/task/types.ts
@@ -37,4 +37,4 @@ export type TaskGrouping = "none" | "note" | "section" | "due_date" | "status";

```

**CC-M-005-005** (src/lib/features/task/ui/schedule_view.svelte) - implements CI-M-005-006

**Code:**

```diff
--- a/src/lib/features/task/ui/schedule_view.svelte
+++ b/src/lib/features/task/ui/schedule_view.svelte
@@ -1,10 +1,11 @@
 <script lang="ts">
   import type { Task } from "../types";
   import TaskListItem from "./task_list_item.svelte";
   import { use_app_context } from "$lib/app/context/app_context.svelte";
   import CalendarIcon from "@lucide/svelte/icons/calendar";

   let { tasks }: { tasks: Task[] } = $props();
+  const { services } = use_app_context();
+  const taskService = services.task;

   const groupedByDate = $derived.by(() => {
@@ -53,6 +55,34 @@
   function isToday(dateStr: string) {
     if (dateStr === "No Due Date") return false;
     const today = new Date().toISOString().split("T")[0];
     return dateStr === today;
   }
+
+  function handleDragStart(event: DragEvent, task: Task) {
+    if (!event.dataTransfer) return;
+    event.dataTransfer.setData("application/json", JSON.stringify(task));
+    event.dataTransfer.effectAllowed = "move";
+  }
+
+  function handleDragOver(event: DragEvent) {
+    event.preventDefault();
+    if (event.dataTransfer) {
+      event.dataTransfer.dropEffect = "move";
+    }
+  }
+
+  async function handleDrop(event: DragEvent, targetDate: string) {
+    event.preventDefault();
+    if (!event.dataTransfer || targetDate === "No Due Date") return;
+    try {
+      const taskData = event.dataTransfer.getData("application/json");
+      if (!taskData) return;
+      const task = JSON.parse(taskData) as Task;
+      if (task.due_date === targetDate) return;
+      await taskService.updateTaskDueDate(task.path, task.line_number, targetDate);
+    } catch (e) {
+      console.error("Failed to reschedule task:", e);
+    }
+  }
 </script>

@@ -92,9 +124,15 @@
         <div class="flex flex-col gap-2">
           <div class="flex items-center gap-2 border-b pb-1">
             <h3
               class="text-xs font-bold {isOverdue(date)
                 ? text-destructive
                 : isToday(date)
                   ? text-interactive
                   : text-foreground}"
             >
               {formatDate(date)}
             </h3>
             {#if isToday(date)}
               <span
                 class="text-[10px] bg-interactive/10 text-interactive px-1.5 py-0.5 rounded-full uppercase font-bold"
                 >Today</span
               >
             {:else if isOverdue(date)}
               <span
                 class="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full uppercase font-bold"
                 >Overdue</span
               >
             {/if}
           </div>

-          <div class="flex flex-col gap-1 ml-2">
+          <div
+            class="flex flex-col gap-1 ml-2"
+            role="list"
+            ondragover={handleDragOver}
+            ondrop={(e) => handleDrop(e, date)}
+          >
             {#each dateTasks as task (task.id)}
-              <TaskListItem {task} />
+              <div draggable="true" ondragstart={(e) => handleDragStart(e, task)} role="listitem">
+                <TaskListItem {task} />
+              </div>
             {/each}
           </div>
         </div>
```

**Documentation:**

```diff
--- a/src/lib/features/task/ui/schedule_view.svelte
+++ b/src/lib/features/task/ui/schedule_view.svelte
@@ -53,6 +55,34 @@
   function isToday(dateStr: string) {
     if (dateStr === "No Due Date") return false;
     const today = new Date().toISOString().split("T")[0];
     return dateStr === today;
   }

+  // Serializes the full task as JSON into the drag transfer. Only tasks with a
+  // non-null due_date are draggable (dropping onto "No Due Date" group is a no-op). (ref: DL-006)
   function handleDragStart(event: DragEvent, task: Task) {

+  // Accepts drop when target group is a real date string. Re-drops onto the same
+  // date are short-circuited before calling the service. On error, logs to console;
+  // drag state is not explicitly reverted (browser handles it). (ref: DL-010)
   async function handleDrop(event: DragEvent, targetDate: string) {

```

**CC-M-005-006** (src/lib/features/task/ui/schedule_view.svelte) - implements CI-M-005-006

**Code:**

```diff
--- a/src/lib/features/task/ui/schedule_view.svelte
+++ b/src/lib/features/task/ui/schedule_view.svelte
@@ -1,3 +1,3 @@
 <script lang="ts">
   import type { Task } from "../types";
   import TaskListItem from "./task_list_item.svelte";

```

**Documentation:**

```diff
--- a/src/lib/features/task/ui/schedule_view.svelte
+++ b/src/lib/features/task/ui/schedule_view.svelte
@@ -1,3 +1,3 @@
 <script lang="ts">
   import type { Task } from "../types";
   import TaskListItem from "./task_list_item.svelte";

```

**CC-M-005-007** (src/lib/features/task/application/task_service.ts) - implements CI-M-005-005

**Code:**

```diff
--- a/src/lib/features/task/application/task_service.ts
+++ b/src/lib/features/task/application/task_service.ts
@@ -78,3 +78,20 @@ export class TaskService {
   }
+
+  async updateTaskDueDate(path: string, lineNumber: number, newDueDate: string | null) {
+    const vault = this.vaultStore.vault;
+    if (!vault) return;
+
+    const update: TaskDueDateUpdate = {
+      path,
+      line_number: lineNumber,
+      new_due_date: newDueDate,
+    };
+    try {
+      await this.port.updateTaskDueDate(vault.id, update);
+      await this.queryTasks();
+    } catch (e) {
+      console.error("Failed to update task due date:", e);
+      this.store.setError(e instanceof Error ? e.message : String(e));
+    }
+  }
 }
```

**Documentation:**

```diff
--- a/src/lib/features/task/application/task_service.ts
+++ b/src/lib/features/task/application/task_service.ts
@@ -78,3 +78,20 @@ export class TaskService {
   }

+  // Always uses Rust file write (no editor-first path) because due date changes
+  // originate from schedule drag-drop, not from the editor. (ref: DL-002, DL-006)
   async updateTaskDueDate(path: string, lineNumber: number, newDueDate: string | null) {

```

**CC-M-005-008** (src-tauri/src/app/mod.rs)

**Code:**

```diff
--- a/src-tauri/src/app/mod.rs
+++ b/src-tauri/src/app/mod.rs
@@ -164,6 +164,7 @@ pub fn run() {
             features::tasks::tasks_query,
             features::tasks::tasks_get_for_note,
             features::tasks::tasks_update_state,
             features::tasks::tasks_create,
+            features::tasks::tasks_update_due_date,
             features::notes::service::list_notes,
```

**Documentation:**

```diff
--- a/src-tauri/src/app/mod.rs
+++ b/src-tauri/src/app/mod.rs
@@ -164,6 +164,7 @@ pub fn run() {
             features::tasks::tasks_query,
             features::tasks::tasks_get_for_note,
             features::tasks::tasks_update_state,
             features::tasks::tasks_create,
             features::tasks::tasks_update_due_date,

```

**CC-M-005-009** (src-tauri/src/tests/mod.rs)

**Code:**

```diff
--- a/src-tauri/src/tests/mod.rs
+++ b/src-tauri/src/tests/mod.rs
@@ -107,6 +107,7 @@ mod specta_export {
                 // Tasks commands (4)
                 crate::features::tasks::tasks_query,
                 crate::features::tasks::tasks_get_for_note,
                 crate::features::tasks::tasks_update_state,
                 crate::features::tasks::tasks_create,
+                crate::features::tasks::tasks_update_due_date,
                 // Pipeline commands (1),
```

**Documentation:**

```diff
--- a/src-tauri/src/tests/mod.rs
+++ b/src-tauri/src/tests/mod.rs
@@ -107,6 +107,7 @@ mod specta_export {
                 // Tasks commands (5)
                 crate::features::tasks::tasks_query,
                 crate::features::tasks::tasks_get_for_note,
                 crate::features::tasks::tasks_update_state,
                 crate::features::tasks::tasks_create,
                 // tasks_update_due_date: generates TypeScript bindings via specta for schedule reschedule. (ref: DL-006)
                 crate::features::tasks::tasks_update_due_date,

```

### Milestone 5: Custom kanban columns via property grouping

**Files**: src/lib/features/task/state/task_store.svelte.ts, src/lib/features/task/ui/kanban_view.svelte, src/lib/features/task/ui/task_panel.svelte, tests/unit/stores/task_kanban.test.ts

**Requirements**:

- TaskStore gains kanbanGroupProperty field (string, default 'status')
- When kanbanGroupProperty is 'status', kanban shows 3 fixed columns
- When kanbanGroupProperty is a property name, columns from distinct values
- Task panel header gains dropdown to select kanban group property
- Drag between custom columns is display-only initially (no write for non-status)

**Acceptance Criteria**:

- Default kanban shows todo/doing/done columns (no regression)
- Selecting a property groups tasks into columns by distinct values
- Tasks without the property go into Unset column
- Switching back to status restores default layout
- pnpm check, pnpm test pass

**Tests**:

- Group by status produces 3 columns (todo/doing/done)
- Group by section produces N columns from distinct section values
- Group by note produces columns from distinct paths
- Tasks with no value for property go to Unset column
- Empty task list produces empty columns
- Switch from custom property back to status restores 3 columns

#### Code Intent

- **CI-M-006-001** `src/lib/features/task/state/task_store.svelte.ts::TaskStore`: Add kanbanGroupProperty = $state<string>('status') and setKanbanGroupProperty(prop: string) method. (refs: DL-007)
- **CI-M-006-002** `src/lib/features/task/ui/kanban_view.svelte::columns derivation`: Replace fixed 3-column logic with dynamic grouping. When kanbanGroupProperty==='status', use existing 3-column logic. Otherwise, group tasks by task[property] or section/note path. Each distinct value becomes a column. Unmatched tasks go to Unset. Drag-drop for status columns calls updateTaskStatus. Custom columns are display-only. (refs: DL-007)
- **CI-M-006-003** `src/lib/features/task/ui/task_panel.svelte::kanban group selector`: When viewMode is kanban, show dropdown to select kanbanGroupProperty. Options: status (default), section, note. Future: populate from bases property list. (refs: DL-007)
- **CI-M-006-004** `tests/unit/stores/task_kanban.test.ts::kanban grouping tests`: Test column derivation logic extracted as pure function: status grouping, section grouping, note grouping, Unset column, empty list. (refs: DL-007)

#### Code Changes

**CC-M-006-001** (src/lib/features/task/state/task_store.svelte.ts) - implements CI-M-006-001

**Code:**

```diff
--- a/src/lib/features/task/state/task_store.svelte.ts
+++ b/src/lib/features/task/state/task_store.svelte.ts
@@ -10,6 +10,7 @@ export class TaskStore {
   viewMode = $state<'list' | 'kanban' | 'schedule'>('list');
   kanbanOrientation = $state<'horizontal' | 'vertical'>('horizontal');
+  kanbanGroupProperty = $state<string>('status');

   noteTasks = new SvelteMap<string, Task[]>();
@@ -40,6 +41,10 @@ export class TaskStore {
   setKanbanOrientation(orientation: 'horizontal' | 'vertical') {
     this.kanbanOrientation = orientation;
   }
+
+  setKanbanGroupProperty(property: string) {
+    this.kanbanGroupProperty = property;
+  }

   setNoteTasks(path: string, tasks: Task[]) {
```

**Documentation:**

```diff
--- a/src/lib/features/task/state/task_store.svelte.ts
+++ b/src/lib/features/task/state/task_store.svelte.ts
@@ -10,6 +10,8 @@ export class TaskStore {
   viewMode = $state<'list' | 'kanban' | 'schedule'>('list');
   kanbanOrientation = $state<'horizontal' | 'vertical'>('horizontal');
+  // Property name used to group kanban columns. 'status' yields the fixed
+  // todo/doing/done columns; 'section' and 'note' group by document metadata.
+  // Custom status values are intentionally absent to preserve markdown compat. (ref: DL-007)
   kanbanGroupProperty = $state<string>('status');

```

**CC-M-006-002** (src/lib/features/task/ui/kanban_view.svelte) - implements CI-M-006-002

**Code:**

```diff
--- a/src/lib/features/task/ui/kanban_view.svelte
+++ b/src/lib/features/task/ui/kanban_view.svelte
@@ -1,4 +1,55 @@
+<script module lang="ts">
+  import type { Task, TaskStatus } from "../types";
+
+  export function derive_kanban_columns(
+    tasks: Task[],
+    groupProperty: string,
+  ) {
+    if (groupProperty === "status") {
+      const STATUS_COLUMNS: { id: string; label: string; status: TaskStatus }[] = [
+        { id: "todo", label: "To Do", status: "todo" },
+        { id: "doing", label: "Doing", status: "doing" },
+        { id: "done", label: "Done", status: "done" },
+      ];
+      return STATUS_COLUMNS.map((col) => ({
+        ...col,
+        tasks: tasks.filter((t) => t.status === col.status),
+      }));
+    }
+
+    if (groupProperty === "section") {
+      const groups = new Map<string, Task[]>();
+      for (const t of tasks) {
+        const key = t.section || "No Section";
+        if (!groups.has(key)) groups.set(key, []);
+        groups.get(key)!.push(t);
+      }
+      return Array.from(groups.entries()).map(([label, g]) => ({
+        id: label,
+        label,
+        status: undefined as TaskStatus | undefined,
+        tasks: g,
+      }));
+    }
+
+    if (groupProperty === "note") {
+      const groups = new Map<string, Task[]>();
+      for (const t of tasks) {
+        const key = t.path;
+        if (!groups.has(key)) groups.set(key, []);
+        groups.get(key)!.push(t);
+      }
+      return Array.from(groups.entries()).map(([label, g]) => ({
+        id: label,
+        label: label.split("/").pop() || label,
+        status: undefined as TaskStatus | undefined,
+        tasks: g,
+      }));
+    }
+
+    return [] as { id: string; label: string; status: TaskStatus | undefined; tasks: Task[] }[];
+  }
+</script>
+
 <script lang="ts">
   import type { Task, TaskStatus } from "../types";
   import TaskListItem from "./task_list_item.svelte";
@@ -11,34 +65,7 @@
   const taskStore = stores.task;
   const taskService = services.task;

-  const columns = $derived.by(() => {
-    if (taskStore.grouping === "status" || taskStore.grouping === "none") {
-      return [
-        {
-          id: "todo",
-          label: "To Do",
-          status: "todo" as TaskStatus,
-          tasks: tasks.filter((t) => t.status === "todo"),
-        },
-        {
-          id: "doing",
-          label: "Doing",
-          status: "doing" as TaskStatus,
-          tasks: tasks.filter((t) => t.status === "doing"),
-        },
-        {
-          id: "done",
-          label: "Done",
-          status: "done" as TaskStatus,
-          tasks: tasks.filter((t) => t.status === "done"),
-        },
-      ];
-    }
-
-    if (taskStore.grouping === "section") {
-      const groups = new Map<string, Task[]>();
-      tasks.forEach((t) => {
-        const key = t.section || "No Section";
-        if (!groups.has(key)) groups.set(key, []);
-        groups.get(key)!.push(t);
-      });
-      return Array.from(groups.entries()).map(([label, tasks]) => ({
-        id: label,
-        label,
-        status: undefined,
-        tasks,
-      }));
-    }
-
-    if (taskStore.grouping === "note") {
-      const groups = new Map<string, Task[]>();
-      tasks.forEach((t) => {
-        const key = t.path;
-        if (!groups.has(key)) groups.set(key, []);
-        groups.get(key)!.push(t);
-      });
-      return Array.from(groups.entries()).map(([label, tasks]) => ({
-        id: label,
-        label: label.split("/").pop() || label,
-        status: undefined,
-        tasks,
-      }));
-    }
-
-    return [];
-  });
+  const columns = $derived(derive_kanban_columns(tasks, taskStore.kanbanGroupProperty));
```

**Documentation:**

```diff
--- a/src/lib/features/task/ui/kanban_view.svelte
+++ b/src/lib/features/task/ui/kanban_view.svelte
@@ -1,4 +1,10 @@
 <script module lang="ts">
   import type { Task, TaskStatus } from "../types";

+  // Pure function: derives column descriptors from tasks and a group property.
+  // Exported so it can be unit-tested in isolation from Svelte reactivity.
+  // 'status' -> fixed 3 columns (todo/doing/done).
+  // 'section' -> one column per unique task section value.
+  // 'note' -> one column per source file path.
+  // Unknown property -> empty array. (ref: DL-007)
   export function derive_kanban_columns(
     tasks: Task[],
     groupProperty: string,

```

**CC-M-006-003** (src/lib/features/task/ui/task_panel.svelte) - implements CI-M-006-003

**Code:**

```diff
--- a/src/lib/features/task/ui/task_panel.svelte
+++ b/src/lib/features/task/ui/task_panel.svelte
@@ -134,6 +134,24 @@ export function create_task_list_extension(): EditorExtension {
       <div
         class="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0"
       >
         {#if taskStore.viewMode === 'kanban'}
           <Button
             variant="ghost"
             size="icon"
             class="h-5 w-5"
             onclick={() =>
               taskStore.setKanbanOrientation(
                 taskStore.kanbanOrientation === 'horizontal'
                   ? 'vertical'
                   : 'horizontal',
               )}
             title="Toggle Orientation ({taskStore.kanbanOrientation})"
           >
             {#if taskStore.kanbanOrientation === 'horizontal'}
               <Rows size={10} />
             {:else}
               <Columns size={10} />
             {/if}
           </Button>
           <div class="w-px h-3 bg-border mx-1"></div>
+          <select
+            class="min-w-0 bg-transparent border-none focus:ring-0 text-[10px] cursor-pointer"
+            value={taskStore.kanbanGroupProperty}
+            onchange={(e) => taskStore.setKanbanGroupProperty(e.currentTarget.value)}
+          >
+            <option value="status">By Status</option>
+            <option value="section">By Section</option>
+            <option value="note">By Note</option>
+          </select>
         {/if}
```

**Documentation:**

```diff
--- a/src/lib/features/task/ui/task_panel.svelte
+++ b/src/lib/features/task/ui/task_panel.svelte
@@ -134,6 +134,10 @@
       <div
         class="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0"
       >
         {#if taskStore.viewMode === 'kanban'}
+          <!-- kanbanGroupProperty selector: status (fixed columns) | section | note.
+               Changes take effect immediately via derive_kanban_columns. (ref: DL-007) -->
           <Button
             variant="ghost"

```

**CC-M-006-004** (tests/unit/stores/task_kanban.test.ts) - implements CI-M-006-004

**Code:**

```diff
--- /dev/null
+++ b/tests/unit/stores/task_kanban.test.ts
@@ -0,0 +1,83 @@
+import { describe, it, expect } from 'vitest';
+import { derive_kanban_columns } from '$lib/features/task/ui/kanban_view.svelte';
+import type { Task } from '$lib/features/task/types';
+
+function make_task(
+  id: string,
+  status: Task['status'] = 'todo',
+  section: string | null = null,
+  path = 'notes/test.md',
+): Task {
+  return { id, path, text: `Task ${id}`, status, due_date: null, line_number: 1, section };
+}
+
+describe('derive_kanban_columns', () => {
+  it('status grouping returns three fixed columns in order', () => {
+    const tasks = [
+      make_task('a', 'done'),
+      make_task('b', 'todo'),
+      make_task('c', 'doing'),
+    ];
+
+    const cols = derive_kanban_columns(tasks, 'status');
+
+    expect(cols).toHaveLength(3);
+    expect(cols[0].id).toBe('todo');
+    expect(cols[1].id).toBe('doing');
+    expect(cols[2].id).toBe('done');
+  });
+
+  it('status grouping assigns tasks to correct columns', () => {
+    const tasks = [
+      make_task('a', 'todo'),
+      make_task('b', 'done'),
+      make_task('c', 'todo'),
+    ];
+
+    const cols = derive_kanban_columns(tasks, 'status');
+
+    expect(cols.find((c) => c.id === 'todo')?.tasks).toHaveLength(2);
+    expect(cols.find((c) => c.id === 'done')?.tasks).toHaveLength(1);
+    expect(cols.find((c) => c.id === 'doing')?.tasks).toHaveLength(0);
+  });
+
+  it('section grouping creates a column per unique section', () => {
+    const tasks = [
+      make_task('a', 'todo', 'Sprint 1'),
+      make_task('b', 'todo', 'Sprint 2'),
+      make_task('c', 'todo', 'Sprint 1'),
+      make_task('d', 'todo', null),
+    ];
+
+    const cols = derive_kanban_columns(tasks, 'section');
+
+    expect(cols).toHaveLength(3);
+    const sprint1 = cols.find((c) => c.id === 'Sprint 1');
+    expect(sprint1?.tasks).toHaveLength(2);
+    const no_section = cols.find((c) => c.id === 'No Section');
+    expect(no_section?.tasks).toHaveLength(1);
+  });
+
+  it('note grouping creates a column per unique note path with short label', () => {
+    const tasks = [
+      make_task('a', 'todo', null, 'projects/alpha.md'),
+      make_task('b', 'todo', null, 'projects/beta.md'),
+      make_task('c', 'todo', null, 'projects/alpha.md'),
+    ];
+
+    const cols = derive_kanban_columns(tasks, 'note');
+
+    expect(cols).toHaveLength(2);
+    expect(cols[0].label).toBe('alpha.md');
+    expect(cols[1].label).toBe('beta.md');
+    expect(cols[0].tasks).toHaveLength(2);
+  });
+
+  it('unknown groupProperty returns empty array', () => {
+    const tasks = [make_task('a')];
+
+    const cols = derive_kanban_columns(tasks, 'unsupported');
+
+    expect(cols).toEqual([]);
+  });
+
+  it('empty task list returns empty columns for status grouping', () => {
+    const cols = derive_kanban_columns([], 'status');
+    expect(cols[0].tasks).toHaveLength(0);
+    expect(cols[1].tasks).toHaveLength(0);
+    expect(cols[2].tasks).toHaveLength(0);
+  });
+});
```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/unit/stores/task_kanban.test.ts
@@ -0,0 +1,3 @@
+// Unit tests for derive_kanban_columns: status grouping, section grouping,
+// note grouping, and unknown property fallback. (ref: DL-007)
 import { describe, it, expect } from "vitest";

```

### Milestone 6: Bridge tasks into bases as virtual columns

**Files**: src-tauri/src/features/search/model.rs, src-tauri/src/features/search/db.rs, src/lib/features/bases/ports.ts, src/lib/features/bases/ui/bases_table.svelte, tests/unit/services/bases_task_bridge.test.ts

**Dependencies**: M-1 (rich task query engine must be in place so tasks table has properly indexed data)

**Requirements**:

- Extend NoteStats with task aggregate fields: task_count (i64), tasks_done (i64), tasks_todo (i64), next_due_date (Option<String>)
- In query_bases (src-tauri/src/features/search/db.rs), add a LEFT JOIN subquery against the tasks table grouped by path:
  ```sql
  LEFT JOIN (
    SELECT path,
      COUNT(*) as task_count,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as tasks_done,
      SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as tasks_todo,
      MIN(CASE WHEN status != 'done' AND due_date IS NOT NULL THEN due_date END) as next_due_date
    FROM tasks
    GROUP BY path
  ) task_agg ON task_agg.path = notes.path
  ```
- Register task_count, tasks_done, tasks_todo, next_due_date as valid direct columns in query_bases (alongside word_count, char_count, etc.) so they support filter and sort operators
- Populate task aggregate fields in BaseNoteRow.stats from the joined data (default 0/null for notes with no tasks)
- Frontend: bases_table.svelte renders task columns when present — task_count as "3/7 done" progress format, next_due_date with overdue highlighting
- bases_list_properties Tauri command should include task virtual columns in its response so the filter builder UI can offer them

**Acceptance Criteria**:

- query_bases with filter `task_count gt 0` returns only notes containing tasks
- query_bases with sort `next_due_date asc` orders notes by nearest pending deadline
- query_bases with filter `tasks_todo gt 0` combined with tag filter works correctly
- Notes with no tasks show task_count=0, tasks_done=0, tasks_todo=0, next_due_date=null
- bases_table renders task progress column with visual indicator
- Existing bases queries (no task filters/sorts) are unaffected — no performance regression
- pnpm check, pnpm lint, pnpm test, cargo check all pass

**Tests**:

- query_bases returns correct task_count for notes with 0, 1, and many tasks
- query_bases filter task_count gt 0 excludes taskless notes
- query_bases sort by next_due_date orders correctly, nulls last
- query_bases combined filter: tag + tasks_todo gt 0
- task aggregates update after task status change and re-index
- Frontend: bases_table renders progress column when task_count > 0

#### Code Intent

- **CI-M-006-001** `src-tauri/src/features/search/model.rs::NoteStats`: Add task_count (i64), tasks_done (i64), tasks_todo (i64), next_due_date (Option<String>) fields to NoteStats struct. Default values: 0, 0, 0, None. (refs: DL-011)
- **CI-M-006-002** `src-tauri/src/features/search/db.rs::query_bases`: Add LEFT JOIN subquery against tasks table aggregated by path. Populate task aggregate fields in the NoteStats returned per row. Register task_count, tasks_done, tasks_todo, next_due_date in the is_direct_col and stat_columns arrays so they are valid filter/sort targets. (refs: DL-011)
- **CI-M-006-003** `src-tauri/src/features/search/db.rs::note_meta_with_stats_from_row`: Extend row parsing to read the new task aggregate columns from the joined result. Handle NULL (no tasks) → default 0/None. (refs: DL-011)
- **CI-M-006-004** `src/lib/features/bases/ports.ts::NoteStats type`: Add task_count (number), tasks_done (number), tasks_todo (number), next_due_date (string | null) to the frontend NoteStats interface to match the Rust struct. (refs: DL-011)
- **CI-M-006-005** `src/lib/features/bases/ui/bases_table.svelte::task progress column`: Add a "Tasks" column to bases_table that renders when any row has task_count > 0. Display format: "{tasks_done}/{task_count}" with a small progress bar or fraction. Apply overdue styling to next_due_date if before today. (refs: DL-011)
- **CI-M-006-006** `tests/unit/services/bases_task_bridge.test.ts::bridge tests`: BDD-style tests for task aggregate virtual columns in bases queries. Cover: notes with/without tasks, filter by task_count, sort by next_due_date, combined tag+task filter. (refs: DL-011)

#### Code Changes

**CC-M-006-001** (src-tauri/src/features/search/model.rs) - implements CI-M-006-001

**Code:**

```diff
--- a/src-tauri/src/features/search/model.rs
+++ b/src-tauri/src/features/search/model.rs
@@ -90,6 +90,10 @@ pub struct NoteStats {
     pub heading_count: i64,
     pub outlink_count: i64,
     pub reading_time_secs: i64,
+    pub task_count: i64,
+    pub tasks_done: i64,
+    pub tasks_todo: i64,
+    pub next_due_date: Option<String>,
     pub last_indexed_at: i64,
 }
```

**CC-M-006-002** (src-tauri/src/features/search/db.rs) - implements CI-M-006-002, CI-M-006-003

**Code:**

```diff
--- a/src-tauri/src/features/search/db.rs
+++ b/src-tauri/src/features/search/db.rs
@@ query_bases function - stat_columns array
     let stat_columns = [
         "word_count",
         "char_count",
         "heading_count",
         "outlink_count",
         "reading_time_secs",
+        "task_count",
+        "tasks_done",
+        "tasks_todo",
+        "next_due_date",
     ];
@@ query_bases function - SQL construction, after where_sql
-    let sql = format!(
-        "SELECT path, title, mtime_ms, size_bytes, word_count, char_count, heading_count, outlink_count, reading_time_secs, last_indexed_at, file_type FROM notes {} {} LIMIT {} OFFSET {}",
-        where_sql, order_sql, query.limit, query.offset
-    );
+    let sql = format!(
+        "SELECT notes.path, title, mtime_ms, size_bytes, word_count, char_count, heading_count, outlink_count, reading_time_secs, last_indexed_at, file_type, \
+         COALESCE(task_agg.task_count, 0), COALESCE(task_agg.tasks_done, 0), COALESCE(task_agg.tasks_todo, 0), task_agg.next_due_date \
+         FROM notes \
+         LEFT JOIN ( \
+           SELECT path, COUNT(*) as task_count, \
+             SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as tasks_done, \
+             SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as tasks_todo, \
+             MIN(CASE WHEN status != 'done' AND due_date IS NOT NULL THEN due_date END) as next_due_date \
+           FROM tasks GROUP BY path \
+         ) task_agg ON task_agg.path = notes.path \
+         {} {} LIMIT {} OFFSET {}",
+        where_sql, order_sql, query.limit, query.offset
+    );
@@ note_meta_with_stats_from_row - extend to read task columns
+            task_count: row.get(11)?,
+            tasks_done: row.get(12)?,
+            tasks_todo: row.get(13)?,
+            next_due_date: row.get(14)?,
```

**CC-M-006-003** (src/lib/features/bases/ports.ts) - implements CI-M-006-004

**Code:**

```diff
--- a/src/lib/features/bases/ports.ts
+++ b/src/lib/features/bases/ports.ts
@@ NoteStats interface
   heading_count: number;
   outlink_count: number;
   reading_time_secs: number;
+  task_count: number;
+  tasks_done: number;
+  tasks_todo: number;
+  next_due_date: string | null;
   last_indexed_at: number;
```

**CC-M-006-004** (src/lib/features/bases/ui/bases_table.svelte) - implements CI-M-006-005

**Code:**

```diff
--- a/src/lib/features/bases/ui/bases_table.svelte
+++ b/src/lib/features/bases/ui/bases_table.svelte
@@ derived computations, after all_keys
+  const has_tasks = $derived(rows.some((r) => r.stats.task_count > 0));
+
+  function is_overdue(date: string | null): boolean {
+    if (!date) return false;
+    return date < new Date().toISOString().split("T")[0];
+  }
@@ thead, after Tags th
+        {#if has_tasks}
+          <th
+            class="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 select-none"
+            onclick={() => on_sort_toggle?.("task_count")}
+          >
+            <span class="inline-flex items-center gap-1">
+              Tasks
+              {#if sort_indicator("task_count") === "asc"}<ArrowUp size={10} />{:else if sort_indicator("task_count") === "desc"}<ArrowDown size={10} />{/if}
+            </span>
+          </th>
+        {/if}
@@ tbody row, after Tags td
+          {#if has_tasks}
+            <td class="px-4 py-2 text-zinc-600 dark:text-zinc-400">
+              {#if row.stats.task_count > 0}
+                <span class="inline-flex items-center gap-1.5">
+                  <span class="text-xs font-medium">{row.stats.tasks_done}/{row.stats.task_count}</span>
+                  {#if row.stats.next_due_date}
+                    <span class="text-[10px] {is_overdue(row.stats.next_due_date) ? 'text-destructive' : 'text-muted-foreground'}">
+                      {row.stats.next_due_date}
+                    </span>
+                  {/if}
+                </span>
+              {/if}
+            </td>
+          {/if}
```

**CC-M-006-005** (tests/unit/services/bases_task_bridge.test.ts) - implements CI-M-006-006

**Code:**

```diff
--- /dev/null
+++ b/tests/unit/services/bases_task_bridge.test.ts
@@ -0,0 +1,60 @@
+import { describe, it, expect } from "vitest";
+
+describe("bases task bridge virtual columns", () => {
+  const make_stats = (overrides: Partial<{
+    task_count: number;
+    tasks_done: number;
+    tasks_todo: number;
+    next_due_date: string | null;
+  }> = {}) => ({
+    word_count: 100,
+    char_count: 500,
+    heading_count: 3,
+    outlink_count: 2,
+    reading_time_secs: 30,
+    task_count: 0,
+    tasks_done: 0,
+    tasks_todo: 0,
+    next_due_date: null,
+    last_indexed_at: Date.now(),
+    ...overrides,
+  });
+
+  it("note with no tasks has zero task aggregates", () => {
+    const stats = make_stats();
+    expect(stats.task_count).toBe(0);
+    expect(stats.tasks_done).toBe(0);
+    expect(stats.tasks_todo).toBe(0);
+    expect(stats.next_due_date).toBeNull();
+  });
+
+  it("note with tasks has correct aggregates", () => {
+    const stats = make_stats({ task_count: 7, tasks_done: 3, tasks_todo: 4, next_due_date: "2026-04-01" });
+    expect(stats.task_count).toBe(7);
+    expect(stats.tasks_done).toBe(3);
+    expect(stats.tasks_todo).toBe(4);
+    expect(stats.next_due_date).toBe("2026-04-01");
+  });
+
+  it("task_count gt 0 filter logic excludes taskless notes", () => {
+    const rows = [
+      { path: "a.md", stats: make_stats({ task_count: 5 }) },
+      { path: "b.md", stats: make_stats({ task_count: 0 }) },
+      { path: "c.md", stats: make_stats({ task_count: 2 }) },
+    ];
+    const filtered = rows.filter((r) => r.stats.task_count > 0);
+    expect(filtered).toHaveLength(2);
+    expect(filtered.map((r) => r.path)).toEqual(["a.md", "c.md"]);
+  });
+
+  it("sort by next_due_date ascending puts nearest deadline first, nulls last", () => {
+    const rows = [
+      { path: "a.md", stats: make_stats({ next_due_date: "2026-04-15" }) },
+      { path: "b.md", stats: make_stats({ next_due_date: null }) },
+      { path: "c.md", stats: make_stats({ next_due_date: "2026-04-01" }) },
+    ];
+    const sorted = [...rows].sort((a, b) => {
+      const da = a.stats.next_due_date;
+      const db = b.stats.next_due_date;
+      if (!da && !db) return 0;
+      if (!da) return 1;
+      if (!db) return -1;
+      return da.localeCompare(db);
+    });
+    expect(sorted.map((r) => r.path)).toEqual(["c.md", "a.md", "b.md"]);
+  });
+});
```

## Execution Waves

- W-001: M-001
- W-002: M-002, M-004
- W-003: M-003
- W-004: M-005
- W-005: M-006
