# Implementation Plan — Smart Blocks (Live Query Embeds)

**Date:** 2026-06-13
**Status:** P0–P1 complete (2026-06-13) — P2–P4 pending
**Related:** `carbide/feature_opportunity_assay.md` (Tier 1 #4), `TODO.md` (Smart Blocks)

---

## Goal

Let a note contain **live, self-updating blocks** whose content is generated from a
query rather than typed by hand — answering the demand Obsidian Dataview proves
(3M+ downloads), but **natively**, on Carbide's existing unified query language and
its existing `bases/` view components. One mental model, not a bolt-on with its own
DSL and renderer.

A Smart Block re-renders when the vault changes, and (where applicable) stays
interactive — e.g. toggling a checkbox in an embedded task list writes real task
state, exactly as the shipped ` ```tasks ` block does today.

---

## What already exists (compose, don't build)

| Capability | Location | Used for |
|---|---|---|
| Live code-block NodeView w/ async render + interactivity | `editor/adapters/code_block_view_plugin.ts` (`CodeBlockView`) | The shipped ` ```tasks ` block is already a Smart Block — generalize it |
| Callbacks-injection pattern (editor never imports `task/`) | `editor/adapters/prosemirror_adapter.ts` `build_task_query_callbacks()` | Template for wiring data into blocks |
| `![[...]]` embed detect + NodeView + FS-change subscription | `editor/adapters/note_embed_plugin.ts`, `note_embed_view_plugin.ts` | Reactivity pattern (`subscribe_to_changes`) |
| Query parser + solver + service | `query/domain/query_parser.ts` (`parse_query`), `query/domain/query_solver.ts` (`solve_query`), `query/application/query_service.ts` | The `query` block engine |
| Query predicates: `named` `with` `in` `with:#tag` `linked_from` `property op value` | `query_solver` backends (search/index/tags/bases) | No new query language needed |
| 6 bases view components, **all embeddable as-is** (pure props-in, no store coupling) | `bases/ui/bases_table.svelte`, `_kanban`, `_gallery`, `_calendar`, `_tree`; types in `bases/ports.ts` | The `base` block renderer |
| Instantiable `BasesStore` (class, not singleton) + `BasesPort.query()` | `bases/state/bases_store.svelte.ts`, `bases/application/bases_service.ts` | Per-block row sets |
| Backlinks snapshot | `search/ports.ts` `get_note_links_snapshot()` → `{ backlinks, outlinks, orphan_links, attachments }` | The `backlinks` block |

**Net new work is connective tissue, not new engines.**

---

## Key design decisions

### D1 — Syntax: fenced code blocks, not `![[query:…]]`

The assay sketched `![[query:…]]`. We choose **fenced code blocks keyed by language**,
because the shipped `tasks` and `mermaid` blocks already work exactly this way, and
because `![[...]]` semantically means *transclude existing note content* while a Smart
Block means *generated content*. Keeping those distinct avoids overloading one syntax
with two mental models.

```
```query
notes with:#project-x in:work/ and named:"spec"
```

```base
view: kanban
group_by: status
query: notes with:#project-x
```

```backlinks
```
```

The set of Smart Block languages = the registry's key set (`tasks`, `query`, `base`,
`backlinks`, …). `![[backlinks]]` sugar is a possible later alias (see Open Decisions),
not in scope.

### D2 — Introduce a block-type registry (the foundational refactor)

Today `CodeBlockView` hardcodes `if (language === "mermaid") … else if (language === "tasks")`.
Adding block types by extending that switch does not scale. **P0 replaces the `tasks`
special-case with a `SmartBlockRegistry`** the NodeView consults; `tasks` becomes the
first registered handler (proving the pattern with zero behavior change). `mermaid`
stays its own branch — it's a diagram renderer, not a data block, and is out of scope.

### D3 — Layering: handlers built at wiring time, editor stays decoupled

Per `docs/architecture.md`, services never import each other and the editor must not
import `query/`/`bases/`/`search/` directly. So:

- `smart_blocks/` owns **pure** domain: the spec parser + the `SmartBlockHandler` /
  `SmartBlockRegistry` interfaces.
- Concrete handlers are constructed at **app-wiring time** (`create_app_context.ts` /
  `prosemirror_adapter.ts`) from callbacks that wrap `QueryService`, `BasesPort`, and
  `SearchPort` — identical to how `build_task_query_callbacks()` wraps `TaskPort` today.
- The editor receives only the populated `SmartBlockRegistry` (a `smart_blocks`
  entrypoint type), never the data features.

---

## New feature module anatomy

```
src/lib/features/smart_blocks/
├── index.ts                              # exports registry factory + handler/instance types
├── ports.ts                              # SmartBlockHandler, SmartBlockInstance, SmartBlockContext
├── domain/
│   ├── smart_block_spec.ts               # parse fenced body → { type, body } (pure)
│   └── smart_block_registry.ts           # create_smart_block_registry(): Map-backed register/get/has
├── application/
│   └── smart_block_actions.ts            # insert-smart-block command(s) for the omnibar
└── ui/
    └── handlers/
        ├── query_smart_block.ts          # built from { run_query(text) }
        ├── base_smart_block.ts           # built from { run_base_query(q) } + mounts bases view
        └── backlinks_smart_block.ts      # built from { get_links(note_path) }
```

Core interfaces (`ports.ts`):

```typescript
export type SmartBlockSpec = { type: string; body: string }

export type SmartBlockContext = {
  note_path: string | null
  vault_id: VaultId | null
  open_note: (path: string, fragment?: string) => void
  subscribe_to_changes: (handler: (e: VaultFsEvent) => void) => () => void
}

export interface SmartBlockInstance {
  dom: HTMLElement
  update(spec: SmartBlockSpec): void   // block body edited
  destroy(): void                      // unsubscribe, unmount
}

export interface SmartBlockHandler {
  type: string
  create(spec: SmartBlockSpec, ctx: SmartBlockContext): SmartBlockInstance
}

export interface SmartBlockRegistry {
  register(handler: SmartBlockHandler): void
  get(type: string): SmartBlockHandler | undefined
  has(type: string): boolean
}
```

---

## Cross-cutting concerns (defined once, reused by every phase)

- **Reactivity.** Each instance subscribes via `ctx.subscribe_to_changes` (the same
  mechanism `note_embed_view_plugin` uses), debounces ~150 ms, re-runs its query, and
  re-renders. `destroy()` must unsubscribe. Guard against stale async results
  (sequence token) so a slow query can't overwrite a newer render — mirror the
  mermaid stale-result guard.
- **Current-note context.** `query`/`backlinks` blocks need the host note's path
  (`linked_from`, "this note's backlinks"). `SmartBlockContext.note_path` is supplied
  by the NodeView from the editor's note path (already available as `get_note_path()`).
- **Loading / empty / error states.** Every handler renders three states explicitly:
  running (skeleton), empty ("No results"), error (parse error or backend failure),
  matching the existing `task-query-empty` / `task-query-error` classes.
- **Source ↔ rendered toggle.** Reuse `CodeBlockView`'s existing preview/source toggle
  (already present for `tasks`) so users can see/edit the block source.
- **Security.** Generated content is data, not arbitrary HTML — render through the
  existing trusted DOM/component path, never `innerHTML` of note content. Embedded
  bases components already sanitize.

---

## Phases

### P0 — Block-type registry + `tasks` migration (foundation) ✅ DONE

**Landed 2026-06-13** across commits: `74291ab` (pure domain), `82e14be` (pre-fix:
4 layering violations), `f44d363` (tasks handler), `f17e6f7` (CodeBlockView →
registry + wiring), plus step-5 transition tests. Gates: `pnpm test` 4084/4084,
`pnpm check` clean (pre-existing baseline only), `lint:layering` passes, `cargo check`
0 errors. `pnpm lint` OOMs whole-repo in this environment (infra, not code); scoped
lint on touched files = zero new findings. Review found no Critical/High; M1/L1 gaps
deferred to P1 (above). Tasks parity verified behavior-preserving.

**Scope.** Stand up `smart_blocks/` skeleton; refactor `CodeBlockView` to consult a
`SmartBlockRegistry`; migrate the existing `tasks` block onto it as the first handler.
No new user-facing block types. Behavior-preserving.

**Approach.**
- Add `domain/smart_block_spec.ts` (`parse_smart_block(language, body)`), the
  registry, and the `ports.ts` interfaces.
- In `CodeBlockView`: replace `else if (this.current_language === "tasks" …)` with
  `const handler = registry.get(language); if (handler) this.setup_smart_block(handler)`.
  `setup_smart_block` owns the instance lifecycle (create on enter, `update` on edit,
  `destroy` on teardown) — generalized from `setup_task_query`.
- Move the task-query rendering into `ui/handlers/` as `create_tasks_smart_block(...)`,
  built from the existing `TaskQueryCallbacks` (now a handler dependency).
- Wire `create_smart_block_registry()` in app context; register the tasks handler;
  pass the registry through `create_code_block_extension(registry)` →
  `create_code_block_view_prose_plugin(registry)`.

**Resolved gates (2026-06-13, pre-flight).**
- **R1 — Reactivity:** `SmartBlockContext.subscribe_to_changes` IS in the P0 interface
  (so P1/P2/P3 reuse it), but the `tasks` handler does **not** subscribe — P0 stays
  strictly behavior-preserving. `subscribe_to_changes` is ungated from `note_embed_args`
  at wiring so smart blocks get reactivity independently.
- **R2 — DOM boundary:** the NodeView keeps the chrome (source/preview toggle, `pre`
  show/hide, height/collapse). `SmartBlockInstance.dom` is the rendered **preview body
  only**. Matches the "reuse existing toggle" cross-cutting note; smallest diff.
- **R3 — `mermaid`:** stays a hardcoded NodeView branch (`if (lang === "mermaid")`)
  alongside `const handler = registry.get(lang)`. Not registry-fied.

**Acceptance (BDD).**
- Given an existing ` ```tasks ` block, when the note opens, it renders the identical
  live task list and checkbox toggles still write task state.
- Given a registered handler for type X, when a ` ```X ` block is created/edited/deleted,
  `create`/`update`/`destroy` fire in order and leak no subscriptions.
- `mermaid` blocks and plain code blocks (Shiki) are unaffected.
- `pnpm lint:layering` passes — editor imports only the `smart_blocks` entrypoint.
- **Explicit regression test:** a tasks-parity test asserts the migrated `tasks` handler
  renders identical DOM to the pre-migration path (P0 deliverable, not implicit).
- **Quality gate:** `pnpm check && pnpm lint && pnpm test && (cd src-tauri && cargo check)`
  all green before P0 is considered done.

**Files.** `smart_blocks/*` (new); `editor/adapters/code_block_view_plugin.ts`,
`code_block_extension.ts`, `prosemirror_adapter.ts` (refactor); `app/.../create_app_context.ts` (wiring).
**Risk.** Medium — touches the live editor NodeView; mitigated by behavior-preserving migration + existing task tests.

---

### P1 — `query` block (note lists) ✅ DONE

**Landed 2026-06-13** (working tree, pending review). `QueryService.run()` added as a
detached parse+solve (no `query_store` mutation); `execute()` refactored to reuse it via
a `QueryParseError` carrying the parser caret offset. `create_query_smart_block_handler`
registered alongside `tasks`; first reactive handler — debounce (~150 ms) + per-instance
stale-guard token + `destroy()` unsubscribe/timer-clear (kept inline; extraction deferred
to P2 per "second user triggers it"). **M1 resolved:** `subscribe_to_changes` threaded as
its own editor-port arg (`create_prod_ports` → `watcher.subscribe_fs_events`), decoupled
from `note_embed`; `run_query` late-bound via a `query_runner` holder (the established
`ai_inline_handler` pattern) wired in `+page.svelte` from `app.services.query.run`. **L1:**
`open_note` now threads the optional `fragment` (encoded as `path#fragment`). Gates:
`pnpm test` (query+smart_blocks+adapters) green, `pnpm check` baseline-only (17 pre-existing),
`lint:layering` passes, `cargo check` 0 errors, scoped oxlint zero new findings.

**Scope.** A ` ```query ` block runs a `query/` expression and renders the matching
notes as a clickable, live list. Read-only.

**Approach.**
- Add `QueryService.run(text): Promise<QueryResult>` — a **detached** parse+solve that
  returns the result **without** touching `query_store` (the panel state). The shipped
  `execute()` writes the store; the block must not clobber the panel.
- `create_query_smart_block({ run_query })` renders `result.items[].note` as rows
  (title + path), wires `open_note` on click, and renders the parse-error position
  inline for invalid queries.
- Subscribe to FS changes → re-run.

**Carried from P0 review (resolve here, where reactivity first matters).**
- **M1 — `subscribe_to_changes` ungating:** P0 wires `SmartBlockContext.subscribe_to_changes`
  from `note_embed_args`, falling back to a no-op when `note_embed` is absent. Tasks never
  subscribe so P0 is unaffected, but the query block IS reactive — thread
  `subscribe_to_changes` as its own independent editor-port arg so there is no silent
  no-op path when a reactive handler runs.
- **L1 — `open_note` fragment:** the P0 `make_context` wrapper drops the optional
  `fragment?` arg. Wire it through if the query/backlinks row-open needs heading targets.

**Acceptance (BDD).**
- `notes with:#project-x in:work/` lists exactly the notes the query panel returns for
  the same text; clicking a row opens that note.
- Editing the block body re-runs the query; creating a matching note updates the list
  without reopening the note.
- An invalid query shows the error + caret position, not a crash.

**Files.** `query/application/query_service.ts` (+`run`); `smart_blocks/ui/handlers/query_smart_block.ts`; wiring.
**Risk.** Low — pure composition over existing solver.

---

### P2 — `backlinks` block ⏳

**Scope.** A ` ```backlinks ` block renders the host note's backlinks (optionally
outlinks/attachments via body flags).

**Approach.** `create_backlinks_smart_block({ get_links })` calls
`get_note_links_snapshot(vault_id, ctx.note_path)` and renders `backlinks` as a list.
Body options (e.g. `show: outlinks`) parsed by the handler. Re-run on FS change.

**Acceptance (BDD).**
- In note A linked from B and C, the block lists B and C; adding a link from D updates
  the block live.
- With no `note_path` (unsaved buffer), renders a graceful "save note to see backlinks".

**Files.** `smart_blocks/ui/handlers/backlinks_smart_block.ts`; wiring (search callback).
**Risk.** Low.

---

### P3 — `base` block (embedded bases views) ⏳ — the big lift

**Scope.** A ` ```base ` block embeds any of the 6 bases views (table/list/kanban/
gallery/calendar/tree) inline, driven by a query, with view mode + config from the
block body.

**Approach.**
- Body parsed to `{ view: ViewMode, query: string, group_by?, date_property?, … }`.
- `create_base_smart_block({ run_base_query })`: build a per-block `new BasesStore()`,
  call the bases query callback to populate rows (`BaseNoteRow[]`), then **`mount()`**
  (Svelte 5) the matching view component into the instance DOM with
  `rows` / `config` / `available_properties` / `on_note_click` / `on_config_change`.
  All six components are already pure props-in (verified) — no bases refactor needed.
- `update()` re-runs query and updates props; `destroy()` calls Svelte `unmount()`.
- Config edits (`on_config_change`) write back into the block body so the view is
  persisted in the note (round-trips through the doc, the single source of truth).

**Acceptance (BDD).**
- `view: kanban, group_by: status, query: notes with:#project-x` renders a kanban of
  matching notes grouped by `status`; clicking a card opens the note.
- Switching `view: table` re-renders as a table over the same rows.
- Two `base` blocks in one note keep independent state (separate `BasesStore`).
- Editing the block body updates the embedded view without remounting the whole note.

**Files.** `smart_blocks/ui/handlers/base_smart_block.ts`; `bases/index.ts` (export view
components if not already public); wiring (bases-port callback).
**Risk.** Medium-high — mounting/unmounting Svelte components inside the ProseMirror
NodeView lifecycle; performance with many embedded views. Mitigate with lazy mount
(only when block enters viewport) and the stale-result guard.

---

### P4 — Polish: config UI, performance, omnibar insertion ⏳

**Scope.** Insertion commands, config affordances, performance hardening.

**Approach.**
- `smart_block_actions.ts`: register `smart_block.insert_query` / `insert_base` /
  `insert_backlinks` omnibar commands that drop a scaffolded block at the cursor.
- Lightweight in-block config controls (view-mode switcher, group-by picker) that edit
  the block body.
- Performance: viewport-gated mount, shared debounce, cap result counts with a
  "showing N of M" affordance (no silent truncation).

**Acceptance (BDD).**
- `Cmd+P → "Insert base view"` inserts a valid ` ```base ` scaffold that renders.
- A note with 10 query/base blocks scrolls smoothly; off-screen blocks defer their
  queries until visible.

**Files.** `smart_blocks/application/smart_block_actions.ts`; handler config UI; wiring.
**Risk.** Low-medium.

---

## Sequencing & dependencies

```
P0 (registry + tasks migration)   ← foundation, behavior-preserving
 ├─ P1 (query block)              ← parallel after P0
 ├─ P2 (backlinks block)          ← parallel after P0
 └─ P3 (base block)               ← parallel after P0 (largest)
        └─ P4 (polish/config/perf) ← after P1–P3 land
```

Estimated **~5 PRs**: P0, P1+P2 (bundled quick wins), P3, P4, plus a docs/changeset PR.
Each phase lands as its own commit per AGENTS.md.

---

## Testing strategy

- **Domain (pure, unit):** `smart_block_spec` parsing (type + body extraction, malformed
  bodies); registry register/get/has.
- **Handlers (integration w/ fakes):** each handler given fake callbacks renders the
  expected DOM for running/empty/error/results; `update` re-runs; `destroy` unsubscribes
  and unmounts (assert no leaked listeners).
- **Editor integration:** a fake `EditorView` with a registry renders a ` ```query `
  block and opens a note on row click; P0 regression test asserts `tasks` parity.
- **Reactivity:** simulate a `VaultFsEvent` → assert re-render; assert stale-guard drops
  an out-of-order async result.
- Tests under `tests/` grouped per handler, shared fake-callback fixtures in a helper.
- Gate: `pnpm check && pnpm lint && pnpm test && (cd src-tauri && cargo check)` — though
  this feature is **TypeScript-only, zero Rust**.

---

## Open decisions (resolve before/within P0)

1. **`![[backlinks]]` sugar alias** — defer. Ship fenced-block form first; add an embed
   alias only if users ask. Keeps one mechanism during the build.
2. **Saved-view reference in `base` blocks** — `view: @MySavedView` to reuse a stored
   bases view definition vs. inline-only. Lean inline-only for P3; saved-view ref in P4
   if cheap.
3. **Date/size query predicates** — `query_solver` lacks `modified`/`size` filters today.
   Out of scope; note as a `query/` follow-up if a Smart Block needs time-windowed lists.
4. **MCP exposure** — a `smart_block_query` MCP tool (external agents render the same
   blocks) is a natural Phase 5; not planned here.

---

## Why this is the right bet

Every engine already exists and is proven in production paths: the query solver backs
the query panel, the bases views back the bases panel, backlinks back the sidebar, and
the `tasks` block proves live interactive rendering inside the editor. Smart Blocks
spends its budget almost entirely on the **registry + the NodeView↔component bridge** —
making the features you already shipped composable *inside notes*, which multiplies
their value without a single new backend system.
