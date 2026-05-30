# File Explorer UX Improvements

> Analysis of current file explorer UX gaps and proposals for improvement.
> Date: 2026-05-29
> Last triage: 2026-05-29 (bases coordination pass)

---

## Decision Log

Verdicts after evaluating each proposal against the now-shipping `bases` feature
(`src/lib/features/bases/`), which provides property-typed queries, filters,
sort, saved views, and view modes (table/list/kanban/gallery/calendar).

The core principle: **bases already owns "query notes by property" — explorer
features that re-implement that get subsumed, not built in parallel.**

| # | Item | Verdict | Rationale |
|---|---|---|---|
| 1 | Pivot Views (by tag/date/property/type) | **Subsume into bases** | Add `tree` view mode + `group_by` to bases; ship pivots as default saved views. |
| 2 | Smart Collections (saved queries) | **Subsume into bases** | A saved bases view *is* a smart collection. Surface them in the sidebar instead of building a second query engine. |
| 3 | Contextual Sidebar | **Reframe → "Related" tab on existing ContextRail** | Right rail already exists with Links/Outline/Metadata. Add only the novel pieces (recents in folder, siblings, shared-tag chips → bases queries). See [D1](#d1-contextual-sidebar-3--reframe-as-a-related-tab-on-the-existing-contextrail-do-not-build-a-left-rail-section). |
| 4 | Two-Pane Explorer | **Drop** | Bases table view scoped to a folder path covers this with zero new code. |
| 5 | Peek Preview | **Do** | Independent of bases. Genuinely useful. Low risk. |
| 6 | Workspace Snapshots | **Do — expand scope to include bases state** | Must capture active bases view, filter/sort, kanban column state to be useful. |
| 7 | Progressive Disclosure | **Split** | Pinned folders = native. Smart Archive = bases default view. Recent section = defer (Cmd+P covers it). |
| 8–13 | Phase 1 polish | **Do** | Unchanged. Right "feels clunky" fixes. |
| 14 | Color tags/labels | **Do — drive from frontmatter** | Color is a property; bases already filters/groups by it. Don't build separate storage. |
| 15 | Scroll position persistence | **Do** | Trivial. |
| 16 | Sub-tabs in explorer | **Do — add "Views" tab** | Cleanest surface for saved bases views. |
| 17 | External file drop | **Do** | Independent. |
| 18 | Fix refresh | **Do** | Trust fix. |
| 19 | Reveal-in-explorer command (new) | **Do** | On-demand reveal from bases row/backlink/tab. Distinct from auto-expand (#13). |
| 20 | Tree filter scope toggle (new) | **Do** | Current-folder vs whole-vault scope on the existing filter. Cheaper than smart collections; same problem. |
| 21 | Folder notes (new) | **Do** | `folder/index.md` as folder landing page. Bases users expect this for MOCs. |
| 22 | Frontmatter-driven tree icons (new) | **Do** | `icon: 📐` renders next to filename. Pairs with #14. |
| 23 | Undo for file ops (new) | **Do** | Session-scoped undo for rename/move/delete. Trust impact is large. |
| 24 | Drag-from-tree-into-editor (new) | **Do** | Drop on doc → insert wikilink. Reuses existing drag. |
| 25 | Sticky folder headers on scroll (new) | **Do** | Deep-hierarchy nav aid. Cheap. |
| 26 | Path-aware Cmd+P (new) | **Do** | Pre-fill with selected folder when tree focused. |
| 27 | Multi-select operations audit (new) | **Do** | Ensure move/delete/star/tag-add/set-property all work on N items. Set-property unlocks bases workflows. |
| 28 | Shift-Enter opens multi-selection as tab group (new) | **Do** | Power gesture, currently unclear if supported. |

---

## Current State

The file explorer is highly capable on paper — virtualized scrolling, 5 visual styles, fuzzy filter,
drag-and-drop, multi-select, blurb display, lazy pagination. The code is clean and well-structured.
But users report it feels "clunky."

### Friction Points

| Friction Point | Why It Feels Clunky |
|---|---|
| ~~**Instant expand/collapse** — no animation~~ | ~~Jarring, feels like a debug UI~~ |
| ~~**No inline rename** — always a modal dialog~~ | ~~Breaks flow, feels heavyweight~~ |
| **Filter is single-level** — type-and-hope, no saved queries | Addressed by #20 (scope toggle) and bases-as-collections |
| **No breadcrumb** — deep hierarchy, no quick-return | Disorienting in large vaults |
| ~~**No empty-state design** — expanding an empty folder shows nothing~~ | ~~Confusing, feels broken~~ |
| **Settings buried** — file tree style settings hidden in the overloaded "Layout" tab | Undiscoverable |
| **Refresh is a no-op** in sidebar (deferred bug) | Violates user expectations |
| **Explorer is a single-dimensional hierarchy** — just folders | Resolved by surfacing bases views in sidebar (#1, #2, #16) |

### Related Bugs / Deferred Items

- **Refresh is a no-op** (carbide/2026-05-28_bugs_triaged.md#4.2): Refresh button doesn't rescan workspace.
- **Linked-source folders not visible in file tree** (carbide/2026-05-28_bugs_triaged.md#2.1): Deferred. Gated by `file_tree_show_linked_sources`.
- **Settings reorganization** (carbide/plans/2026-04-15_settings_panel_reorganization_plan.md): File tree settings should move to a dedicated "Sidebar" pane.
- **No filename prompt on paste** (artifacts, HTML paste): Users must rename via file tree as workaround.

### Architectural Gaps

- **Massive code duplication** in `workspace_layout.svelte`: Explorer and Starred `VirtualFileTree` blocks are ~95% identical (~40 props each).
- **No generic sidebar view dispatcher**: Each view type is a separate `{#if}` block.
- **`flatten_filetree` recomputes full tree on every derived change**: `sort_tree(build_filetree(...))` runs even when only expansion state changed.
- **Two independent expansion state systems**: Explorer uses `stores.ui.filetree.expanded_paths`, starred uses a local `SvelteSet` with `starred:` prefixes.
- **No external drag-and-drop into the tree**: Drop from OS not supported.
- **Pagination "load more" is scroll-only**: No button or keyboard shortcut to trigger the next page.

---

## Core Insight (Updated)

The original insight: *a static folder tree is a single, rigid dimension for organizing notes.*

What changed: **bases now owns the other dimensions.** The explorer's job is no longer to
become multi-dimensional itself — it's to be a great folder mirror **and** to surface bases
saved views as first-class sidebar content. Two complementary surfaces, not one overloaded one.

The integration unlock (your "canvas-graph-as-folder" insight, generalized): any saved bases
query is a virtual folder. Surface them in a "Views" sub-tab, render results as a tree when
the view has `group_by` set, and the user gets pivot views, smart collections, and smart
archive in one mechanism.

---

## Bases Integration Plan (prerequisite for Phase 2)

Before Phase 2 features land, two changes to bases are needed:

### B1. Add `tree` view mode with `group_by`

```ts
// src/lib/features/bases/ports.ts
export type ViewMode = "table" | "list" | "kanban" | "gallery" | "calendar" | "tree";

export type TreeConfig = {
  group_by: string[];           // multi-level: ["tags", "status"] → /tag/status/note.md
  date_format?: string;         // for date properties: "YYYY/MM"
};

export interface BaseViewDefinition {
  // ...existing fields
  tree_config?: TreeConfig;
}
```

### B2. Ship default saved views

Seed the vault on first run with these saved bases views, surfaced in the explorer "Views" sub-tab:

- **By Tag** — `group_by: ["tags"]`
- **By Created Month** — `group_by: ["created"]`, `date_format: "YYYY/MM"`
- **By Status** — `group_by: ["status"]` (if any note has `status` property)
- **Modified This Week** — `filters: [{property: "modified", operator: ">", value: "now()-7d"}]`, sort by modified desc
- **Orphan Notes** — `filters: [{property: "backlink_count", operator: "=", value: "0"}]`
- **Smart Archive** — `filters: [{property: "accessed", operator: "<", value: "now()-30d"}]`

These replace what the original plan called "Pivot Views" (#1) and "Smart Collections" (#2).

### B3. Sidebar surface

Add a "Views" sub-tab to the explorer (#16). It lists `bases_port.list_views()` results.
Clicking opens the bases panel. Right-click → "Pin as tree" renders results inline as
virtual tree nodes (read-only, no drag/rename).

---

## Implementation Sequencing

### Phase 1 — Polish (quick wins, high perception impact)

Unchanged from original plan. Ship in order:

1. Inline rename (#8) — *done*
2. Animated expand/collapse (#9) — *done*
3. Empty folder states (#11) — *done*
4. Breadcrumb bar (#10) — *done* — `src/lib/features/folder/ui/path_breadcrumb.svelte`, wired above the editor pane; ancestor clicks dispatch new `filetree_reveal_folder` action.
5. Fix refresh button (#18) — *done* — added `clear_folder_cache(vault_id)` Tauri command and invoke it at the head of `folder_refresh_tree`; root cause was the Rust folder-listing cache (30s TTL) returning stale entries after external filesystem changes.
6. Extract file tree settings into a "Sidebar" settings pane (see `carbide/plans/2026-04-15_settings_panel_reorganization_plan.md`) — *done previously* — `SettingsCategory` already includes `"sidebar"`; `settings_dialog.svelte` renders the pane with `file_tree_style`, `file_tree_show_blurb`, `file_tree_blurb_position`, `file_tree_show_linked_sources`, `max_open_tabs`, and `outline_mode`. Plan archived at `carbide/archive/implementation/2026-04-15_settings_panel_reorganization_plan.md`.
7. Scroll position persistence (#15)
8. Auto-expand to active note (#13)
9. Keyboard shortcut coverage (#12)
10. Tree filter scope toggle (#20)
11. Sticky folder headers (#25)
12. Reveal-in-explorer command (#19)

### Phase 2 — Bases Integration & Sidebar Restructure

Order matters; B1–B3 unblock the rest.

1. **B1**: Add `tree` view mode + `group_by` to bases.
2. **B2**: Ship default saved views.
3. **B3**: Sub-tabs in explorer with "Views" tab (#16). Verify `.carbide/` is filtered from the file tree (see D2).
4. "Related" tab on ContextRail (#3 reframed, see D1) — recents in folder + siblings + shared-tag chips that open bases queries.
5. Folder-note click-through in explorer (#21, see D3) — clicking a folder opens `folder/folder.md` if it exists.
6. Peek preview (#5).
7. Drag-from-tree-into-editor (#24).
8. Path-aware Cmd+P (#26).

### Phase 3 — Power Features

1. Workspace snapshots (#6) — *must capture bases view + filter/sort/kanban state.*
2. Undo for file ops (#23, see D4) — session-scoped ring buffer + soft-delete trash.
3. Color + icon polish driven by frontmatter (#14 + #22).
4. Pinned folders (#7-pinned).
5. External file drop (#17).
6. Multi-select operations audit (#27) + Shift-Enter tab group (#28).

### Dropped

- **Two-pane explorer (#4)** — replaced by "open bases table scoped to selected folder."
- **Smart Collections as separate engine (#2 as written)** — replaced by surfacing bases saved views.
- **Pivot Views as separate component (#1 as written)** — replaced by bases `tree` view mode.
- **Recent section (#7-recent)** — Cmd+P / command palette already covers this; another surface is real-estate cost without payoff. Revisit if usage data suggests otherwise.

---

## Resolved Decisions

All four open questions resolved against the codebase 2026-05-29. Each grounded in a
specific file/line, not speculation.

### D1. Contextual sidebar (#3) — **reframe as a "Related" tab on the existing ContextRail; do not build a left-rail section**

**Evidence**: `src/lib/features/links/ui/context_rail.svelte` already exists with tabbed
sections for Links (backlinks + forward links), Outline, and Metadata. It's mounted in
`workspace_layout.svelte:961` (`<ContextRail />`).

The original #3 proposal duplicates ~80% of this surface (backlinks + shared tags).
Building a second copy on the left rail fragments the "info about current note" UX
across two columns.

**Resolution**: instead of a left-explorer contextual section, **add a "Related" tab
to `ContextRail`** containing only the novel pieces that aren't already there:

- **Recently accessed in same folder** (last 5–8) — new signal, not in Links/Outline/Metadata.
- **Sibling notes** (same parent folder) — useful "what else is here" jump list.
- **Shared-tag chips** — each chip is a one-click open of a bases query
  `tags CONTAINS <tag> AND path != current`. Reuses bases instead of building parallel
  query logic.

This keeps backlinks where they already live (Links tab), avoids duplicate surfaces, and
makes the integration with bases concrete: shared-tag chips → bases queries.

Item #3 in the Decision Log table is updated accordingly.

**Cheap ContextRail intrusiveness fixes** (noted while inspecting; ship alongside the
"Related" tab work since the file is already open):

- **Auto-hide the 36px icon strip when no note is open** — gate `<ContextRail />` mount in
  `workspace_layout.svelte:961` on `stores.editor.open_note`. Reclaims editor width on
  welcome/dashboard states where the rail has nothing useful to show.
- **Settings toggle to hide rail entirely** — boolean in UI settings (`Sidebar` pane, per
  the settings reorg plan), `if (!ui.context_rail_hidden)` around the mount. Users who
  rely on Cmd+P / sidebar views may never touch Outline/Metadata.
- **Make the 280px popout width respect a CSS var** — `width: var(--context-rail-panel-width, 280px)`
  so the eventual resize handle / settings slider has somewhere to bind. One-line change today.
- **Hover-to-peek mode** (optional setting) — hover icon → panel slides out, mouseleave →
  collapses. Lower commitment than click-toggle. Backdrop infra already exists.
- **Keyboard chord to toggle** — Cmd+\ or similar via the action registry; pairs well with
  the existing `data-vim-nav-region` model.

These don't need their own phase; bundle with D1's Related-tab work as a small "ContextRail
ergonomics" PR.

### D2. Bases view storage (#1, #2, B3) — **already at `.carbide/bases/{slug}.json`; verify the dotfolder is hidden, no further design needed**

**Evidence**:
- `src/lib/app/sidebar_views.ts:60`: `const path = `.carbide/bases/${slugify(name)}.json``
- `src-tauri/src/features/bases/service.rs:84`: `list_views` reads from `root/.carbide/bases/`
- Files use `.json` extension, not `.base`.

**Resolution**: storage location is already settled. **The only action item is to verify
that `.carbide/` is filtered from the explorer's file tree.** If it is (likely — it's
the standard dotfolder pattern), zero work. If not, add it to the ignore list before
shipping B3.

The "Views" sub-tab calls `bases_service.list_views(vault_id)` and renders
`SavedViewInfo[]`. Decision Log entry B3 stands.

### D3. Folder notes naming (#21) — **`folder/folder.md` (Obsidian-style same-name); convention already in code**

**Evidence**: `src/lib/features/search/application/search_service.ts:689` already resolves
folder notes using the same-name pattern:

```ts
const folder_note = `${md_path.slice(0, -3)}/${note_name_from_path(md_path)}.md`;
```

i.e. for `foo.md`, it also looks up `foo/foo.md`. This is the Obsidian convention.

**Resolution**: use the existing convention. **`folder/folder.md` becomes the folder's
landing page when the folder header is clicked.** No new convention to document; just
make the explorer respect the one that link resolution already uses.

Side effect: this aligns folder-note behavior between link resolution and explorer
navigation, which is currently inconsistent (links resolve folder notes; clicking the
folder in the tree doesn't open them).

### D4. Undo scope (#23) — **in-session, per-vault, bounded ring buffer; no persistent log**

**Evidence**: no existing file-op undo infrastructure. Both `delete_note_dialog.svelte:44`
and `delete_folder_dialog.svelte:93` ship the copy *"This action cannot be undone."* —
confirming this is greenfield.

**Resolution**: build session-scoped undo only.

- Add a `FileOpHistoryStore` (Svelte rune store) with a bounded ring buffer (cap: 50 ops).
- Each entry: `{ op_type: "rename" | "move" | "delete" | "create", performed_at, undo_fn }`.
  `undo_fn` is a thunk that calls the inverse vault operation (move back, recreate from
  trash, etc.).
- Cleared on vault switch and app restart.
- Bound to `Cmd/Ctrl+Z` *only when the file tree is the focused vim-nav region*
  (`workspace_layout.svelte:311` already tracks this via `data-vim-nav-region="file_tree"`).
- Soft-deletes (move to a `.carbide/trash/` directory) make delete reversible without a
  separate log; rename/move are reversible by inverting the args.
- Remove the "This action cannot be undone" copy from both delete dialogs; replace with
  "Move to trash (Cmd+Z to undo)."

Persistent cross-restart undo is deferred. Revisit if user data shows the in-session
cap is too small.

---

## Related Documents

- `carbide/2026-05-28_bugs_triaged.md` — Refresh no-op, linked-source visibility
- `carbide/plans/2026-05-28_bugs_implementation_plan.md` — Cross-cutting linked-source refactor
- `carbide/plans/2026-04-15_settings_panel_reorganization_plan.md` — Settings pane extraction
- `src/lib/features/bases/` — Bases feature (ports, domain, ui)
- `docs/architecture.md` — Decision tree and layered architecture guidance
