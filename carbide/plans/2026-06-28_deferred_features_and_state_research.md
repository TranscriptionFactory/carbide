# Carbide Triage — Deferred Features Implementation Plan + #13 `.ok` State Research

## Context

The first batch (see the bug-reports-and-fix-plan doc) clears the six high-priority bugs. This plan stages the deferred **feature** items with concrete, reuse-driven steps, and resolves #13 with research only (no code). All reuse points below were verified against the source.

## Feature build order (suggested)

| Order | Item | Cluster | Effort | Depends on |
|---|---|---|---|---|
| 1 | **#7** Callout config | Callouts | M | #1 (bug batch) landed first |
| 2 | **#5** Block add dropdown | Authoring | M | none (reuses slash registry) |
| 3 | **#8** Ghost text placeholder | Authoring | S–M | none |
| 4 | **#4** Nodeview resize consistency | Nodeviews | M | none |
| 5 | **#6** Table restyle to OK look + edge insert bars (re-spec; porting framing superseded) | Tables | S–M | none |

#5 and #8 share the slash-command architecture but touch different files (`block_drag_handle_plugin.ts` vs a new placeholder plugin) — parallel-safe. #7 must follow #1. #4 and #6 are independent of everything else.

---

### #7 — Callout type / color / collapsible configurable — `Medium`

**Reuse points (verified):**
- `remark_callout.ts` — `parse_callout_directive(text)` / `format_callout_directive(data)`, directive `[!type]`, foldable `[!type+]`/`[!type-]`, `CALLOUT_TYPES` + `canonical_callout_type()`.
- `schema.ts` callout attrs (380-385) + `toDOM`/`parseDOM` (data-attr pattern).
- `callout_view_plugin.ts` `CalloutBlockView` header DOM (77-100) — picker mounts beside `icon_el`.

**Build sequence:**
1. **Schema:** add `callout_color` (and optional `callout_style`) attr; serialize/deserialize via `data-callout-color` in `toDOM`/`parseDOM`.
2. **Markdown round-trip:** extend the directive syntax to carry color (e.g. `[!type|color]` — pick a syntax that survives `parse_callout_directive`/`format_callout_directive`); add the field to `CalloutData`. **Decision needed:** custom color syntax is non-standard markdown — confirm whether color should persist to markdown at all, or live only as an editor-side attr (defaulting from type).
3. **View UI:** mount a small swatch/type picker in the nodeview header; on change `view.dispatch(tr.setNodeMarkup(pos, null, {...attrs, callout_color}))`; refresh in `update()`.
4. **CSS:** drive callout color from the attr via CSS vars (extend existing `callout-block--<type>` rules).
**Verify:** change type+color in UI → persists across reload; markdown round-trip stable; unit test for directive parse/format with color.

---

### #5 — Block add handle with block-type dropdown — `Medium`

**Reuse points (verified):**
- `slash_command_plugin.ts` — `create_commands(): SlashCommand[]` (~388); `SlashCommand` = `{id,label,description,icon,keywords,insert}`; insertion makers (~110-386) cover h1–h6, code, table, lists, todo, query/base/backlinks/task-query, blockquote, callouts, divider, math, collapsible, frontmatter.
- `suggest_dropdown_utils.ts` — `position_suggest_dropdown`, `scroll_selected_into_view`, `attach_outside_dismiss`, `mount_dropdown`, `destroy_dropdown`.
- `block_drag_handle_plugin.ts` — `on_insert_click` (~283), `insert_paragraph_below` (~58), `create_handle_element` (~37).

**Build sequence:**
1. Expose a block-level subset of `create_commands()` (filter to block insertions) — share it between the slash menu and the + handle (single source of truth).
2. New small helper (e.g. `block_type_dropdown.ts`) that renders the list with `suggest_dropdown_utils` (mirror the slash menu's render/keyboard handling).
3. In `block_drag_handle_plugin.ts`, replace the direct `insert_paragraph_below()` in `on_insert_click` with: open the dropdown anchored at the handle; on select, call the command's `insert()` at the target position.
4. Keep dropdown state in the plugin view closure (as the slash plugin does).
**Verify:** clicking + shows the menu, filters, inserts the chosen block type; Esc/click-outside dismiss; paragraph still reachable.

---

### #8 — Ghost/placeholder text ("type / for command") — `Small–Medium`

**Reuse points (verified):**
- Decoration pattern in `ai_menu_plugin.ts` (`Decoration.widget`, `DecorationSet.create`, plugin `decorations(state)`).
- Plugin assembly: `extensions/index.ts` `assemble_extensions()` (~35-83).
- Empty detection: `node.content.size === 0` (see `callout_keymap_plugin.ts` `body_is_single_empty_para`, ~64).

**Build sequence:**
1. New `placeholder_decoration_plugin.ts`: `decorations(state)` walks the doc; for each empty textblock (and/or empty doc), emit a `Decoration.widget` rendering a `contentEditable=false` hint element ("type / for command").
2. Auto-hides on input (decorations recompute on doc change).
3. Register in `assemble_extensions()` / core extension plugin list.
4. CSS: `.editor-placeholder { color: var(--muted-foreground); pointer-events: none; }` (shadcn token).
**Verify:** empty note/block shows hint; typing or `/` hides it; doesn't serialize into markdown.

---

### #4 — Nodeview resize consistency — `Medium` (phased)

**Reuse points (verified):**
- `resize_handle.ts` — `create_width_resize_handle(target, on_commit)` → `{el, cancel}`, `on_commit(width|null)` (null = reset).
- `code_block_view_plugin.ts` — height variant `create_resize_handle` (~294), `apply_height` (~279), commit via `setNodeMarkup`.
- Gaps: `file_embed_view_plugin.ts` (has `height:400` in schema line 489, **no handle**); `excalidraw_embed_view_plugin.ts` (**no height attr**, line 197); `note_embed_view_plugin.ts` (no height; has `collapsed`). Task-query smart block renders inside the code-block nodeview → **already resizable**.

**Build sequence:**
1. Extract a shared `setup_resizable_nodeview(dom, target_el, get_pos, view, { axis, attr })` helper from the code-block height logic (avoids copy-paste across plugins).
2. **Phase 1 (cheap):** wire it into `file_embed_view_plugin.ts` (schema height already exists).
3. **Phase 2:** add `height` attr to `excalidraw_embed` schema (+ data-attr round-trip), then wire the handle.
4. **Phase 3 (evaluate UX):** note embeds — add height attr + handle only if desired (live markdown height resize is lower value).
**Verify:** each nodeview drags to resize, double-click resets, height persists across reload; consistent cursor/affordance.

---

### #6 — Table restyle to the Open Knowledge look + edge insert bars — `S–M` — **SHIPPED (pass 1)**

> **Re-spec note (2026-06-29):** The original "port OK's TipTap table extensions" framing below is **superseded**. The user narrowed the intent: **do not port anything from TipTap→ProseMirror.** The goal is purely (1) restyle Carbide's existing raw-ProseMirror tables to *look* like OK's (flat grid, clean header, soft selected-cell tint) and (2) move add/delete affordances to the table's edges. Full re-spec: `~/.claude/plans/peppy-sniffing-hearth.md`. Markdown column-width persistence is explicitly out of scope (markdown has no width concept).

**Shipped this pass (branch `feat/table-ok-restyle`):**
- **Part A — engine on.** `table_extension.ts` now registers `columnResizing()` + `tableEditing()` (order: resizing then editing) alongside the existing keymap + floating toolbar. Tables now render through prosemirror-tables' `TableView` → real `.tableWrapper`, genuine multi-cell selection, `.column-resize-handle`.
- **Part B — flat-grid restyle.** `src/styles/editor.css`: `border-collapse: collapse`, outer radius/border dropped, scroll/`max-height` moved off `table` onto `.tableWrapper`, full `1px` cell borders + `position: relative`, non-uppercase `600`-weight header on `var(--muted)`, **stripes + row-hover removed**, `.selectedCell::after` accent tint, `.column-resize-handle` style. Retired dead tokens `--editor-table-header-bg` / `--editor-table-stripe`; kept `--editor-table-border`.
- **Part C — edge `+` bars.** NEW `table_edge_controls_plugin.ts` (editor-relative overlay modeled on `block_drag_handle_plugin.ts`): right bar appends a column, bottom bar appends a row; hover-reveal, hide-on-leave. NEW `table_command_utils.ts` — `find_table_at(view, coords)`, `append_column(state, table)`, `append_row(state, table)`. **Design deviation from the re-spec:** instead of "place a CellSelection at the edge cell then run `addColumnAfter`", the helpers use prosemirror-tables' lower-level `addColumn`/`addRow(tr, rect, index)` with `index = map.width`/`map.height`. This produces a single transaction, is view-free, and is directly unit-testable — no selection juggling, no `select_cell_at` helper needed.
- **Tests:** `tests/unit/adapters/table_command_utils.test.ts` (append grows map by exactly 1, doc stays valid, no `colwidth` leak); extended `table_serialization.test.ts` (byte-stable round-trip with the new plugins; edge-appended col/row serializes clean, no width markup). All `pnpm check`/`lint`/`test` green (4606 tests).

**Verified-clean risk (from re-spec):** the floating toolbar's Fit/Full layout toggle vs `TableView` — `TableView` renders its own `<table>` and ignores `schema.table.toDOM`, so the `table-fixed-layout` class may not reach the rendered table once `columnResizing` is active. Not addressed this pass per the re-spec's "don't expand scope unless it visibly regresses"; folded into the follow-up.

**Deferred follow-up (out of scope this pass):**
- Per-row/column **pill handle menus** (insert-at-position, delete, toggle header, align) + **removal of the floating toolbar** — distribute its controls to the edges, fold the layout toggle into the column pill, extract shared command helpers (the toolbar's own `find_table_dom` stays untouched until then). Template: `image_context_menu_plugin.ts`.
- Persisting column widths to markdown.
- Frozen/sticky headers (the old step 3) — only if requested; needs editor scroll-container discovery.

<details><summary>Original (superseded) porting plan</summary>

OK is React/TipTap; Carbide is raw ProseMirror + Svelte. Each port translates a React component/extension into a ProseMirror plugin (+ Svelte-mounted DOM where a menu is needed). Recommended order = cheapest/highest-value first:

| Order | OK feature | OK source | Carbide target | Effort | Risk |
|---|---|---|---|---|---|
| 1 | **Markdown source fidelity** (preserve dash counts, padding, outer pipes, alignment) | `core/src/extensions/table-fidelity.ts` + `markdown/to-markdown-handlers.ts` | `schema.ts` (4 source attrs on table/cell/header), `mdast_to_pm.ts` (capture), `pm_to_mdast.ts` (emit), `tests/unit/adapters/table_serialization.test.ts` | M | Low |
| 2 | **Edge insertion bars** (+ on right/bottom edges) | `app/src/editor/extensions/table-insert-controls.ts` | NEW `table_edge_insertion_plugin.ts`; register in `table_extension.ts`; reuse `floating_toolbar_utils.ts`; CSS | S | Low (verify `.tableWrapper` present) |
| 3 | **Frozen/sticky headers** (scroll-driven) | `app/src/editor/extensions/frozen-table-headers.ts` | NEW `frozen_headers_plugin.ts`; register in `table_extension.ts`; CSS | M | **Med** — must locate Carbide's editor scroll container (OK keys off `[data-testid="editor-scroll-container"]`); verify ancestor hierarchy |
| 4 | **Cell handle dropdown menus** (row/col ops, header toggle) | `app/src/editor/table-controls/TableCellHandles.tsx` | NEW `table_cell_handles_plugin.ts` + Svelte menu (template: `image_context_menu_plugin.ts`); reuse existing prosemirror-tables commands in `table_toolbar_plugin.ts` | L | Med |

**Build note:** Steps 1 and 2 are independent and parallel-safe; do them first. Step 3 needs DOM scroll-container discovery (inspect the rendered editor). Step 4 is the most UI-heavy (Svelte menu lifecycle).
**Verify:** round-trip a table with custom spacing → byte-stable markdown (step 1); edge bars insert row/col (step 2); header stays visible on vertical scroll (step 3); cell handle menu performs all ops incl. header toggle (step 4). Extend `table_serialization.test.ts`.

</details>

---

## #13 — `.ok` state management & folder: RESEARCH & RECOMMENDATION (no code)

**Headline finding (corrects the original report's premise):** Carbide is **not** missing persistent workspace state. It already persists open tabs, active tab, pinned tabs, **per-tab cursor**, and **pane split** via `tab_persist.reactor.svelte.ts` (throttled 1s) → `tab_service.save_tabs()` → `~/.carbide/local_state/<vault-id>.json` (key `open_tabs`), restored on vault open. It also has a two-tier settings model: shared `<vault>/.carbide/settings.json` (committed) + machine-local `~/.carbide/local_state/<vault-id>.json`, with a `GLOBAL_ONLY_SETTING_KEYS` filter. Constants in `special_folders.ts` (`APP_DIR = .carbide`); RAG sessions already live under `<vault>/.carbide/rag/`.

### Side-by-side

| Concern | Open Knowledge | Carbide | Verdict |
|---|---|---|---|
| Open tabs / active doc / pinned | `projectSessions[path]` in app `state.json` | `open_tabs` in `local_state/<vault-id>.json` | **Parity** |
| Per-tab cursor | not tracked (delegated to doc/CRDT) | tracked + restored | **Carbide ahead** |
| Pane split state | not tracked | `active_pane` + per-tab `pane` | **Carbide ahead** |
| Shared config | 3-tier YAML (`built-in → ~/.ok/global.yml → .ok/config.yml`, Zod-validated) | flat JSON `settings.json` + global-only filter | OK richer; Carbide simpler |
| Machine-local overrides | `.ok/local/config.yml` (in-workspace) | `~/.carbide/local_state/<vault-id>.json` (app-level, vault-keyed) | Different hierarchy; both valid |
| Persistent UI layout (sidebar/panels/zen) | not persisted (resets) | not persisted (transient `UIStore`) | **Gap in both** |
| Config validation/atomicity | file-lock + Zod validate + revert | atomic JSON write, no schema | OK stronger |

Sources — OK: `packages/core/src/constants/ok-dir.ts`, `packages/desktop/src/main/state-store.ts`, `packages/core/src/config/schema.ts`, `packages/server/src/config-persistence.ts`. Carbide: `src/lib/shared/constants/special_folders.ts`, `src/lib/features/tab/application/tab_service.ts`, `src/lib/reactors/tab_persist.reactor.svelte.ts`, `src/lib/features/settings/application/settings_service.ts`, `src-tauri/src/features/vault_settings/service.rs`.

### Recommendation

1. **Do NOT undertake the "OK state management" rewrite.** Carbide's session-state model already meets/exceeds OK's; migrating to OK's app-level `state.json` or in-workspace `.ok/local` would be churn with no user-visible gain (Carbide's vault-id-keyed local state is in fact better for multi-remote/browse use). **Skip.**
2. **Worth doing (high value / low effort, ~2–3h):** persist **UI layout** (sidebar open, context-rail tab, bottom-panel, zen) — neither app does this today, and it's the one real UX gap. Add a `ui_layout` key to `local_state/<vault-id>.json`; extend `tab_persist.reactor` to also watch `UIStore`; hydrate on boot. (Net-new feature, not a port.)
3. **Optional (low value, ~1–2h):** formalize a settings scope enum (`global | vault | project`) + doc comment on `VaultSettingsPort`, to make the implicit shared/local split explicit. No behavior change.
4. **Skip:** adopting YAML `.carbide/config.yml` (only justified if a user-facing per-vault config feature is planned — e.g. ignore-folders, disable-terminal); and skip moving local state into the workspace tree.

**Net:** #13 closes as "already satisfied; the only worthwhile follow-up is UI-layout persistence (item 2 above), which can be filed as its own small feature."

## Verification (this plan)

Same `AGENTS.md` gate after each feature: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm format` (and `cargo check` only if Rust touched — relevant only if #6 markdown fidelity or any backend attr touches Rust). Add/extend unit tests per feature (callout directive+color round-trip; block-type registry sharing; placeholder decoration; resizable nodeview attr persistence; table fidelity round-trip). Manual E2E per each **Verify** line. Commit per feature on a `feat/<name>` branch. #13 produces no code — its output is the recommendation above.
