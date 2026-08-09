# Plan: Inbox view · discoverable view switcher · Views + Types left rail

Status: **planning** (explore + plan complete; awaiting go-ahead to implement)
Date: 2026-07-03
Scope owner: sidebar / folder / bases / new `types` feature

Ports tolaria concepts (React/Vite/Tauri) into Carbide (Svelte/Tauri). Four confirmed product decisions drive this plan:

| Decision | Choice | Consequence |
|---|---|---|
| Inbox model | **Recent-notes feed** | Time-windowed recent notes; no new frontmatter, no triage/organize flow, never reaches "zero". |
| Left rail | **Additive sections** | Keep the activity bar; stack collapsible **Views** + **Types** sections above the file tree inside the Explorer panel. |
| Types | **Full type entities** | `type: Type` definition notes carrying icon/color/order/label — net-new subsystem, new `types` feature module. |
| Switcher | **Underlined tabs** | Replace the ambiguous `Tree`/`Drill` label-button with `Tree \| Drill \| Inbox` underlined tabs, reusing the Files/Views subtab idiom. |

All work adheres to the `docs/architecture.md` decision tree (IO → Port+Adapter; persisted config → settings service; user-triggerable → ActionRegistry → service; ephemeral UI → UIStore; computed → `$derived`; cross-feature imports only via `$lib/features/<name>` entrypoints).

---

## 0. Pre-implementation verifications

1. ✅ `NoteMeta` exposes `mtime_ms` + `ctime_ms` (`src/lib/shared/types/note.ts:9-10`), `color`/`icon` (`:25-26`), and **no** type/kind field.
2. ✅ **#4 — Types feasibility: GREEN / TRIVIAL.** `type:` frontmatter is already parsed generically by `extract_frontmatter_properties` (`src-tauri/src/features/search/db.rs:243`) and persisted to the generic `note_properties (path,key,value,type)` KV table on every index (`db.rs:2194`, `:938`). No schema migration, no reindex. Bases reads the same table (`db.rs:5827`). The heavy cost-drivers (new parser / migration / reindex) are all absent.
3. ✅ **#5 — Live counts: cannot be client-side.** Two blockers: (a) `NoteMeta` lacks the fields real views filter on — tags, `content` (FTS), `backlink_count`, arbitrary `status` (`note.ts:2-27` vs seed views `bases/service.rs:180-281`); (b) **`stores.notes.notes` is a partial, lazily-paginated view of the vault** — populated per-expanded-folder via `load_folder`/`PAGE_SIZE` (`folder_actions.ts:613-643`), **not** a full mirror. Counts (and any list) computed over it undercount until every folder is expanded. `bases_query` itself is a full SQLite scan with **no cache** (`db.rs:5597`), too heavy per-render. → **counts = batched backend COUNT + cached store + Reactor** (see Phase 3).
4. ⚠️ **Cross-cutting consequence:** the partial-store finding means **Inbox (Phase 2), Views counts (Phase 3), and Types enumeration (Phase 4) must all source from the backend, not `stores.notes.notes`.** Plan revised accordingly below.
5. **VERIFY (small, before Phase 2):** is `ctime_ms` a queryable column in the `notes` search table (`db.rs:918-923` + ALTERs)? `mtime` is confirmed queryable; if `created` isn't indexed, the Created-sort either needs a one-line `ALTER TABLE … ADD COLUMN` or falls back to `mtime`.

---

## Phase 1 — Discoverable view switcher (underlined tabs)

Smallest change, immediate UX win. Ships Tree/Drill via tabs; the Inbox tab is wired but its body lands in Phase 2 (render a "coming soon"/empty inbox until then, or gate the tab until Phase 2 — pick during impl).

**Files**

| File | Change |
|---|---|
| `src/lib/shared/types/editor_settings.ts` | `FileTreeMode = "tree" \| "drilldown" \| "inbox"` (`:71`). `file_tree_mode` already in `GLOBAL_ONLY_SETTING_KEYS` (`:495`) — no persistence change. |
| `src/lib/app/action_registry/action_ids.ts` | Add `filetree_set_mode` (near `:101`). |
| `src/lib/features/folder/application/folder_actions.ts` | Add `filetree_set_mode(mode)` handler mirroring the existing `filetree_toggle_mode` save path (`:559-577`): `save_settings` → on success `stores.ui.set_editor_settings`. Refactor `filetree_toggle_mode` to **cycle** tree→drilldown→inbox→tree (keeps command-palette/keyboard parity). |
| `src/lib/app/bootstrap/ui/workspace_layout.svelte` | Replace the label-button (`:739-755`) with a `Tree \| Drill \| Inbox` underlined-tab group, styled like the Files/Views subtabs (`:725-737`: `border-b-2 -mb-px`, active `border-blue-500 text-foreground`). Each tab → `filetree_set_mode(<mode>)`, `aria-pressed`/`role` on the group. |

**Header layout note**: the Explorer header currently holds Files/Views subtabs. The mode tabs belong to the *Files* portion — render them as a second row under the subtab row when `explorer_subtab === "files"`. (This subtab row is retired in Phase 3 once Views becomes a stacked section; until then the two coexist.)

**Styling tension to resolve**: the header uses raw `zinc-*`/`blue-500` palette, not shadcn semantic tokens (AGENTS.md says "always use shadcn semantic utilities"; obs #184 flags bases/tags doing the same). **Decision for this plan: match the neighboring header (zinc/blue-500)** to avoid a visual-consistency regression, and file the semantic-token migration as separate debt. Flag if you'd rather flip to tokens now.

**Verify**: tabs render; Tree↔Drill switching works and persists across restart; active underline correct; keyboard cycle works. `pnpm check && pnpm lint && pnpm test`.

**Commit**: `feat(explorer): underlined Tree/Drill/Inbox view-mode tabs`.

---

## Phase 2 — Inbox view (recent-notes feed) + sort/period

Pure-domain listing + a virtualized list component, mirroring the `drilldown.ts` / `drilldown_file_tree.svelte` pattern. Tolaria's inbox is a flat list with a sort dropdown; we add period pills too (tolaria's exist but are inert — we wire them).

**Source — backend, not the note store.** Because `stores.notes.notes` is partial (§0.4), the inbox sources full-vault-correct results via a **`bases_query`**: no filters (or a `ctime/mtime ≥ cutoff` filter for the period), `sort: [{field, direction}]`, `limit`. Reuses the existing query path — no new "recent notes" command — and unifies inbox/views/types around bases.

**Domain** — `src/lib/features/folder/domain/inbox.ts` (pure, sync, unit-tested): a thin query **builder**, not an in-memory sorter.
- `InboxSort = "modified" | "created" | "title"` · `SortDirection` · `InboxPeriod = "all" | "week" | "month" | "quarter"`.
- `build_inbox_query({ sort, direction, period, now_ms, limit }): BaseQuery` — sort→`BaseSort` (modified→mtime, created→ctime, title→title); period→a `ctime ≥ now_ms − windowDays` filter (none for `all`). `now_ms`/`limit` injected (deterministic tests; no `Date.now()`).
- `default_direction(sort)` mirrors tolaria (modified/created→desc, title→asc).

Dropping tolaria's `status`/`property:*` sorts (no status field; property sorts belong to bases). Execution: action → bases/query service → OpStore (loading) → results into a small inbox result store the view reads. Rows are `BaseNoteRow`s (title/blurb/timestamp/type-color from the row).

**UI** — `src/lib/features/folder/ui/inbox_file_view.svelte`:
- Header: a compact **sort dropdown** (shadcn `Select`, `src/lib/components/ui/select/` — used at `theme_settings.svelte:311`) showing current option + a direction toggle (asc/desc arrow), and **period pills** (All / Week / Month / Quarter) styled like the subtab idiom.
- Body: virtualized list (`@tanstack/svelte-virtual`, as `virtual_file_tree.svelte`) of note rows (title + blurb + timestamp + type-color accent from `note.color`/`note.icon`). Reuse the existing note-row visual language; extract a shared row snippet if it keeps things DRY without contorting the tree component.
- Empty state: "No recent notes" (with-search variant later if inbox gets a filter box).
- Click → `note_open`; context menu can reuse existing note actions (defer bulk actions — not part of "recent feed").

**Persisted prefs** (user-triggerable, persists → EditorSettings + settings service, matching `file_tree_mode`):

| File | Change |
|---|---|
| `editor_settings.ts` | Add `inbox_sort: { option: InboxSort; direction: SortDirection }` + `inbox_period: InboxPeriod`; defaults `{modified,desc}` / `all`. Add keys to `GLOBAL_ONLY_SETTING_KEYS` (global, consistent with `file_tree_mode`). |
| `action_ids.ts` | `inbox_set_sort`, `inbox_set_period`. |
| `folder_actions.ts` | Handlers → `save_settings` → `set_editor_settings` (same pattern as set_mode). |
| `workspace_layout.svelte` | Add `{:else if file_tree_mode === "inbox"}` branch (before the tree fallthrough `:816`) rendering `<InboxFileView>` bound to the **backend inbox result store** (not `stores.notes.notes`) + prefs/actions. Enable the Inbox tab from Phase 1. |
| `src/lib/features/folder/index.ts` | Export `InboxFileView` (Rule 10). |

**Tests** (`tests/…`): `list_inbox` — sort by each option asc/desc; period cutoffs (boundary at exact cutoff); title tiebreak/stability; empty input. Deterministic via injected `now_ms`.

**Verify**: inbox lists recent notes; each sort + direction correct; period pills filter; prefs persist across restart. `pnpm check && pnpm lint && pnpm test`.

**Commit**: `feat(inbox): recent-notes feed with sort + period controls`.

---

## Phase 3 — Views rail section (adapt bases; retire Views subtab)

Bases **is** tolaria's "Views" (saved query + view-mode, JSON at `.carbide/bases/`). Do not rebuild — surface `stores.bases.saved_views` as a stacked collapsible section above the file tree, and retire the now-redundant Files/Views subtab.

**Model touch-up** — `src/lib/features/bases/ports.ts`: extend `BaseViewDefinition` (`:88-95`) with optional `icon?: string` + `color?: string` for rail rendering (tolaria views carry these). Additive, no migration; Rust write path (`src-tauri/.../bases/service.rs:73`) serializes them transparently.

**UI** — new `src/lib/features/bases/ui/bases_rail_section.svelte` (collapsible section):
- Header "VIEWS" with caret + `[+]` (new view → existing create-view/filter-builder flow).
- Rows: icon (view `icon` or fallback) tinted by `color`, name, live **count**.
- Click → `bases_load_view(path)` + focus bases surface (reuse `:767-773` logic). Context menu: edit / delete (existing `bases_actions.ts` `:82,:92`).

**Counts (resolved by #5 — backend, cached, Reactor-invalidated):** client-side counting is ruled out (§0.3). Add a COUNT-only backend command **`bases_count_many(queries) -> Vec<u32>`** alongside `query_bases` (`db.rs:5597`): reuse its WHERE-clause builder, strip row hydration (`db.rs:5824-5856`) and snippets → `SELECT COUNT(*)`. One IPC round-trip for all N views. Cache results in a small count store keyed by view path; **invalidate via a Reactor cloned from `src/lib/reactors/bases_refresh.reactor.svelte.ts`** watching the note store / index-updated signal (debounced). Renders read the cached map with zero IO. If counts slip, render the section without them first — never block the list on counts.

**Layout** — `workspace_layout.svelte`:
- Remove the Files/Views subtab buttons (`:723-737`) and the `explorer_subtab === "views"` branch (`:756-779`); drop `ui_select_explorer_subtab` usage + `explorer_subtab` UIStore field if now unused (remove orphans per Rule 4).
- New Explorer body = stacked: `<BasesRailSection/>` → `<TypesRailSection/>` (Phase 4) → **Files** section (mode tabs from Phase 1 + tree/drill/inbox body).
- Section collapse state → UIStore ephemeral (`stores.ui`, decision-tree "ephemeral UI layout"). Order fixed (Views, Types, Files) — no per-section config yet (avoid speculative flexibility; revisit if asked).

**Verify**: saved views appear with icon/color; click loads; `[+]` creates; counts correct (or cleanly absent); file tree unaffected. Full check/lint/test.

**Commit**: `feat(explorer): stacked Views rail section from bases; retire Views subtab`.

---

## Phase 4 — Types subsystem (full type entities) — new feature module

The heavy, net-new piece. A "type" = a note with `type: Type` frontmatter carrying `icon`/`color`/`order`/`sidebar label`/`template`/`visible`; instance notes declare `type: <Name>` → `NoteMeta.is_a = "<Name>"`. Selecting a type opens a bases-filtered result set (`type == Name`), reusing bases query infra — this is what keeps the weight contained.

New feature module `src/lib/features/types/` (domain / state / application / ui), per the feature-based architecture.

**Data / backend (#4 resolved — TRIVIAL):**
- Add `is_a?: string` to `NoteMeta`: Rust `pub is_a: Option<String>` on the minimal struct (`src-tauri/src/features/notes/service.rs:20-34`), populated in `build_note_meta` (`:417-442`) via the existing `extract_frontmatter_str_field(&text, "type")` helper (`:242`) — no extra I/O (the file is already read there). Regenerate specta bindings (`bindings.ts:2451`). Add `is_a?: string` to TS `NoteMeta` (`note.ts:27`) + copy it in adapter mappers (`notes_tauri_adapter.ts:33-55`, `graph_tauri_adapter.ts:34-46`). **No schema migration, no reindex.**
- Type-definition notes = `is_a === "Type"`, carrying `icon`/`color`/`order`/`sidebar label`/`template`/`visible` in frontmatter.

**Enumeration + counts — backend (partial-store safe, §0.4):** add **`list_types() -> Vec<{name,count}>`** = `SELECT value, COUNT(*) FROM note_properties WHERE key='type' GROUP BY value` (one indexed aggregate; idx on `key` at `db.rs:946`), folded into the same batched refresh as view counts. Correct vault-wide source — do **not** derive types from `stores.notes.notes`.

**Domain** — `src/lib/features/types/domain/type_sections.ts` (pure, tested; mirrors tolaria `utils/sidebarSections.ts`):
- `build_type_sections(backend_types, definition_notes): TypeSection[]` where `TypeSection = { name, icon, color, order, count, visible }`. Union of backend type names ∪ every `type: Type` definition note (so zero-note types still show). Sort by `order` then name; filter by `visible`.
- Metadata resolved from the matching definition note's frontmatter; built-in defaults for unknown types.

**Application** — actions (user-triggerable → ActionRegistry → service; file writes → IO via Port+Adapter, reuse the notes/frontmatter service):
- `types.create` (writes a new `type: Type` note, template-seeded).
- `types.set_icon_color`, `types.set_visibility`, `types.reorder` (mutate the Type note's frontmatter → notes/frontmatter port → reindex).
- `types.select(name)` → open/refresh an ephemeral bases view filtered `type == name` (bridges Types → bases; no separate results panel needed).
- `types.rename` (inline).

**State**: a thin `types_store` holding the last `list_types` result; a `$derived` merges it with definition-note metadata via `build_type_sections`. Refreshed by the shared count Reactor (Phase 3). Not `$derived` off `stores.notes` (partial-store).

**UI** — `src/lib/features/types/ui/types_rail_section.svelte`: collapsible "TYPES" section with `[⚙ visibility]` + `[+ create]` header buttons; rows = type icon (accent color) + label + count pill; active state; context menu (rename / customize icon+color / delete); inline rename; click → `types.select`. Placed between Views and Files sections in `workspace_layout.svelte`. Export via `src/lib/features/types/index.ts`.

**Persistence**: type metadata + order + visibility live in the Type notes' **frontmatter on disk** (per-vault, matches tolaria and Carbide's vault-centric model) — no new settings keys.

**Tests**: `build_type_sections` — distinct-type collection; zero-note definition types appear; order/visible honored; metadata resolution + defaults. Action tests for frontmatter round-trip (create/edit reflected in derived sections). Determinism required.

**Verify**: types enumerate with correct counts; create/edit writes frontmatter and reflects live; selecting a type opens a `type==name` bases result; visibility/reorder persist. Full check/lint/test + `cd src-tauri && cargo check` (backend `is_a` change).

**Commit**: `feat(types): type-entity rail section backed by frontmatter + bases`.

---

## Phase 5 — Polish, simplify, verify

- Empty/loading states across Inbox, Views, Types; keyboard nav for the sections and mode tabs; hover/active parity with existing sidebar rows.
- Counts perf pass (lazy/cached if verification #5 flagged cost).
- Invoke the **code-simplifier** subagent with full context (AGENTS.md post-edit requirement for major features) — must not break patterns/guidelines.
- Full gate: `pnpm check` · `pnpm lint` · `pnpm test` · `cd src-tauri && cargo check` · `pnpm format`.
- Optional follow-ups (only if asked): rail section reorder/visibility config; inbox filter box + bulk actions; semantic-token migration of the Explorer header (obs #184).

**Commit**: `chore(explorer): polish + simplify inbox/rail sections`.

---

## Concurrency (which phases parallelize)

Both verifications are GREEN, so nothing is blocked. The only true serialization point is **`workspace_layout.svelte`** (the Explorer body — edited by Phases 1–4) and, secondarily, **`editor_settings.ts`** (Phases 1–2, different fields). Everything else — domain modules, `.svelte` components, and the three small backend commands — lives in separate files and parallelizes.

**Wave 1 — build in parallel (isolated files; worktree lanes):**
- **Lane A — Phase 1 switcher** (`editor_settings` `FileTreeMode`, `action_ids`, `folder_actions` set-mode + header tabs). Small, self-contained.
- **Lane B — Inbox pieces** (`folder/domain/inbox.ts` query-builder + tests, `inbox_file_view.svelte`, inbox prefs/actions) — built unwired.
- **Lane C — Views backend + component** (`bases/ports.ts` icon/color, `bases_count_many` Rust command, count store + Reactor, `bases_rail_section.svelte`).
- **Lane D — Types backend + module** (`NoteMeta.is_a` + specta regen, `list_types` Rust command, `features/types/**` domain/state/actions, `types_rail_section.svelte`) — unblocked by #4.

Backend Rust splits cleanly: Lane C touches `features/bases`, Lane D touches `features/notes`+`features/search` — parallel-safe. **specta binding regen (Lane D) is a single coordinated step** (regenerates one file).

**Wave 2 — serialized integration into `workspace_layout.svelte`** (one owner, in this order to minimize churn): **1** (header tabs) → **3** (restructure Explorer body into stacked sections; retire Files/Views subtab) → **2** (inbox render branch) + **4** (Types section placement, depends on 3's stacked layout). `editor_settings.ts` field additions (1+2) coordinated by whoever lands first.

**Wave 3 —** Phase 5 polish + code-simplifier + full gate.

Hard dependencies: Phase 2 *wiring* needs Phase 1's inbox mode; Phase 4 *placement* needs Phase 3's stacked-section restructure. Roughly **~70% of the code parallelizes**; the ~30% touching the two shared files serializes.

## Sequencing, branch, risk

- **Branch**: `feat/inbox-view-left-rail` (spans many files + a new feature module + Rust).
- **Order** (solo path): 1 → 2 → 3 → 4 → 5. Each phase independently shippable + a commit boundary. Phase 1 alone fixes the "buttons don't look like buttons" complaint; Phase 2 delivers the inbox; 3–4 deliver the rail.
- **#4 & #5 resolved** — Types is cheap (no migration/reindex), counts are backend-cached. Residual risks are now execution-level:
  - **Integration risk**: `workspace_layout.svelte` is the merge hotspot — mitigate with the serialized Wave 2 above (single owner).
  - **Small backend surface**: two new commands (`bases_count_many`, `list_types`) + specta regen. Low, but requires `cargo check` + binding regen discipline.
  - **Sub-verify (Phase 2)**: `ctime_ms` queryability (§0.5) — one-line ALTER or fall back to mtime.
- **Architecture guardrails**: mode/sort/pref changes route action→service (never direct component mutation of persisted settings); counts/enumeration sourced from backend not the partial note store; new components exported via feature entrypoints; domain logic pure/sync; services never import UIStore; Reactors are the only sanctioned store→side-effect observers.

## Files at a glance

- **Touch (TS)**: `editor_settings.ts` (FileTreeMode + inbox prefs), `action_ids.ts`, `folder_actions.ts`, `workspace_layout.svelte`, `bases/ports.ts` (icon/color + count method), `note.ts` (`is_a`), `notes_tauri_adapter.ts` + `graph_tauri_adapter.ts` (map `is_a`), `bindings.ts` (regen).
- **Touch (Rust)**: `notes/service.rs` (`NoteMeta.is_a` + populate), `search/db.rs` (`bases_count_many` COUNT builder, `list_types` aggregate), `bases/service.rs` (+ commands).
- **New**: `folder/domain/inbox.ts`, `folder/ui/inbox_file_view.svelte`, `bases/ui/bases_rail_section.svelte`, count store + `reactors/*count*.reactor.svelte.ts` (clone of `bases_refresh.reactor`), feature module `features/types/**`, tests under `tests/`.
