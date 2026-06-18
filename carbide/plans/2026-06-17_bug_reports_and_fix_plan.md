# Bug Reports & Fix Implementation Plan — 2026-06-17

Six user-reported bugs spanning the search-graph drill-down, the Related panel,
file-type routing, the editor/tab lifecycle, and PDF text extraction. Each entry
carries code-level root-cause analysis and a focused fix plan. Internal-only
product, 0 users — clean refactors preferred over backwards-compat shims.

The headline finding is **BUG-4**: it is *not* a file-type-detection bug. The
detector already classifies `.sh` correctly as `text`. The defect is that ~25
"open this path" call sites dispatch `note_open` unconditionally, forcing any
non-markdown file opened from those surfaces into the ProseMirror markdown
editor. The right fix is one central change, not 25.

## Triage summary

| ID  | Area                                | Severity | Effort | Root-cause confidence |
| --- | ----------------------------------- | -------- | ------ | --------------------- |
| 1   | Search-graph drill-down right-click | Medium   | S      | Confirmed             |
| 2   | Search-graph sort/filter (asc/desc) | Medium   | S      | Confirmed             |
| 3   | "100% semantic similarity" meaning  | Low      | XS–S   | Confirmed (not a bug) |
| 4   | `.sh`/non-md opened as markdown     | High     | S      | Confirmed (systemic)  |
| 5   | Cursor jumps to doc end on tab swap | High     | S–M    | Confirmed             |
| 6   | PDF unicode/glyph extraction panic  | Medium   | M      | Confirmed             |

Suggested batching: **4 and 5 first** (highest user-facing pain, both editor/tab
core). **1 + 2** ship together (same component). **3** is a labeling/UX pass. **6**
is backend-isolated and can land independently.

---

## BUG-1: No additional right-click options in search-graph drill-down

**Component:** features/graph (search-graph result list)
**Severity:** Medium
**Status:** Confirmed — feature gap, no menu wired at all.

**Evidence:**

- The drill-down list cards in `src/lib/features/graph/ui/search_graph_result_list.svelte:251-326`
  are plain `<button>` elements wired only to `click` / `dblclick` /
  `pointerenter` / `pointerleave`. There is **no `oncontextmenu` and no
  context-menu component** on the cards.
- The graph *canvas* already has a (custom, CSS-positioned) right-click menu at
  `src/lib/features/graph/ui/vault_graph_canvas.svelte:224-226` (handler) and
  `:403-449` (menu items: Focus node / Find similar / Open note / Export as
  canvas). So the canvas has options; the **list does not**.
- A reusable, shadcn-based menu primitive exists at
  `src/lib/components/ui/context-menu/index.ts`, and a complete reference usage
  lives in `src/lib/features/folder/ui/drilldown_file_tree.svelte:145-241`
  (Star/Unstar, Copy Path, Open to Side, Reveal in File Manager, Open in Default
  App, Rename, Delete).

**Expected behavior:** Right-clicking a drill-down result exposes the same
common actions available elsewhere in the app (open, open to side, copy path,
reveal in file manager, open in default app, and graph-specific "find similar /
focus node").

**Fix plan:**

1. In `search_graph_result_list.svelte`, wrap each card
   (`:251-326`) in `ContextMenu.Root` / `ContextMenu.Trigger` /
   `ContextMenu.Portal` / `ContextMenu.Content`, mirroring
   `drilldown_file_tree.svelte:145-241`. Use the shadcn primitive — do **not**
   hand-roll a second custom popup like the canvas did (that custom menu is a
   candidate to migrate to the primitive later, but out of scope here).
2. Add menu items that delegate to existing actions/props rather than
   reimplementing IO:
   - **Open** / **Open to side** — reuse the `on_open` prop (`:25`, `:47`) and a
     new `on_open_to_side` prop.
   - **Copy path**, **Reveal in file manager**, **Open in default app** — reuse
     the same shell/clipboard actions the file tree calls; thread them in as
     props from `search_graph_tab_view.svelte` so the component stays IO-free.
   - **Find similar notes** / **Focus node** — reuse the existing graph expand
     handlers already present for the canvas.
3. Keep the component pure: new behaviors arrive as props, dispatched from the
   parent view via the action registry (architecture rule 6 — components do not
   import services).

**Files to change:**

- `src/lib/features/graph/ui/search_graph_result_list.svelte` (add context menu + props)
- `src/lib/features/graph/ui/search_graph_tab_view.svelte` (wire props to actions; it already owns `open_node` at `:63-70`)

**Tests:** Component test asserting the menu renders the expected items and that
selecting each fires the corresponding prop callback with the node path.

---

## BUG-2: Search graph needs richer filtering/sorting (ascending/descending)

**Component:** features/graph (search-graph result list)
**Severity:** Medium
**Status:** Confirmed — sort is descending-only; no direction toggle.

**Evidence:**

- Sort modes are defined at
  `src/lib/features/graph/ui/search_graph_result_list.svelte:12` and `:98-102`:
  `"relevance" | "date_created" | "date_modified"`.
- The comparator at `:79-94` is **hardcoded descending** for every mode (sorts by
  `kind` first — hits before neighbors — then descending score / date). There is
  no ascending option.
- Existing filters at `:66-77` + toolbar `:161-245`: by kind (`show_neighbors`),
  by file type (`show_markdown` / `show_non_markdown`), by source
  (`show_vault` / `show_linked`), and `min_score` slider.
- Per-instance state lives in
  `src/lib/features/graph/state/search_graph_store.svelte.ts:5-20` /
  `:171-179` (`show_neighbors`, `min_score`, with `toggle_neighbors()` /
  `set_min_score()`). **Sort mode/direction is currently component-local only**,
  so it does not persist across tab reopen.

**Expected behavior:** A sort-direction toggle (asc/desc) that applies to the
active sort mode, plus (optionally) a name/title sort. Sort choice persists with
the graph instance like the other filters.

**Fix plan:**

1. Add a `sort_ascending` boolean toggle to the toolbar (`:161-178`) next to the
   sort-mode select.
2. Parameterize the comparator (`:79-94`) with a `direction = sort_ascending ? 1 : -1`
   multiplier; keep the `kind` primary grouping (hits-before-neighbors) intact so
   direction only flips the secondary key.
3. Persist `sort_mode` + `sort_ascending` on `SearchGraphInstance`
   (`search_graph_store.svelte.ts:5-20`) with setters
   (`set_sort_mode`/`toggle_sort_order`), wired through
   `src/lib/features/graph/application/search_graph_actions.ts`, so the choice
   survives tab persistence and matches how `min_score`/`show_neighbors` already
   work.
4. (Optional, low cost) Add a `"name"` sort mode for alphabetical asc/desc, since
   the direction toggle makes it cheap.

**Files to change:**

- `src/lib/features/graph/ui/search_graph_result_list.svelte` (toggle UI + comparator)
- `src/lib/features/graph/state/search_graph_store.svelte.ts` (persisted sort state)
- `src/lib/features/graph/application/search_graph_actions.ts` (setter actions)

**Tests:** Unit test the comparator: same data, asc vs desc produces reversed
secondary ordering while preserving hits-before-neighbors grouping. Store test:
sort state round-trips through persistence.

---

## BUG-3: "What does 100% semantic similarity mean?" (Related panel)

**Component:** features/links (Related panel → "Similar notes" section)
**Severity:** Low
**Status:** Confirmed — the number is mathematically correct; this is a
clarity/UX problem, possibly compounded by per-chunk matching.

**Evidence:**

- The "Related" panel is `src/lib/features/links/ui/related_panel.svelte`; the
  similarity figure is rendered by its child
  `src/lib/features/links/ui/suggested_links_section.svelte` (mounted at
  `related_panel.svelte:69` as "Similar notes").
- Display: `suggested_links_section.svelte:19-20` →
  `` `${Math.round(similarity * 100)}%` `` rendered at `:56-58`.
- Score derivation: `src/lib/features/links/domain/merge_suggestions.ts:44` →
  `const similarity = 1 - hit.distance;` where `hit.distance` is **cosine
  distance** from the HNSW index
  (`src-tauri/src/features/search/hnsw_index.rs:214-229`, `DistCosine`).
- Threshold: `merge_suggestions.ts:45` drops `similarity <= threshold`; default
  `0.5` at `src/lib/features/links/application/links_service.ts:189`, with
  `exclude_linked=true` requested at `:201`.
- Self-match guard exists in Rust:
  `src-tauri/src/features/search/service.rs:2550-2551` skips
  `*path == note_path`.

**What 100% actually means:** cosine similarity ≈ 1.0 (cosine distance ≈ 0) —
the candidate's embedding is essentially identical to the current note's. Because
`Math.round` is used, any distance in `[0, 0.005)` displays as `100%`. So "100%"
= "near-identical embedding," not a literal byte-for-byte duplicate.

**Most likely *why the user sees it* (and the real lever):** if embeddings are
computed **per chunk** rather than per whole note, a candidate can score ~100% on
a single shared chunk (boilerplate header, shared template, identical paragraph,
or very short notes) without the notes being duplicates. Worth confirming whether
`hit.distance` is a chunk-level or note-level score before deciding how loud to
be about it. (The self-exclusion at `service.rs:2550` is by *path*, so a note
never matches itself — but two different notes sharing a chunk can both hit ~1.0.)

**Fix plan (pick per appetite):**

1. **Minimum (clarity):** change the badge from a bare `100%` to a labeled,
   tooltipped value, e.g. badge text `"~100%"` capped below 100 for non-identical
   (`Math.min(99, Math.round(similarity*100))` unless distance is exactly 0), with
   a `title` like "Cosine similarity of note embeddings (1.0 = identical
   meaning)". This kills the "is this broken?" confusion at `suggested_links_section.svelte:19-20`.
2. **If per-chunk is confirmed:** label the section "Similar passages" or surface
   the matched snippet, so a 100% on shared boilerplate reads as expected rather
   than alarming.
3. **Guard rail:** add an assertion/log if a *self path* ever appears in
   suggestions (defense-in-depth against the `service.rs` filter silently
   regressing).

**Files to change:**

- `src/lib/features/links/ui/suggested_links_section.svelte` (label/format)
- (conditional) `src/lib/features/links/domain/merge_suggestions.ts` / `links_service.ts` if we decide to relabel chunk-vs-note or raise the threshold.

**Tests:** Unit on the label formatter (1.0 → "100%"/"identical"; 0.996 →
"99%"; clamp behavior). No backend change required unless per-chunk relabeling is
adopted.

**Recommendation:** This is the lowest-priority item — the math is right. Do the
clarity pass (step 1) and confirm chunk-vs-note before investing further.

---

## BUG-4: `.sh` and other non-markdown files open as markdown (systemic)

**Component:** cross-cutting — every panel that opens a path by dispatching `note_open`
**Severity:** High
**Status:** Confirmed — **not** a detection bug; a routing bug at ~25 call sites.

**Evidence:**

- `detect_file_type()` in
  `src/lib/features/document/domain/document_types.ts:43-55` **already returns
  `"text"` for `.sh`** (only `.md` → `null` for notes; binary denylist → `null`;
  special map for pdf/image/html/epub/canvas; everything else → `"text"`).
- The document render path is correct: `"text"` →
  `src/lib/features/document/ui/document_viewer_content.svelte:223-231` →
  `DocumentEditor` (CodeMirror with
  `LanguageDescription.matchFilename()` for bash etc. —
  `document_editor.svelte:75-90`).
- The backend folder listing is correct too:
  `src-tauri/src/features/notes/service.rs:1660` `list_folder_contents` splits
  `.md` → notes (`:1720`) vs everything else → `FileMeta` (`:1730`), so the
  **file-tree** path opens `.sh` as a document (`file_tree_row.svelte:185-198`
  routes `file_meta` to `on_open_file`).
- The **correctly-branching** open paths prove the pattern:
  `src/lib/features/search/application/omnibar_actions.ts:367-373` and `:399-405`,
  and `src/lib/features/graph/ui/search_graph_tab_view.svelte:63-70`, all do
  `if (detect_file_type(path)) → document_open; else → note_open`.
- **The defect:** ~25 other surfaces call `note_open` *unconditionally*. A `.sh`
  in any of these opens in the ProseMirror markdown editor (so `#`, `**`, etc.
  render as markdown — "formatted wrong"). Confirmed unconditional call sites:

  | Surface | Location |
  | --- | --- |
  | **Related panel** | `src/lib/features/links/ui/related_panel.svelte:52` |
  | Similar-notes / suggested links | `src/lib/features/links/ui/suggested_links_section.svelte:31` |
  | Backlinks / links panel | `src/lib/features/links/ui/links_panel.svelte:37` |
  | Graph panel / tab / hierarchy | `graph_panel.svelte:89`, `graph_tab_view.svelte:88`, `hierarchy_tree_view.svelte:31` |
  | Tags | `src/lib/features/tags/application/tag_actions.ts:61` |
  | Query results | `src/lib/features/query/ui/query_panel_content.svelte:50` |
  | RAG citations | `src/lib/features/rag/application/rag_actions.ts:165` |
  | Task list | `src/lib/features/task/ui/task_list_item.svelte:23` |
  | Bases | `src/lib/features/bases/ui/bases_panel.svelte:216` |
  | LSP results | `src/lib/features/lsp/ui/lsp_results_panel_content.svelte:127` |
  | Tab bar | `src/lib/features/tab/ui/tab_bar.svelte:181` |
  | App deep-link / file open | `src/lib/app/orchestration/app_actions.ts:192,237,577,594`; `src/lib/app/di/create_app_context.ts:424,427` |
  | Daily notes | `src/lib/features/daily_notes/application/daily_notes_actions.ts:28,46` |
  | Vim nav | `src/lib/features/vim_nav/application/vim_nav_actions.ts:120` |
  | Folder note | `src/lib/features/folder/application/folder_actions.ts:555` |
  | Canvas node | `src/lib/features/canvas/ui/canvas_viewer.svelte:97` |
  | Source editor links | `src/lib/features/editor/ui/source_editor_content.svelte:292` |

**Expected behavior:** Opening any path routes by extension: `.md`/extensionless
→ note editor; `.sh`/`.py`/`.txt`/etc. → text/code viewer with language
highlighting; pdf/image/html/epub/canvas → their viewers.

**Fix plan — centralize, do not patch 25 sites:**

The DRY, architecture-aligned fix is to make the routing decision **once**.
Recommended: change the `note_open` action handler itself (in
`src/lib/features/note/application/note_actions.ts`) to call
`detect_file_type(path)` and **delegate to `document_open`** when the result is
non-null (non-markdown). Because `detect_file_type` returns `null` for `.md` and
extensionless paths, all genuine note opens (including not-yet-created notes and
wiki-link targets) are unaffected; only real non-markdown extensions get
redirected.

1. Normalize `note_open`'s argument shapes first — call sites pass a bare string
   (`note_open, path`), `{ note_path }`, and `{ path }`. The handler must extract
   the path uniformly before `detect_file_type`.
2. When `detect_file_type(path)` is non-null, resolve the absolute file path and
   `registry.execute(ACTION_IDS.document_open, { file_path })` (exactly as
   omnibar/graph already do), then return.
3. Leave the already-correct branching sites (omnibar, search-graph
   `open_node`) as-is; they become redundant but harmless. Optionally simplify
   them in a follow-up so there is one routing path.
4. Verify the special types still reach the right viewer (pdf/html/epub) when
   opened from, e.g., the Related panel — they currently would have mis-opened as
   markdown too, so this is a net fix for them as well.

**Why centralize in `note_open` rather than a new `open_path` action:** zero
changes at call sites, no risk of missing one, and it makes "open a path" do the
obviously-correct thing everywhere. The alternative (new `open_path` action +
edit 25 sites) is more churn and more likely to drift.

**Caveat to validate:** confirm nothing relies on `note_open` being a no-op /
note-create for non-markdown extensions (e.g. a path like `My.notes` where the
"extension" is incidental). `detect_file_type` keys off the last dot, so a note
titled `2026.budget` (no `.md` on disk but displayed without extension) — verify
note paths in this app always carry `.md`, which `list_notes`
(`service.rs:470,517`) enforces. If note paths are always `.md`, the redirect is
safe.

**Files to change:**

- `src/lib/features/note/application/note_actions.ts` (central routing in `note_open`)
- (follow-up, optional) remove now-redundant `detect_file_type` branches in `omnibar_actions.ts` and `search_graph_tab_view.svelte`

**Tests:**

- Action test: `note_open` with `foo.sh` delegates to `document_open` with the
  resolved file path; `foo.md` and `Some Note` (extensionless) open as a note.
- Regression: `.pdf`/`.html`/`.epub` from a non-omnibar surface route to the
  document viewer, not the markdown editor.

---

## BUG-5: Cursor jumps to end of document when switching markdown tabs

**Component:** features/editor (ProseMirror buffer lifecycle) + reactors/tab
**Severity:** High
**Status:** Confirmed — selection is captured per tab but not applied when the
buffer is recreated on switch.

**Evidence (the failure chain):**

1. On switch to a *different* note the restore policy is `"reuse_cache"`:
   `src/lib/reactors/editor_sync.reactor.svelte.ts:20-25`
   (`open_note_id !== last_note_id → "reuse_cache"`).
2. In `src/lib/features/editor/adapters/prosemirror_adapter.ts:956-1001`, when the
   buffer is rebuilt and is **not** in cache, a fresh `EditorState.create()` is
   built. `previous_selection` is only populated for the `"fresh"` policy
   (~`:898-901`), so under `"reuse_cache"` it is always undefined → no
   `state_config.selection` → **ProseMirror defaults to `Selection.atEnd`**
   (cursor at document end).
3. The reactor *does* try to restore from the per-tab snapshot, but the guard is
   wrong: `editor_sync.reactor.svelte.ts:78` requires
   `pending.markdown_cursor_offset > 0`, so a saved cursor at offset `0`
   (document start) is never restored. More importantly the restore runs *after*
   the buffer is created at end, racing the default.
4. Snapshot plumbing is otherwise present: capture in
   `tab_action_helpers.ts:95-131` (`scroll_top`, `cursor`, `cursor_offset`,
   `markdown_cursor_offset`), and `open_active_tab_note()` at `:133-179` sets
   `pending_cursor_restore` (`:152-156`) — so the data exists; it just is not
   applied at buffer-construction time.

**Root cause:** per-tab selection is saved but **not threaded into
`EditorState.create()` on the `reuse_cache` path**; the buffer is therefore born
with the cursor at the end, and the after-the-fact restore is both guarded out at
offset 0 and ordered after the default.

**Fix plan:**

1. In `prosemirror_adapter.ts:956-1001`, when rebuilding a buffer, apply the saved
   selection regardless of policy: if a snapshot/`pending_cursor_restore` offset
   is available for this path, build the `TextSelection` (clamped to
   `doc.content.size`, as the existing `"fresh"` branch already does) and pass it
   as `state_config.selection` **before** `EditorState.create()`. This makes the
   buffer open at the right place instead of the end, eliminating the race.
2. Fix the guard at `editor_sync.reactor.svelte.ts:78`: `> 0` → `>= 0` so a saved
   document-start cursor restores.
3. Prefer constructing with the correct selection (step 1) over post-hoc
   `set_cursor_from_markdown_offset` so there is no visible jump-then-correct.
   Keep the post-hoc path as a fallback only.
4. Confirm `scroll_top` is likewise restored from the snapshot (it is set via
   `services.editor.set_scroll_top()` in `open_active_tab_note`) and is not
   clobbered by the end-positioned selection scrolling into view.

**Files to change:**

- `src/lib/features/editor/adapters/prosemirror_adapter.ts` (apply selection on `reuse_cache` buffer build)
- `src/lib/reactors/editor_sync.reactor.svelte.ts` (`>= 0` guard; ordering)
- possibly `src/lib/features/tab/.../tab_action_helpers.ts` if snapshot needs threading into the buffer-open call

**Tests:**

- Adapter unit (fake `EditorView`): opening a buffer with a saved selection at
  offset N lands the cursor at N, not at `doc.content.size`; offset 0 restores to
  start.
- Reactor/integration: A→B→A tab cycle preserves A's cursor and scroll.

---

## BUG-6: PDF unicode/glyph extraction panics → empty body

**Component:** features/search (text_extractor) — Rust backend, `pdf-extract` crate
**Severity:** Medium
**Status:** Confirmed — `pdf-extract` panics internally on unknown glyphs; the
panic is isolated (no app crash) but loses the **entire** document's text.

**Evidence:**

- Extraction entry: `src-tauri/src/features/search/text_extractor.rs:143-168`
  (`extract_pdf_text`) calls `pdf_extract::extract_text_from_mem_by_pages(&owned)`
  at `:148` inside a spawned `std::thread`, communicating via `mpsc`.
- Panic handling is **implicit**: there is no `catch_unwind`. When `pdf-extract`
  panics inside the worker thread, the thread dies, the channel disconnects, and
  `:156` maps `RecvTimeoutError::Disconnected → "extraction worker panicked"`.
  `extract_content` catches the `Err` at `:94-96` and yields an empty body;
  `db.rs:2113-2115` logs "PDF extraction empty."
- The panic itself is library-internal: `pdf-extract-0.10.0/src/lib.rs:1802:51`
  unwraps on an unknown glyph name (`.notdef`, `uni2913`, ligatures `ff/ffi/ffl`).
  The `[WARN] Unicode mismatch ...` lines are pre-panic logging, not the failure.
- Dependency: `src-tauri/Cargo.toml` → `pdf-extract = "0.10.0"` (crates.io, **no
  `[patch]`** — only `wry` is patched today; the repo already vendors a patch via
  `.tmpfiles/wry-upstream`, so the patch pattern is established).
- A second extraction path exists for references:
  `src-tauri/src/features/reference/linked_source.rs:240-276`
  (`run_extract_pdf_text`, run as a **subprocess** via `--extract-pdf-text`,
  `:191-238`). Prior related fix: commit `3a5d8049` stripped NUL bytes
  (`linked_source.rs:263`) — addresses NUL artifacts, **not** this glyph panic.
- No fallback extractor (pdfium/poppler/mutool/OCR) is currently wired.

**Root cause:** `extract_text_from_mem_by_pages` processes the whole document in
one call; a single unmappable glyph panics the call and the current thread
isolation throws away *all* pages, not just the offending one.

**Fix options (recommended order):**

1. **Per-page salvage (primary).** Replace the single whole-doc call with a loop
   that extracts page-by-page, wrapping each page in
   `std::panic::catch_unwind(AssertUnwindSafe(...))`, so one bad glyph drops one
   page instead of the document. Requires confirming `pdf-extract 0.10`'s
   per-page API (`Document::load_mem` + page iteration, or whatever lower-level
   surface backs `..._by_pages`). Keep the existing thread/timeout isolation
   around the loop. Also install a scoped panic hook (or use `catch_unwind`'s
   captured payload) so the per-page panic does not spam the default panic
   logger. **Highest value / lowest blast radius.**
2. **Patch the crate (reliable fallback if no clean per-page API).** Vendor
   `pdf-extract` under `[patch.crates-io]` (same mechanism the repo uses for
   `wry`) and replace the unknown-glyph `unwrap`/panic at `lib.rs:1802` with a
   `U+FFFD` substitution or skip. Reliable and total, but adds maintenance.
3. **Upgrade `pdf-extract`.** Check whether a version > 0.10.0 already handles
   unknown glyphs gracefully; cheap if so, but verify no API breakage.
4. **Alternative extractor fallback (heavy).** Wire `pdfium-render` (or similar)
   as a fallback when `pdf-extract` yields empty/panics. The subprocess isolation
   in `linked_source.rs:191-238` is a ready harness, but this is a large new
   dependency — only if 1–3 prove insufficient.

**Recommendation:** Do **(1)** now (salvages partial text immediately, no new
deps), and spike **(3)** in parallel; fall back to **(2)** if the per-page API is
absent or still panics.

**Files to change:**

- `src-tauri/src/features/search/text_extractor.rs` (per-page loop + `catch_unwind`)
- possibly `src-tauri/src/features/reference/linked_source.rs` (mirror the resilience in the subprocess path)
- `src-tauri/Cargo.toml` + `[patch.crates-io]` if option (2)/(3) is taken

**Tests:**

- Rust unit/integration: feed a fixture PDF with a known unmappable glyph (the
  reported `NCSA Delta Cluster Access.pdf` class — AvantGarde/STIX fonts) and
  assert extraction returns the salvageable text (non-empty) rather than empty.
- Assert a panic in one page does not abort the remaining pages.

---

## Cross-cutting notes

- **BUG-4 is the structural lesson:** "open a path" should make the
  markdown-vs-document decision in exactly one place. Centralizing in `note_open`
  fixes the report and prevents the next 25 surfaces from reintroducing it. After
  this lands, consider a lint/grep guard that flags new raw `note_open` calls on
  paths that could be non-markdown.
- **Validation gate (run before each commit, per `docs/architecture.md`):**
  `pnpm check`, `pnpm lint` (scope oxlint to touched files — whole-repo lint
  OOMs), `pnpm test`, `cd src-tauri && cargo check`, `pnpm format`. Do **not** run
  bare `cargo fmt` (committed Rust is not fmt-clean; the gate is `cargo check`).
- **Sequencing:** 4 and 5 are the high-severity, daily-friction items — do them
  first and commit each independently. 1+2 share a file and ship together. 3 is a
  quick clarity pass. 6 is backend-isolated.
