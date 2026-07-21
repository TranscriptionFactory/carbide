# carbide

## 2.17.1

### Patch Changes

- 81ebb1e: Quitting via the tray menu or Cmd+Q now prompts to save unsaved changes, matching the window close button. The post-update restart toast persists until dismissed instead of expiring after 30 seconds.

## 2.17.0

### Minor Changes

- ed66b43: Clip web page: new palette command fetches a URL, extracts readable content,
  and saves any combination of markdown note (default), HTML artifact, and EPUB.
  Images are downloaded into the vault (capped at 20, 5MB each) so clipped pages
  never need re-fetching; failed images keep their remote URL and are counted in
  the completion toast. Clipped notes and artifacts carry source/clipped-at
  provenance.

  Security: plugin HTTP fetch now re-validates every redirect hop (max 5)
  against SSRF rules, closing a redirect-to-private-address bypass, and blocks
  IPv6 ULA, link-local, and IPv4-mapped private addresses.

  Routing: omnibar results and graph nodes now open through the centralized
  note_open route, so non-markdown files consistently open in the document
  viewer from every entry point.

## 2.16.0

### Minor Changes

- f805018: Watcher: self-save suppression now keys on note path and covers the `.tmp`
  sibling of atomic writes, eliminating the save flicker, file-close lag, and
  save/close freezes caused by unsuppressed self-triggered reloads.

  Omnibar: Cmd+O no longer inherits a stale all-vaults scope from a previous
  Cmd+Shift+O session, and applying filters keeps vault groups expanded instead
  of bouncing back to vault selection.

  Editor: wikilinks with heading anchors (`[[note#Heading]]`) scroll to the
  target heading even when the note is already open.

  Graph: renderer teardown no longer races async worker, resize, and RAF
  callbacks (`t.geometry` / `_texturePool` unhandled errors).

  App: closing the window with unsaved changes now asks before quitting, the
  update-installed toast gains a Restart button, and pdf_extract glyph-mapping
  warnings are filtered out of logs.

## 2.15.0

### Minor Changes

- 0b22a16: Themes: culled to 5 kept blueprints with a migration fallback for removed
  themes; all 14 theme-\*.css files are deleted and kept themes are static
  `[data-theme]` blocks. New accent identity purple `#7e1dfb`, hand-tuned
  Carbide Light/Dark, and a lint-enforced token-only theme contract.

  Tokens: chrome type scale with density-wired sizes, canonical `--shadow-1..3`
  elevation scale with hairline seams, radius scale aligned to 4/6/8/12, and a
  motion budget (120–200ms micro-interactions, 1s ambient). Bundled Inter and
  IBM Plex Mono now render by default.

  Chrome: activity bar, tab bar, and editor status bar rebuilt (24px controls,
  density/indicator spec, Tolaria badge suite with compact mode); bottom panel
  rebuilt on shadcn Tabs with roving tabindex; context rail on 24px controls
  with hairline dividers; breadcrumb is a divider-free 28px row; the find bar
  floats as a popover overlay at the top-right of the editor.

  Layout: layout presets are independent of themes, panels render docked or
  overlay, zen-mode guards consolidated into a single `show_chrome` flag,
  sidebar views are registry-driven, and all pane sizes persist across restart.
  The right-panel exclusion is enforced and FloatingOutline is removed.

  Editor: Tab is trapped inside the hand-rolled overlays, the omnibar and slash
  menu ignore incidental mouse hover via an intentional-movement guard, empty
  states are uniform, and chrome text is no longer selectable by default.

  Outline: built off the keystroke path with idle debouncing and now resolves
  the real scroll container.

  Git: note-relative diff view toggle for the active tab, including a
  working-tree comparison mode.

### Patch Changes

- 1c2b23c: Tabs: closing the active tab no longer leaves a ghost note in the editor pane.
  With a split open, closing a primary tab now activates the most recent tab in
  the same pane (instead of hopping to the secondary pane by MRU), pane focus
  follows the tab that takes over, and when the last primary tab closes the
  primary editor clears instead of continuing to render the closed note.

## 2.14.1

### Patch Changes

- f8ee2e3: Git: remote failures now surface a real error message — git stderr is captured
  instead of dropped, and toasts fall back to a sensible message when the error
  string is empty.

  Editor: markdown that can't be converted is preserved as raw nodes instead of
  being silently dropped, callout dividers no longer fuse into setext headings,
  and raw_inline marks pass `undefined` rather than `null`.

## 2.14.0

### Minor Changes

- 6c4a74f: Context rail: the right context rail is docked beside the editor instead of
  floating over it, and reopening the docked outline from the rail works again.

  Editor: per-note normal/wide width toggle persisted in frontmatter; session
  transitions are serialized and teardown is hardened against throwing destroys,
  fixing the duplicated toolbar left behind by an overlapping recreate_session
  via the lazy port.

  Outline: the docked outline is now the default with persisted pane width, and
  clicking a heading moves the active marker to the clicked heading.

  Explorer: dragging OS files onto the file tree imports them into the vault —
  Markdown becomes indexed notes with client-side uniquify, other files reuse the
  pasted-asset pipeline, folder rows target that folder, and per-file errors log
  and continue.

  Graph: inferred edges are shown by default and the vault-size cap is dropped.

  AI: the streaming CLI provider runs in the vault directory, and CLI prompt
  serialization no longer injects `<system>`/`<user>` role tags (with a
  regression guard test).

  Themes: all 28 confirmed theme-audit findings applied — statusbar fg/bg
  pairing, layout-variant scope prefixes, radius/size token fixes, and dead CSS
  archived.

## 2.13.0

### Minor Changes

- 040ca8d: Outline: docked mode renders the outline as a resizable pane beside the
  editor with persisted width; the active heading follows the editor cursor
  and scroll position, with the panel keeping the active item in view and
  heading clicks centering the target; level-aware typography, indent
  guides, truncation tooltips, and a sliding accent marker with
  aria-current; alt-click on a chevron folds the section in the editor;
  scroll-spy geometry recomputes on editor resize and content growth, and
  scroll-spy/navigation are suppressed in source mode where positions are
  meaningless.

  Editor: link and image toolbar buttons are functional — URL popover
  (Mod-k) with edit/remove for existing links, image insertion through the
  vault asset pipeline — and all toolbar buttons now reflect the caret's
  real block type and disable where commands can't apply, with
  platform-aware shortcut tooltips; the floating table toolbar tracks
  scroll/resize via floating-ui autoUpdate; suggest dropdowns no longer
  flash at the viewport origin on first open and defer until the cursor DOM
  is laid out; note embeds handle missing targets gracefully and heal when
  the target note is created.

  Links: insert-link buttons on backlinks, related notes, and RAG citations
  insert [[Title]] at the cursor; the context rail no longer closes when
  clicking into the editor.

  Query DSL: symbolic property operators (=, !=, >, <) now map to bases
  operators so range filters like created > "now()-15d" return results;
  builtin date properties and now() values appear in autocomplete.

  AI/RAG: inline AI stream errors preserve partial output and restore
  deleted selections, aborts propagate to the backend, and execution can't
  double-trigger; RAG retrieval limit and context token budget are real
  settings, and changing the embedding model triggers the promised clear
  and re-embed; RAG chat renders markdown with honest readiness and scope
  hints; MCP search states when semantic mode degraded to keyword-only,
  stops exposing inverted raw BM25 scores, and rescales the title boost so
  fusion ranks correctly.

  Search/indexing: embedding toggles actually gate per-save and batch
  embedding, changed-section invalidation runs unconditionally, status
  reports real worker activity, query paths never download models
  synchronously, and storage reconciles changed vectors after unclean
  exits; rebuild flows show visible progress, toasts, and busy states, with
  embedding progress mirrored into the status bar.

## 2.12.0

### Minor Changes

- 060e97b: Query DSL: grammar-aware autocomplete for the notes and task query DSLs —
  in query/base code blocks (scoped to their blocks only), the task panel
  textarea, and the query panel — plus visual query builders that emit DSL
  text, mounted behind panel/DSL-mode toggles, and an omni-query dialog with
  a Build query… command action.

  AI/RAG: indexing banner with readiness-aware placeholder and rotating
  example prompts, generating stage showing the provider name with a stop
  control, provider/stream errors normalized into readable messages, AI
  provider status badges with a Test button and tri-state CLI availability
  in settings, CLI resolution via a tilde/PATH/login-shell cascade, and
  current-note images now sent along on both chat surfaces.

  Graph: search-tuned forces with label-aware collision and real
  convergence, percentile-based zoom-to-fit on new snapshots with a legible
  initial view, label truncation, and an expand-graph toggle that collapses
  the result list.

  Editor: keyboard-accessible drag handle and insert button with snapped
  drop indicator, section-drag badge, and offscreen-handle culling; ghost
  placeholder hint on empty docs; scroll-jump and scroll-fighting fixes;
  table layout, callout title, and fold state persist through markdown; Tab
  moves between table cells; pasted images no longer overwrite existing
  assets.

  Accessibility and UI: polite live-region announcer wired to toasts and RAG
  progress, forced-colors and print media styles, themed caret, and
  keyboard-navigable omnibar vault headers.

  Build: CodeMirror chunk kept out of startup modulepreload, KaTeX fonts
  shipped woff2-only, git2 trimmed to no-default-features without vendored
  OpenSSL, and unused pdfkit/blob-stream/isomorphic-git dependencies
  dropped.

## 2.11.1

### Patch Changes

- 86d4d2e: Editor: `![[note]]` and `![[file.pdf]]` embeds now resolve their targets like wiki links (exact → case-insensitive → basename lookup), so transclusions load when the target lives in a subfolder or differs in casing.

## 2.11.0

### Minor Changes

- c1d7c13: Search: omnibar sort modes (relevance/name/recency) and kind filters
  (notes/commands/settings) on top of the existing file-type filters, with
  Kind and Sort rows in the filter overlay, mnemonics, and removable active
  chips; kind filters also apply to the empty-query MRU list.

  Fixes: code-block HTML previews render via the carbide-html: protocol
  instead of CSP-blocked srcdoc iframes, tab scroll position restores after
  the buffer swap instead of being clobbered by it, duplicate
  --editor-code-bg token no longer trips the settings token search, and
  macOS titlebar drags work over themes that reposition the workspace
  layout.

## 2.10.1

### Patch Changes

- 069688c: Fixing linked sources path resolution bug

## 2.10.0

### Minor Changes

- b293c48: Metadata & styling: inline frontmatter widget in the visual editor with
  key/value suggestion dropdowns; color/icon pickers with arbitrary-path
  frontmatter writes; folder notes carry color/icon metadata into tree and
  drill-down rows; color/icon styling from note row context menus; vault-wide
  tag color palette with persisted mapping and choosable tag-pill colors in
  visual mode; configurable callout type/color/collapse. AI: editing enabled
  for all editable documents in any view mode, with the AI command surfaced
  for document tabs. Shell: file explorer mode tabs renamed to
  Tree/Folders/Recents/Bases.

  Fixes: omnibar surfaces all sidebar views and blends commands into bare
  search, working context menus in Folders drill-down and Recents tabs, and
  dependency audit remediation (npm 43 → 1 low, cargo 8 → 0).

## 2.9.0

### Minor Changes

- 455de32: Layout & shell: resizable 2-pane editor split with direction toggle,
  persistence, and direction-aware drop-zone overlay; inbox recent-notes feed
  with view switcher and Views/Types rail sections (live counts) folded into a
  Bases mode tab; configurable activity bar and sidebar views with
  command-palette access; status-bar quick-access icons for bottom panel tabs;
  overlay titlebar with native vibrancy for glass themes and an always-present
  macOS drag strip. Editor: "+" drag-handle button opening a block-type
  dropdown, warm-neutral curated palette, typography-as-data spec, OK-easing
  motion with AI-state indicators, and persisted HNSW search graph that skips
  the 33s startup rebuild.

  Fixes: window dragging and top-bar click regressions, dashboard/theater rails
  and inbox virtualizer under the macOS drag strip, secondary split pane
  receiving note content, bases sort keeping property-less notes at the end,
  create-type input and hidden-type visibility, block-insert dropdown scroll
  fighting hover, restored heading-level gutter markers, and reverted table
  engine/edge-control regressions.

## 2.8.0

### Minor Changes

- 69a8664: Editor: rich block support (web embeds, video, iframe conversion), live preview
  panes for code blocks and the slash menu, code-fence metadata preserved through
  markdown round-trips, flat-grid table restyle with edge insert bars, table
  backspace selection/deletion, case-sensitive/whole-word find, reversible
  Backspace input rules, and stronger paste-as-markdown detection.

  Fixes: recursive folder list in the save-path picker, RAG scope-filter errors
  surfaced instead of silently widening, fuzzy @-palette re-ranking, tab-switch
  scroll jump, themed HTML embeds, callout fold-state persistence, and spurious
  backslash escapes on round-trip.

## 2.7.0

### Minor Changes

- 07bcdc9: Let live HTML load remote CDN dependencies at the networked trust tier, and harden vault search query routing and ranking.
  - Live HTML at the live+net trust tier now permits remote `https:` scripts and stylesheets (Tailwind, Chart.js, Google Fonts, and other CDN deps), matching that tier's existing `unsafe-eval` and `connect-src *` capability. The no-network live tier stays a real "runs code, cannot phone home" guarantee, `http:` is never added to `script-src`/`style-src`, and the iframe sandbox stays exactly `allow-scripts` (no `allow-same-origin`). The Rust and TypeScript CSP builders emit one canonical tier-aware policy, pinned by drift tests on both runtimes.
  - Search no longer routes plain-English queries (`in progress`, `with images`, `named entities`) through the structured query solver: structured mode is now gated on a form prefix (`notes`/`files`/`folders`), unambiguous value syntax (`#tag`, `/regex/`, `[[wikilink]]`, quoted strings, property operators), or `linked from`.
  - Suggestion ranking is consistent: `index_suggest` now negates BM25 scores unconditionally before its early return, so the exposed score no longer flips sign depending on how many FTS hits came back.
  - Search is faster and more correct: the last query embedding is cached to skip a redundant BERT pass, and the client-supplied result limit is forwarded through `index_search` instead of being dropped.

## 2.6.0

### Minor Changes

- 3b8a9c9: Add editable note properties and a CSV table viewer, and harden the vault search index against drift.
  - The properties rail is now fully editable: add, edit, and delete frontmatter properties with combobox key/value pickers whose fuzzy-ranked suggestions blend a curated Carbide field catalog with the keys and values already used across your vault. List-valued properties (keywords, aliases, etc.) render as chips instead of raw `["a","b"]` text and stay lists when edited. Edits write straight to the note's frontmatter.
  - `.csv` files now open in a sortable, virtualized table with click-to-copy cells instead of falling through to the plain-text editor.
  - Externally edited notes now re-embed automatically: every index sync (including the vault-open background sync) chases its work with an embed pass, so notes changed outside the app no longer keep stale vectors until an unrelated trigger fires.
  - Vector search no longer returns deleted or renamed notes — they are evicted from the in-memory HNSW indices on path sync instead of lingering until the next full rebuild — and changed content re-embeds via a content hash so edits actually update their vectors.
  - HNSW indices now compact once dead nodes pass a staleness threshold, reclaiming the space left by re-embeds that previously grew the graph unbounded until restart.
  - Search indexing is faster: larger per-transaction batches on full rebuild, `PRAGMA optimize` after rebuild/sync to keep the query planner sound as the vault grows, and a capped embedding yield to reclaim idle time.
  - Collapsible sections (callouts, collapsible blocks, and other nested wrappers) are preserved across save and tab-switch syncs instead of being unwrapped and hoisted out.
  - Bundled plugins now resolve correctly under Tauri's `_up_` resource prefix.

## 2.5.1

### Patch Changes

- b1a9c03: Fix six reported bugs across file opening, the editor, the search graph, the Related panel, and PDF indexing.
  - Non-markdown files (`.sh`, `.py`, `.txt`, etc.) opened from any panel — Related, backlinks, tags, query results, tasks, RAG citations, the tab bar, deep links, and ~20 other surfaces — now open in the code/text viewer with syntax highlighting instead of the markdown editor. PDFs, HTML, and EPUBs opened from those surfaces likewise route to their proper viewers.
  - Switching between markdown tabs now restores each tab's saved cursor position (including a cursor at the very start of the document) instead of jumping to the end.
  - Search-graph drill-down results now have a right-click menu (open, open to side, copy path, reveal in file manager, open in default app, find similar notes, focus node).
  - Search-graph results can be sorted ascending or descending — with a new alphabetical sort — and the sort choice persists with the graph tab alongside the other filters.
  - The "Similar notes" similarity badge is clearer: capped below 100% for non-identical notes, with a tooltip explaining it is the cosine similarity of note embeddings (1.0 = identical meaning).
  - A single unmappable glyph in a PDF no longer discards the entire document's text during indexing; extraction now salvages every readable page.

## 2.5.0

### Minor Changes

- 9448c8a: Add EPUB reading and make books findable in vault search.
  - New EPUB reader in the document viewer (vendored `foliate-js` engine): renders reflowable and fixed-layout books, with a table-of-contents sidebar, internal-link navigation, prev/next paging, an in-book search, a reading-progress indicator, and theme-following light/dark styling.
  - Reader preferences in Settings → Documents: reading mode (scrolled by default, or paginated), columns, text width, font size, and line spacing — applied live.
  - Resume-where-you-left-off: reading position persists per vault in `.carbide/reading_positions.json` (relative path → CFI) and is restored on reopen.
  - Security: book content renders in same-origin `blob:` iframes (required for pagination) with book JavaScript neutralized by a strict per-document CSP (`script-src 'none'`) and script resources blocked at load — the inverse of the trusted-HTML posture, by design.
  - Vault full-text search now indexes EPUBs (title + spine body text), so a phrase from a book surfaces in the omnibar, and `[label](book.epub)` links resolve as attachments — mirroring the existing HTML/PDF paths.

## 2.4.0

### Minor Changes

- 7e4b046: Add RAG-powered chat over the vault.
  - Unified scope picker (folders · tags · bases) with suggestion navigation and lazy loading
  - Deterministic query analysis: topic extraction plus date-range parsing, pushed into hybrid/block search as an mtime filter with scope over-fetch
  - Section-granular hybrid retrieval, query rewriting, @mention pinned context, and inline citations
  - Scope-aware prompt templates in the chat empty state
  - MCP `rag_query` and `rag_status` tools via the front-end event bridge
  - OpenAI-compatible API streaming with LM Studio and llama-server presets
  - Authored/discovered link split in the right rail, vault-wide "Recently edited", and a hover "Link" action that converts every unlinked mention of a note's title into a wiki-link
  - Smart blocks: unified insertion on the slash menu, and fixed a tasks-block XSS hole plus a reactivity gap

## 2.3.1

### Patch Changes

- e096889: ### Bug Fixes
  - **Search: rank verbatim multi-word phrases correctly**: A multi-word query was lowered to independent prefix-AND tokens (`name of the game` → `"name"* "of"* "the"* "game"*`), with no phrase semantics. When every term is a common word each term's IDF collapses toward zero, bm25 goes flat across all matches, and the note containing the verbatim phrase ranked arbitrarily — often far down — below notes that merely repeated the words. Multi-term queries now OR an exact-phrase clause with the prefix-AND clause; the phrase carries real IDF and lifts verbatim matches to the top while the prefix-AND arm preserves recall when no exact phrase exists. Single-word queries are unchanged.
  - **Search: scope multi-word autocomplete to title/name/path**: `suggest()` built `{title name path} : "a"* "b"*`, but an FTS5 column filter binds only to the phrase that immediately follows it, so only the first term was column-restricted and trailing terms matched unrestricted columns including the body. Multi-word autocomplete (wiki-links, omnibar note-name completion) could therefore surface notes whose body — not title/name/path — contained the later terms. The term group is now parenthesized so the filter applies to every term.
  - **Search: preserve backend relevance order in the omnibar re-rank**: The omnibar re-rank overwrote each hit's backend (BM25 / hybrid) score with a title/name/path-only score, so within a match-kind bucket the backend relevance ordering was discarded and dropped from the emitted score. The backend's best-first ordering is now threaded through as a normalized relevance signal and folded into the omnibar score, so results stay ordered by relevance within each bucket while match-kind and recency continue to dominate.

## 2.3.0

### Minor Changes

- 8aacfa6: ### Features
  - **Menu-bar tray icon + close-to-hide (headless-capable MCP)**: Carbide can now keep running with its window closed, reachable from a macOS menu-bar icon, so the in-process MCP server on `:3457` and the `carbide mcp` CLI stay live without an open window. Gated behind a new `app.closeToTray` setting (default off, preserving today's close=quit behavior). The tray menu shows the MCP server status, a **"Keep running in menu bar"** checkbox that persists the flag, **Show Carbide**, and **Quit Carbide**. With the flag on, the window close button hides the window instead of exiting; Cmd+Q / Quit still exit fully. The dock icon is retained. Settings service gains sync `set_setting_value`/`get_setting_value` cores plus a pure, unit-tested `read_bool` helper so the tray handler persists without an async runtime.

## 2.2.2

### Patch Changes

- ebb511a: ### Fixes
  - **Inline AI replaces the selection (BUG-1)**: `start_stream` now deletes the active selection in the same transaction before anchoring the AI range, so generated text replaces the selection instead of being shoved beside it. The pristine pre-AI document is snapshotted once on `open` (survives retries), and a first-class `retry` action deletes the previous AI range and re-streams the cached prompt rather than firing an unknown `"retry"` command id — fixing both "Try again" appending a second generation and reject-after-retry failing to restore the original doc.
  - **Terminal Option+Arrow word motion (BUG-3)**: removed `macOptionIsMeta:true` so xterm.js emits the standard escape sequences that default zsh/bash readline bindings recognise, restoring word-by-word cursor movement.
  - **Drill-down file explorer context menu (BUG-4)**: drill-down rows are now wrapped in `ContextMenu.Root` with star / copy-path / open-to-side / reveal / rename / delete actions, mirroring the tree-row affordances via the same optional callback props.
  - **Linked source resolution by existence, portable anchors first (BUG-5)**: resolution preferred the absolute `external_file_path` recorded on the indexing machine over the portable anchors, so on a second machine the stale path made sources look missing. `resolve_linked_path` (scan relocation) now prefers vault-relative then home-relative anchors and treats `external_file_path` as a cache hint; the Rust open/preview resolver builds candidates in portability order and returns the first that exists on disk, falling back to the most-portable candidate. `linked_source_list_files` is bounded by a 5s timeout so an unreachable mount returns promptly, and a new "Refresh sources" action re-validates and rescans on demand.
  - **Task-query embed shows the leaf section, full path on hover (BUG-6)**: the embed renderer no longer sets the full slash-joined ancestry as visible text; section labels are centralised through `leaf_of_section` / `full_section_path` so embed and the Svelte component both show the leaf with the full path in the `title` attribute.
  - **HTML document scroll persists across tab switches (BUG-7)**: added `initial_scroll_top` / `on_scroll_change` plumbing to `html_viewer.svelte` and `html_live_renderer.svelte`. The safe viewer reads/writes scroll via `contentDocument.scrollingElement` with a debounce; the document content wrapper passes through `viewer_state.scroll_top`, matching the existing code/csv viewer pattern.
  - **Problems panel severity filter (BUG-8)**: replaced the binary log/diagnostics toggle with two orthogonal axes — Stream (all / diagnostics / logs) and Severity (all / error / warning / info / hint / debug / trace). The pure filter/merge logic is extracted into `problems_panel_filter.ts` for direct unit testing; "all" merges both streams sorted by timestamp.
  - **Tag palette fuzzy/hierarchical matching (BUG-9)**: `handle_tag_suggest_query` and `handle_at_palette_tag_query` now use `rank_tags` from `tag_matcher` instead of `startsWith`, so hierarchical, substring, and fuzzy scoring apply to both palettes and ranked order is preserved.

## 2.2.1

### Patch Changes

- fb0e7e1: ### Features
  - **`@` palette prefix legend**: the `@` command palette now renders a compact legend above the dropdown listing the active prefixes (`#tag`, `[[note]]`, `>cmd`, etc.) so the available routes are discoverable without memorising them. Lives entirely in `at_palette_plugin.ts` + `editor.css`.
  - **Task list: truncated section labels with full path on hover**: `task_list_item.svelte` now shows only the leaf segment of a heading-stack section (`Subproject B` instead of `Project A/Subproject B`) and exposes the full ancestry in a native `title` tooltip. Keeps the list scannable for deeply-nested headings.

  ### Performance
  - **Embeddings: f16 weights on Metal + larger batches**: `features/search/embeddings.rs` and `service.rs` load model weights as f16 on Metal devices, run pooling and L2 normalisation on the CPU side, and bump the encode batch size from 16 → 32. Measurable speedup for vault-wide re-embeds without changing output semantics.

  ### Fixes
  - **Editor: `is_canvas_tab` guard survives the minifier**: rewrote the helper in `note_editor.svelte` so the production minifier no longer strips the parens that gated tab-type detection, preventing canvas tabs from being treated as note tabs after a release build.
  - **Editor: `active_tab` no longer crashes on transient null**: the deriveds in `note_editor.svelte` that consume `active_tab` now guard against the brief null between `workspace.close_tab` and the next render, fixing the intermittent "Cannot read properties of null" crash when closing the last tab.
  - **Vite: unstick override that pinned the workspace to v6**: removed the stale `pnpm.overrides` entry that held `vite` at v6 across the workspace and blocked the v8 upgrade. Drops ~50 transitive duplicates from the lockfile.

  ### Dependencies
  - **Tauri 2.10 → 2.11** with a re-vendored `wry` 0.55.1 patch under `src-tauri/patches/wry-0.55.1/` (replaces the old 0.54.4 patch). `@tauri-apps/*` npm packages aligned to match the Rust side.
  - **Vite 8, Vitest 4, TypeScript 6, Svelte plugins 7** (wave 2). Test helpers (`svelte_client_runtime.ts`, plugin RPC tests, `link_repair_fixture.test.ts`) updated for the new APIs.
  - **`pdfjs-dist` 4.10 → 6.0** (wave 4) with `pdf_viewer.svelte` and `file_embed_view_plugin.ts` updated for the new worker entrypoint.
  - **`@lucide/svelte` + `lucide-static` 0.56 → 1.17** (wave 3); the old per-icon import workaround in `vite.config.ts` is no longer needed.
  - **Wave 1 minor/patch npm bumps** across the workspace, plus `pnpm.overrides` moved from `package.json` to `pnpm-workspace.yaml` to satisfy pnpm 10's new placement rule.

  ### Dev / DX
  - **Error handler logs origin object**: the global error/rejection handler in `+layout.svelte` now also calls `console.error` with the original error (in addition to the throttled toast) so a devtools-attached build sees the full stack and cause chain.
  - **`tauri.conf.json` formatted**: Prettier-style single-line arrays + trailing newline; no behaviour change.

## 2.2.0

### Minor Changes

- 116a44c: ### Features
  - **File explorer UX overhaul (Phase 1 + 2)**: a coordinated pass on the sidebar / editor relationship driven by `carbide/plans/2026-05-29_file_explorer_ux_improvements.md`.
    - **Path breadcrumb above the editor**: renders `vault → ancestor folders → current note` whenever a note is open. Ancestor clicks reveal the folder in the file tree (expand path, select, switch sidebar to explorer); the trailing note segment re-reveals the active note. New `filetree_reveal_folder` action mirrors `filetree_reveal_note` for folder targets.
    - **Finder-style drill-down explorer mode**: `DrillDownFileTree` renders one folder at a time with an "up" row and single-click activation. A new `filetree.toggle_mode` action flips between the tree and drill-down views in the explorer header; the choice persists via the existing `EditorSettings.file_tree_mode` field. Navigation reuses `filetree_reveal_folder` so the breadcrumb works as ancestor nav.
    - **Files / Views sub-tabs in the sidebar**: the explorer pane now has a Files tab (the existing virtualized tree) and a Views tab that lists the vault's saved bases views (`.carbide/bases/*.json`). Clicking a view loads it and switches the sidebar to the bases panel. New `ui.explorer_subtab` UIStore state and `ui.select_explorer_subtab` action wire it up; `dispatches bases_list_views` when switching to Views.
    - **Folder-note click-through**: single-clicking a folder in either tree or drill-down mode now opens the matching folder note (`folder/<basename>.md`) when one exists, gated to the expand transition so a collapse no longer steals tab focus. Uses the same same-name convention enforced by link resolution.
    - **Hover-peek preview in drill-down view**: `PeekTooltip` shows a small floating popover (title + path + blurb) after 500 ms hover, reusing `NoteMeta.blurb` so the feature requires no I/O. Wired into `DrillDownFileTree` for v1.
    - **Drag-and-drop wikilink insertion**: dragging a markdown file from the tree onto the editor now inserts `[[basename]]` via the new `build_wiki_link` helper. Non-markdown paths still produce the existing relative file links; mixed drops produce a mix.
    - **Cmd+P pre-fill from the focused folder**: when the omnibar opens with an empty query and focus is inside a `[data-vim-nav-region="file_tree"]` subtree, it pre-fills the query with the selected folder path (suffixed with `/`) and immediately runs the prefixed search.
  - **Bases: tree view mode + group_by config**: new `tree` `ViewMode` that nests rows under multi-level grouping by property values (e.g. `["tags", "status"]`). Empty `group_by` falls back to a flat row list so the mode is always usable. Rust `BaseViewDefinition` now persists kanban / calendar / tree configs; previously kanban/calendar were silently dropped on save round-trip.
  - **Bases: default saved views seeded on first vault open**: new `bases_seed_default_views` Tauri command writes six default views (By Tag, By Created Month, By Status, Modified This Week, Orphan Notes, Smart Archive) to `.carbide/bases/`. A `.carbide/bases/.seeded` sentinel prevents re-seeding. Seeds requiring a frontmatter property are skipped when that property isn't present in the vault.
  - **Context rail: Related tab with siblings + tag chips**: new `RelatedPanel` surfaces (1) recent notes in the current folder, (2) siblings of the open note (same parent folder), and (3) shared-tag chips. Clicking a tag chip pivots the sidebar to bases with a tag filter applied. Added as a fourth tab on the existing `ContextRail` (Compass icon).

  ### Fixes
  - **Refresh button now rescans the filesystem**: the sidebar refresh action invalidated UI-side state and reloaded every previously-expanded folder, but the Rust folder-listing cache (30s TTL) returned stale entries within that window, so files added or removed externally weren't picked up. New `clear_folder_cache(vault_id)` Tauri command drops every cache entry for the vault, and runs at the start of `folder_refresh_tree` before the per-folder reloads.
  - **Bases `now()` / `mtime` filters wired up**: the default "Modified This Week" and "Smart Archive" views were dead because `now()-Nd` values were never substituted and `modified` / `accessed` were read as frontmatter props. `query_bases` now resolves `now()` / `now()-Nd` to epoch-ms and maps `modified→mtime_ms`, `created→ctime_ms`, `accessed→mtime_ms` (accessed is a mtime proxy; no atime tracked). Both seeds are ungated so they return rows; Orphan Notes stays gated until `backlink_count` becomes a computed column.

  ### Notes
  - Includes the `2026-05-29_file_explorer_ux_improvements.md` planning doc that scoped Phase 1 + 2 of this work.

## 2.1.0

### Minor Changes

- 58f00d7: ### Features
  - **HTML Live mode via `carbide-html:` custom scheme**: Live-mode iframes now load through a dedicated Tauri URI scheme (`src-tauri/src/shared/live_html.rs`) instead of `blob:` or `data:` URLs. The handler resolves trust per request, streams the doc bytes with a tight CSP, and serves vault-relative asset requests (images, fonts, stylesheets sitting next to the HTML file) from the doc's folder. The meta CSP in the served HTML is kept in sync with the response-header CSP so the page works under both. The status bar grew a trust indicator that opens the new Trust panel (`trust_panel_content.svelte`) for revoking per-file / per-folder grants without leaving the editor.
  - **Mermaid + KaTeX pre-rendering in HTML Live mode**: `html_live_prerender.ts` walks the HTML AST and pre-renders `<pre><code class="language-mermaid">` blocks and `$…$` / `$$…$$` math nodes server-side, so Live-mode HTML matches markdown rendering even when the doc author did not ship a script tag for either. `mermaid_prerender.ts` runs Mermaid through the existing render path and inlines the SVG; KaTeX is rendered to static HTML with the standard fonts. Both are covered by unit tests in `tests/unit/domain/html_live_prerender.test.ts`.
  - **AI assistant + edit dialog now understand HTML documents**: The assistant panel and edit dialog pick up the active HTML document's title, body text, and selection context, so "summarize this", "extract the action items", and inline edit prompts work on HTML files just like markdown notes. `ai_prompt_builder.ts` gained an HTML-aware path; `ai_service`, `ai_actions`, `ai_store`, and the dialog UI route through it. Source-mode AI editing is documented in `docs/html_artifacts.md`.

  ### Fixes
  - **Live-mode iframe lifecycle hardening**: `SandboxedIframe` no longer applies a default `csp` attr (the response-header CSP is authoritative). `drop_guard.ts` ensures Live-mode iframes detach cleanly when the workspace tears down, preventing the lingering window references that surfaced during tab close and panel resize. Covered by `tests/unit/utils/drop_guard.test.ts`.
  - **Live-mode CSP alignment**: The meta CSP injected into served HTML now mirrors the `live_html.rs` response-header CSP exactly, so DOM-level resource loads (images, fonts) succeed under the same policy that the browser enforces from the header.

  ### Notes
  - Includes the `2026-05-29_html_doc_parity_plan.md` planning doc that scoped the mermaid / KaTeX / asset-resolution work, plus a lint + format pass over the HTML parity changes.

## 2.0.0

### Major Changes

- dff4cf3: ### Features
  - **HTML artifacts as first-class vault citizens**: HTML files now reach full parity with PDFs across indexing, rendering, and embedding.
    - `FileCategory::Html` split from `Code`; `.html`/`.htm` classified as attachments on both sides (`ATTACHMENT_EXT_RE`, `ATTACHMENT_EXTENSIONS`) so markdown links create attachment edges instead of phantom outlinks.
    - New `scraper`-based HTML extractor walks the DOM, skips `script`/`style`/`noscript`/`template`, normalizes whitespace, and pulls `title` (or first `h1`) into `meta.title`. FTS now sees visible text instead of class names and inline JS.
    - Three render modes — **Source / Safe / Live** — with per-file / per-folder trust grants persisted under `.carbide/trusted_html.json`. Default-deny: the trust dialog never appears unless the user explicitly clicks Live.
    - `![[file.html]]` transclusion renders inline as a sandboxed Safe-mode iframe (sanitized + no scripts, regardless of the file's own trust level); the existing "Open in tab" affordance is the path to Live mode. `parse_embed_fragment` now returns `{page, height, params}`; `file_embed` schema gained a `params` attr with JSON DOM round-trip. Vault-relative `src`/`href`/`poster` resolved against the embedder's directory; safe-embed CSP allows `carbide-asset:` while keeping `connect-src 'none'`.
    - New `document.paste_html_artifact` action reads HTML from the clipboard, derives a slugged+timestamped filename, writes the file and a `.meta.json` sidecar in the open note's folder, and inserts a `![[…]]` transclusion at the cursor.
    - Provenance banner above the HTML renderer (fed by `DocumentStore.provenance` map and `DocumentService.refresh_provenance`); ✕ button runs `document.clear_provenance`, deleting the sidecar via a new `DocumentPort.delete_file` method wired through the Tauri `delete_vault_file` command.
    - Full documentation in `docs/html_artifacts.md` covering render modes, trust grants, transclusion, paste-from-clipboard, the provenance banner, theme variables, FTS, the security envelope, and known limitations.
  - **Omnibar ranking overhaul with recency boost**: The omnibar scoring rule is now a constant table (`OMNIBAR_SCORES`: exact_prefix 1.0 > substring 0.6 > fuzzy 0.3 + recency boost capped at 0.3) applied to every note-producing branch (structured query / hybrid / FTS) via `rank_notes`. `NotesStore` tracks per-note access timestamps in a 24h sliding window (max 16 ts/note). New `find_notes_by_name(vault_id, query, limit)` Tauri command does a bounded vault walk used as a fallback (100ms timeout) so newly created notes that miss the index still resolve.
  - **Hierarchical heading scoping in task queries**: `extract_tasks` now maintains a heading stack indexed by depth; each task's section is stored as slash-joined ancestry (`Project A/Subproject B`) instead of just the nearest heading. New `section under <heading>` operator translates to `(section = ? OR section LIKE 'value/%')`, finding tasks at the heading and every descendant. `section is <heading>` aliases exact match. `include_subheadings:false` keyword opts out.
  - **Fuzzy + hierarchical tag search**: `score_tag` scores by `max(hierarchical, substring, fuzzy)` — `#parent` matches `#parent/child` at 1.0; substring at 0.6; fuzzy normalized to ≤ 0.95 so it never beats a literal hierarchical hit. `query_solver.resolve_with` falls back to `list_all_tags` + top-5 fuzzy when prefix lookup misses, so typos like `with #prjects` still surface `#projects/carbide` notes.
  - **`search_headings` primitive**: New `search_db::search_headings(conn, query, limit)` streams `note_headings`, rebuilds per-note hierarchy stacks inline, and scores headings by the omnibar rule. Returns `HeadingMatch { note_path, level, text, line, heading_path, score }`. Exposed via Tauri command, `SearchPort`, and `SearchService.search_headings_matching` for plugins/callers.
  - **Transclusion edit-in-place**: New Pencil button on the `note_embed` toolbar (between collapse and open-in-tab) converts the rendered embed back into editable `![[display_src` text without the closing `]]` so the embed plugin's `appendTransaction` does not immediately re-render. The wiki_suggest dropdown reactivates because `is_embed` is detected from the leading `!`. `build_embed_edit_transaction` is a pure helper covering display_src round-trip, heading-fragment preservation (`folder/note#Heading`), and src→display_src fallback.
  - **PDF extraction cache**: Content-addressed cache (`reference::scan_cache::ScanCache`) keyed on blake3 of the file bytes. Cache hits skip the PDF subprocess and `lopdf` metadata pass entirely; `file_path` and `modified_at` re-derived from the live file so cached results survive renames. Cache lives under `~/.carbide/linked_source_cache/` with a `schema_version` field.

  ### Fixes
  - **`code_lsp` PATH lookups memoized**: cached via `LazyLock<Mutex<HashMap>>`; spawn gated on `code_lsp.enabled` / `code_lsp.languages` from settings. One `warn` per missing server instead of an INFO loop every second.
  - **Save-As drill-down**: Untrack the query read in `folder_suggest_input.svelte` so the trailing slash and live typing aren't stomped by the value→query mirror; `ArrowRight` now drills into the highlighted folder.
  - **Tab close hardening**: `clear_open_note` resets `split_view`; `close_tab_immediate` flushes the editor when closing the active tab, draining pending mode-transition syncs before teardown.
  - **Link repair on MCP/CLI move and rename**: Extracted `repair_links_for()` as the canonical helper used by both `rename_note_and_update_links` and the reworked `move_note`. Move now detects folder vs file via metadata, walks the destination to build a per-child `path_map`, and reports `updated_links` over `cli_move` + `cli_rename` JSON responses. `repair_links_for` `index_upserts` each new path before querying backlinks, encoding the writes-complete-first/reads-fall-back policy documented in `shared_ops` module docs.
  - **PDF extraction observability**: `warn!(path, cause)` on both the in-process indexer path (`search::text_extractor::extract_content`) and the subprocess-isolated linked-source path (`reference::linked_source::extract_pdf`) — previously `unwrap_or_default()` swallowed errors silently. The in-process `recv_timeout` now distinguishes timeout (parser slow) from disconnect (worker panicked). Added per-stage `Instant` timing around `extract_pdf` (meta/text/ids phases).
  - **`create_note` timing audit**: Per-phase debug timing (resolve / pre_write / write / total, plus bytes) added to the MCP `create_note` path so future slow reports have actionable data. End-to-end audit confirmed no synchronous reindex, contended lock, or embedding call on the write path.
  - **Task attr consistency across navigate-away-and-back**: In-editor task creation now sets `task_status="todo"` alongside `checked=false` (`block_transforms.ts` × 2 sites, the `wrap_as_todo` loop, and `slash_command_plugin.ts make_todo_insert`). Previously, a freshly created `[ ]` task had `{checked: false, task_status: null}` while the mdast→pm parse path set `{checked: false, task_status: "todo"}` for the same syntax — so the same task clicked behaved differently before vs. after a navigate-away-and-back. Both paths now produce matching attrs.
  - **Comment regex tightened in task query parser**: `(?:^|\s)#\s` so `section under #Heading` parses correctly (the leading `#` is no longer eaten as a comment marker).

  ### Notes
  - Source-mode editor keeps LSP completion; wiki/tag/at-palette syntax completion in source mode is a documented gap (lifting the PM suggest factory to CodeMirror primitives would duplicate suggest orchestration; the resolved bias is the LSP fallback).
  - A shared link-repair parity fixture at `tests/fixtures/link_repair_cases.json` drives matching tests on both the Rust (`search_service::rewrite_note_links`) and TS (`LinkRepairService`) sides; markdown-link rewriting is pinned as a documented gap so a future fix updates both suites in lockstep.

## 1.44.3

### Patch Changes

- 9b184b8: ### Fixes
  - **Inline code (and other inline marks) did not terminate after the closing delimiter**: After commit `04337ff7` made `code_inline`, `strikethrough`, and `highlight` inclusive (so they can be extended by typing inside the marked range), typing `` `foo` `` via the input rule left the code mark as a stored mark at the cursor. The next typed character was then absorbed into the inline code run, and the same applied to bold/italic/highlight. The four inline-mark input rules now call `tr.removeStoredMark(mark_type)` after applying the mark, so subsequent typing produces plain text. Extending an existing mark by positioning the cursor inside it still works, and the existing `ArrowRight` escape behavior is unchanged.

## 1.44.2

### Patch Changes

- a4f4348: ### Fixes
  - **Image markdown collapses surrounding linebreaks**: Inserting a canonical `![alt](url)` image (and subsequently switching between source/visual or saving) collapsed every block in the document onto one line. The `image-block` ProseMirror node was being serialized as a top-level mdast `image` (phrasing) node, which is malformed at block level — `remark-stringify` dropped the blank lines between every sibling. `pm_to_mdast` now wraps the image in a `paragraph` mdast node so adjacent blocks keep their separators.
  - **Images do not render in exported PDFs**: The hidden export webview loads from `pdfexport://localhost/` with a strict CSP, so `carbide-asset://` URLs, relative paths, `file://` paths, and remote URLs were all blocked. `render_note_to_html` now accepts an optional `image_resolver` callback, pre-resolves every image src (canonical `![alt](path)`, wiki-embed `![[image.png]]`, absolute paths, and `http(s)` URLs) to a data URI, and inlines them into the HTML before printing. Wiki-embeds whose target is not an image extension are left untouched. Failed loads render a faint placeholder with the alt text so the document flow stays intact.

## 1.44.1

### Patch Changes

- 9d4f012: ### Fixes
  - **PDF export build (Linux/Windows)**: Fixed Rust compile errors in `src-tauri/src/features/export/mod.rs` that broke the v1.44.0 release pipeline. Corrected the `webkit2gtk` trait import path (the crate has no `prelude` module) and dropped a vestigial `gtk::prelude::PrintSettingsExt` import since `PrintSettings::set` is inherent. On Windows, dropped a `BOOL::as_bool()` call now that `webview2-com`'s `PrintToPdfCompletedHandler` passes a plain `bool`.

## 1.44.0

### Minor Changes

- a63b16e: ### Features
  - **Note PDF export rework**: Replaced the old in-app PDF engine with a self-contained HTML renderer plus a `PdfExportPort`/Tauri adapter and an `export_html_to_pdf` command that captures HTML to PDF natively on macOS, Windows, and Linux. Export now routes through `DocumentService`, with mermaid diagrams, math fences (rendered as centered italic text with inline KaTeX CSS), and SVG-to-PNG rasterization supported.
  - **Plugin management**: Added marketplace update support and plugin uninstall, plus an `md-export` PDF plugin.

  ### Fixes
  - **macOS PDF export**: Paginate output via `NSPrintOperation` and avoid the WKWebView print deadlock by running `runOperationModalForWindow` asynchronously.
  - **Plugin install**: Allow subdirectory paths in plugin filenames during install, and use camelCase `downloadUrl` to match the Rust serde `rename_all` casing.
  - **Rendering**: Fixed h1 underline position and full-width HR in the plugin.
  - **UI**: Made toast text selectable.

## 1.43.1

### Patch Changes

- b98b7b9: Fix markdown links with alt text (e.g. `[text](path/to/note.md)`) resolving incorrectly in nested folders. They were using vault-global lookup like wikilinks instead of resolving relative to the current file per standard markdown semantics.

## 1.43.0

### Minor Changes

- a9260cf: Add frontmatter command with ensure_frontmatter CLI/MCP route (TS + Rust), fix Cmd+Click for block selection with Shift+Click restored for text selection, add user-select: none to non-editable editor chrome elements, and fix partial details/callout node handling during clipboard serialization.

## 1.42.0

### Minor Changes

- f84d72f: ### Features
  - **Search graph multi-select and filtering**: Cmd/Ctrl+click to toggle individual node selection, Shift+click for range selection. Added toolbar controls for hiding neighbor nodes and filtering by minimum score threshold. Canvas export respects multi-selection.

  ### Fixes
  - **Mermaid fullscreen close controls**: Added floating toolbar with zoom, export, and close button to fullscreen mermaid view. Escape key also exits fullscreen.
  - **Mermaid diagram drag and sizing**: Removed CSS transition during drag to eliminate lag/jitter, removed max-width constraint for natural SVG sizing, added vertical resize and fullscreen expand/collapse.
  - **Terminal WebGL error suppression**: Scoped error interceptor catches xterm WebGL addon errors from advanced escape sequences, disposes the addon (falling back to canvas), and prevents error toast spam.

## 1.41.0

### Minor Changes

- 2066035: ### Features
  - **Mermaid diagrams in slides export**: Mermaid code blocks are now rendered as diagrams when exporting to slides.
  - **Vault graph and neighborhood canvas exports in command palette**: Added commands to export vault graph and neighborhood canvas directly from the command palette.

  ### Fixes
  - **Mermaid SVG export uses Tauri save dialog**: Mermaid SVG export now uses the native Tauri save dialog instead of a browser download.
  - **Command palette caret and mermaid zoom/pan/export**: Fixed command palette caret positioning and mermaid diagram zoom, pan, and export interactions.
  - **Last list item bottom margin**: Removed extra bottom margin from the last paragraph in the last list item for cleaner spacing.

## 1.40.0

### Minor Changes

- c3883e9: ### Features
  - **Collapsible section in Turn Into menu**: Added collapsible grouping to the block Turn Into menu for better organization.
  - **Fuzzy matching in graph filter**: Graph filter now uses fuzzy matching for more forgiving node search.
  - **Continuous semantic neighbor scoring**: Semantic neighbor results use continuous similarity scoring instead of binary thresholds, improving relevance ranking.

  ### Fixes
  - **Hybrid search RRF merge**: Pure-vector hits are now included in the Reciprocal Rank Fusion merge, fixing cases where semantically relevant results were dropped.
  - **Task query view**: Fixed section display, optimistic toggle behavior, and doing state rendering in task query results.
  - **Round-trip doing task state**: The `[-]` (doing) task state now correctly round-trips through the editor without being lost or corrupted.

## 1.39.0

### Minor Changes

- af61593: ### Features
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

## 1.38.0

### Minor Changes

- b54d108: ### Features
  - **Boolean operator support for task queries**: Added `FilterExpr` type with AND/OR/NOT combinators for task filtering. Parentheses required after NOT to avoid clashing with `not done` keyword. Includes Rust unit tests for `build_filter_sql` and `FilterExpr` deserialization.
  - **Vault context for AI**: Added vault context types, settings, and prompt builder support. Wired vault context into AI service, actions, and UI. Added vault context settings UI controls with tests. Simplified vault context code for cleaner layering.

  ### Fixes
  - **Task SQL builder**: Added `starts_with` operator and fixed `readVaultFile` call.

## 1.37.1

### Patch Changes

- 2f690a7: ### Fixes
  - **Formatting marks now inclusive with universal escape**: Removed `inclusive: false` from code_inline, strikethrough, and highlight marks so users can extend them by typing at the boundary (matching bold/italic behavior). Updated mark escape plugin to escape from all user-facing formatting marks on ArrowRight.
  - **Prevent `.carbide/` folder creation in browse mode**: Added backend guards on Tauri write commands to reject writes when vault is in browse mode. Frontend plugin lifecycle reactor now skips `initialize_active_vault` for non-vault modes. `smart_links::config::load_rules` returns defaults in-memory without writing when config file is missing.

## 1.37.0

### Minor Changes

- 8f78b5d: ### Bases views
  - Add kanban, gallery, and calendar views
  - Add kanban drag-and-drop with property update
  - Add content_snippet and first_image_path to gallery view

  ### Graph
  - Add cluster detection and focus mode with radial layout
  - Add force-directed canvas layout with GroupNode from clusters
  - Add Export as Canvas UI entry points

  ### Canvas
  - Add note content loading infrastructure and embedded markdown in file nodes
  - Add graph-to-canvas export actions and domain function
  - Add click-to-open with animated focus transition and edge labels

  ### Fixes
  - Resolve 5 post-audit bugs in visual features
  - Fix bases panel header overflow in sidebar
  - Fix async clipboard fallback for visual editor paste

## 1.36.1

### Patch Changes

- eb43995: ### Editor fixes
  - Preserve cursor position when switching between visual and source mode
  - Use block-anchor for stable cursor position across mode toggles
  - Allow Ctrl+Shift selection across callout/details blocks

  ### Linked source resolution
  - Resolve linked source paths in wiki link navigation
  - Resolve linked source PDF paths in citation picker and editor embeds

  ### AI provider
  - Preserve AI result when switching providers

  ### Large files
  - Show file size and "Load anyway" button for files exceeding 5 MB

  ### Infrastructure
  - Start HTTP server unconditionally at app launch

## 1.36.0

### Minor Changes

- 256d966: ### Bases improvements
  - Add search, filter, and sort capabilities to bases views
  - Fix file-type routing in bases and add expand-to-tab view
  - Extract `BASES_TAB_ID`/`TITLE` to domain constant
  - Review fixes: `$derived.by`, state sync, deduplicate filter upsert

  ### Editor fixes
  - Fix table toolbar appearing in source mode and blocking text selection
  - Fix folder autocomplete drill-down staying open after selection

  ### Inline AI
  - Auto-focus the "Ask AI to write" textarea when the inline AI menu opens
  - Re-focus the textarea when pressing Cmd+Shift+I while the menu is already open

## 1.35.0

### Minor Changes

- f6548ba: ### Attachment links
  - Add attachment link detection in Rust backend (images, PDFs, etc.) — filters attachment targets from wikilink resolution
  - Add Attachments section to the links panel UI with paperclip icon; opens files via system shell
  - Extend `LinksSnapshot` and store/service layers with attachments field

  ### MCP tool surface
  - Router auto-injects `vault_id` from active vault when omitted
  - Add `append_note` and `prepend_note` tools
  - Add `mode=semantic` to `search_notes` for hybrid vector+FTS search
  - Add `query_tasks` tool with status/path/due_before filters
  - `rename_note` now updates wikilinks in backlinking notes automatically

  ### Backlink-aware rename (in-app)
  - The in-app `rename_note` Tauri command now rewrites wikilinks in backlinking notes after rename, matching MCP behavior

  ### Fixes
  - Add standard markdown link extraction (`[text](url.md)`) to Rust `extract_links` — search DB now indexes both wikilinks and markdown-style links
  - Fix cursor-past-match-end guard in `markdown_link_input_rule` preventing premature link conversion
  - Fix plugin marketplace 404 by correcting default repo URL; improve error handling

## 1.34.0

### Minor Changes

- d277f07: ### Backlinks
  - Backlinks now work natively via search DB; merge with LSP when available
  - Resolve outlinks on individual note upserts (not only during full sync)
  - Fall back to search DB results when LSP is not running or errors

  ### Update flow
  - Manual update check shows a confirmation toast with Update/Later buttons instead of auto-installing

  ### Plugin marketplace
  - Add plugin marketplace: fetches listings from a configurable GitHub repo, displays in a Browse tab, and installs plugins to ~/.carbide/plugins/
  - Includes Rust backend commands, TS port/adapter/service/store, DI wiring, action registration, and Browse tab UI

## 1.33.1

### Patch Changes

- 1cd65f8: ### Theming
  - Expose Tier 3 component tokens in CSS token reference UI
  - Add activity bar Tier 3 tokens for independent customization
  - Remove redundant foreground token entries from theme blueprints and palette generator

  ### Vault indexing
  - Resolve wikilink targets to vault-relative paths at index time
  - Add backlinks resolution tests and register snapshot in specta

  ### External MCP sidecar
  - Inject expanded PATH into external MCP sidecar process
  - Skip non-JSON stdout lines in external MCP stdio reader

## 1.33.0

### Minor Changes

- 33b15ea: ### Hover panel
  - Sticky hover panel with rendered markdown and clear button, clears on tab change
  - Link tooltips populate the hover panel store
  - Source mode hover populates panel store
  - Clickable links in floating hover tooltips with `clear_hover` method

  ### External MCP sidecar
  - Generic external MCP client in Rust for stdio-based MCP servers
  - `sidecar.*` plugin API for spawning and communicating with external MCP servers
  - `wiki-compiler` plugin using the sidecar system
  - `vault.get_root` RPC action
  - Added `.llmwiki/` to builtin vault ignore patterns
  - Integration tests for sidecar RPC handler, adapter, and ExternalMcpState

  ### File embeds
  - Route file embed "open" action through `document_open`
  - Register `book-open` icon and fix reserved word in interface
  - Ensure leading paragraph before NodeView at document start
  - Deduplicated embed plugin code

  ### Sidebar
  - Widen sidebar and persist width across open/close

  ### Fixes
  - Preserve collapse state across non-note tabs and respect attachment folder for dropped files
  - Flush pending `didChange` before LSP completion requests
  - Fix layering violation and type error from checks
  - Rename lib crate from `carbide_lib` to `carbide`
  - Bridge Carbide AI provider config to wiki-compiler plugin

## 1.32.0

### Minor Changes

- 0f01601: ### Collapsible node views
  - Code blocks, file embeds, and note embeds now support a collapse toggle
  - Collapse state is persisted via ProseMirror node attributes

  ### Image drag-to-resize
  - Dropped images now have a drag handle for resizing

  ### Plugin system enhancements
  - Bridged action registry to plugin RPC system
  - Added plugin icon registry with ~50 curated Lucide icons
  - Fixed `vault.read` RPC to return markdown string instead of NoteDoc object

  ### Source mode (CodeMirror) improvements
  - LSP hover and completion support in source mode
  - Fixed diagnostic tooltip, hover flicker, and completion paths
  - Prevented duplicate LSP hover tooltip on wiki links
  - Fixed lifecycle crash when switching to source mode

  ### Editor polish
  - Task checkbox no longer reverts to bullet after multiple toggles
  - Codeblock list layout and table toolbar dismiss fixes
  - Nodeview collapse requires single click, fixed sticky focus
  - Added remark parse plugin for wikilink embeds (`![[...]]`)

  ### Performance & startup
  - Decoupled startup from blocking dialog and deferred heavy rescan
  - Git history no longer hangs for single document

  ### UI fixes
  - Use file-text icon for smart-templates sidebar panel

## 1.31.0

### Minor Changes

- fa29f6f: ### @ palette file filtering
  - `/` prefix filters to markdown files only, `//` prefix filters across all file types
  - Documented the @ palette inline mention system

  ### LSP/native suggest coordination
  - Extensible coordination layer between LSP completions and native suggestion providers (e.g. @ palette)
  - Prevents LSP popups from interfering with native suggest UIs

  ### MCP tool descriptions
  - Improved MCP tool descriptions and CLI help text for better LLM usability

  ### Fixes
  - `vault.list` now queries the backend instead of returning stale in-memory data
  - Fixed carbide-cli sidecar builds for local Tauri development
  - Reload expanded folders correctly during file tree refresh

## 1.30.1

### Patch Changes

- d711b41: fixed file explorer refreshing when deleting/moving folders

## 1.30.0

### Minor Changes

- 8e99e88: ### Smart templates
  - Template library plugin with built-in and custom templates
  - Template picker UI with search and categorized browsing
  - Template settings panel for managing custom templates

  ### Three-tier token system
  - Added `tokens.css` (Tier 1) and `themes.css` (Tier 2) foundation layers
  - Affordance mirror (`apply_affordances`) with tests for Tier 3 token propagation
  - Rewired editor components, tab bar, and status bar to Tier 3 tokens
  - Affordance contract CSS connecting Tier 2 semantic tokens to Tier 3 component tokens
  - Added `css_theme` and `density` settings fields with `BP_TERMINAL` blueprint
  - Tests for css_theme, density, and FOUC cache fields

  ### Theme UI
  - Replaced theme gallery grid with grouped Select dropdown
  - Removed duplicate Editor tab from theme advanced panel

## 1.29.0

### Minor Changes

- 667ad75: ### Help guides
  - Added Guides section to Help dialog with categorized, searchable help articles
  - Guide data module with keyboard shortcuts, markdown syntax, and navigation guides

  ### Note embeds
  - New `note_embed` schema node for `![[note]]` syntax
  - Block suggest mode with editor_service block handling
  - Note embed detection, rendering, serialization, and CSS
  - Wired note_embed through lazy adapter, prod ports, and full scan
  - Fixed note embed converting while cursor is inside brackets

  ### Fixes
  - Auto-update CLI symlink on server start
  - Removed duplicate `cat` visible_alias in CLI
  - Allow empty daily notes folder (vault root)
  - Resolve linked source PDFs from omnibar/graph views

## 1.28.0

### Minor Changes

- 292c582: ### Omnibar filter mode + query persistence
  - Tab-triggered filter overlay with mnemonic chips for file type filtering (Markdown, PDF, Code, Drawing, Images) and source scope (Vault/All)
  - Query, scope, and filters persist across open/close within a session
  - Shift+Tab progressively clears filters then query; text auto-selected on reopen
  - Fixed auto-select re-firing on every render, causing typed text to be overwritten

  ### Graph view fixes
  - Route non-markdown files (PDFs, etc.) to document viewer instead of forcing markdown open
  - Resolve @linked/... virtual paths to real file paths before opening documents

  ### Performance
  - Git push/fetch/pull/push_with_upstream made async with spawn_blocking to avoid blocking the UI thread
  - Removed redundant git_status calls in commit and push flows
  - Cached find_remote("origin") in git_status
  - Added timeouts to git_add_remote/git_set_remote_url

## 1.27.0

### Minor Changes

- db4b032: ### Drift layout variant
  - Added new "Drift" layout with overlay-first design, floating activity dock, and transparent editor canvas
  - Iterative fixes: sidebar/dock alignment, grid coverage, keyframe scoping, backdrop removal, editor pane isolation

  ### Daily notes
  - Full daily notes feature: settings, sidebar view, app integration, tests
  - Configurable subfolder structure (e.g. `YYYY/MM`) and name format via settings UI
  - "Open Today's Note" command palette entry with hotkey
  - Fixed daily note that exists on disk but not in store

  ### Task query DSL
  - New task query DSL parser with slash command integration
  - TaskQueryState in CodeBlockView, callbacks wired through editor extension system
  - CSS styles for task query results

  ### Source control panel
  - Git staging state and `commit_staged` action
  - Working-tree diff viewer
  - Collapsible section extraction, layout cleanup
  - Fixed duplicate source control panel, restored activity bar in lattice layout

  ### Lattice layout
  - New lattice layout variant with title bar and right panel
  - Vertical icon strip replacing context rail tab bar, overlay panel
  - AI assistant moved from context rail to bottom panel with two-column layout

  ### Theme system overhaul
  - Converted all builtin themes to `ThemeBlueprint` + `expand_blueprint`
  - Added V4 CSS token aliases (`--fg-2`, `--glass`, `--accent-glow`, `--on-accent`)
  - `generate_ui_tokens()` with surface params and precedence tests
  - Hardcoded oklch values replaced with token references
  - New Obsidian Dark theme with glass/grain/glow variant

  ### Query panel
  - "View as graph" button added to query panel
  - Documented `?` prefix for query syntax

  ### Folder suggest
  - Drill into subfolders when selecting a parent folder in suggest

  ### Search improvements
  - Sort/filter controls and date/source/extension metadata on search graph result list
  - Prefix matching in FTS search queries
  - Word-order-insensitive fuzzy scoring

  ### Other fixes and improvements
  - Table layout toggle (fit content / full width), toolbar dismissal on blur
  - Inline AI panel dismissible via Escape in all modes
  - Generic suggest plugin factory extraction
  - Bundled plugins shipped with Carbide
  - Vault startup parallelized for non-blocking init
  - Remark/image/paste bug fixes
  - Sidebar icons updated for tags and bases

## 1.26.0

### Minor Changes

- dea327d: ### Features
  - Daily notes: full feature with folder/name-format settings, sidebar view, app integration, and daily-note-exists-on-disk handling
  - Theme system: V4 CSS token aliases (`--fg-2`, `--glass`, `--accent-glow`, `--on-accent`), `generate_ui_tokens()` with surface params, and `ThemeBlueprint` + `expand_blueprint` for all builtin themes
  - Daily notes folder and name format exposed in settings UI
  - Task query blocks: Obsidian Tasks-style DSL parser, `/tasks` slash command, live-rendered query results in `language="tasks"` code fences with grouped task list, toggleable checkboxes, and debounced re-render

  ### Fixes
  - Vault startup made non-blocking by parallelizing independent ops
  - `remark_details` inner parse, dead branch removal, and `pm_to_mdast` image merge fix
  - Diagnostics `get_markdown` moved from module scope into call site
  - Redundant `image_toolbar_plugin.ts` deleted
  - Type annotation for `nodesBetween` callback return
  - Four bug fixes: folder save, AI panel, paste handler, image resize
  - Theme token consistency and test coverage improvements
  - Daily note that exists on disk but not in store now handled correctly

  ### Refactors
  - Generic suggest plugin factory extracted
  - Hardcoded oklch values in theme CSS replaced with token refs
  - Sidebar icons updated for tags and bases

## 1.25.0

### Minor Changes

- 0c8bb36: ### Theme architecture and layout variants
  - Added Obsidian Dark theme with glass/grain/glow layout variant
  - Added lattice layout variant with title bar and right panel

  ### Source control panel
  - Added source control sidebar panel with git staging state and commit action
  - Added working-tree diff viewer with inline unified diff display
  - Extracted CollapsibleSection component for reuse across sidebar panels

  ### AI assistant layout
  - Moved AI assistant from context rail to bottom panel with two-column layout
  - Replaced context rail tab bar with vertical icon strip and overlay panel

  ### Search graph enhancements
  - Added date/source/extension metadata to search graph nodes
  - Added sort/filter controls to search graph result list

  ### Editor improvements
  - Added table layout toggle (fit content / full width)
  - Shipped bundled plugins with Carbide

  ### Welcome dialog polish
  - Added key shortcuts inline in welcome dialog step 2
  - Added built-in feature pills (Mermaid Diagrams, etc.) to welcome screen
  - Removed hero tagline, consolidated into feature pills
  - Renamed Open Notes to Omnifind in welcome shortcut list

  ### Fixes
  - Fixed inline AI panel dismissibility via Escape in all modes
  - Fixed FTS search to use prefix matching in queries
  - Fixed table toolbar dismissal when editor loses focus
  - Fixed duplicate source control panel and restored activity bar in lattice layout

## 1.24.0

### Minor Changes

- d482ae7: ### Welcome onboarding dialog
  - Added first-run welcome dialog with 3-step onboarding (vault, omnibar, AI/graph)
  - Step-completion indicators: checkmarks for vault anchoring (step 1) and AI configuration (step 3) derived from live state
  - Steps 2–3 are gated behind vault existence (dimmed with "Open a vault first" label)
  - Fixed invisible close button caused by transparent shell styling
  - Added scroll overflow for short viewports
  - Uses `Dialog.Close` primitive for accessible close behavior

  ### Configurable embedding model
  - New "Embedding Model" setting under Semantic category with 5 BERT-architecture options (Arctic XS/S/M, BGE Small, MiniLM L6)
  - Rust backend accepts model ID parameter, reinitializes when model changes, and clears/re-indexes embeddings on model version mismatch

  ### Other
  - Omnibar path resolution improvements

## 1.23.0

### Minor Changes

- f79dc15: ### Features
  - **Inline AI**: Phase 3 inline AI menu with streaming execution pipeline — context-aware commands (explain, simplify, fix, expand, custom prompt), configurable via settings, filtered to CLI providers only, wired to hotkey system (Cmd+Shift+I), clean CLI output stripping in streaming
  - **@ palette**: Unified @ mention palette replacing the date suggest plugin
  - **Settings panel**: Reorganized settings — split Layout into Editor/Sidebar, renamed Misc to Storage
  - **Command palette**: 'Plugin' badge on plugin-derived commands; reapplied plugin keyword boost and diagnostics display toggle
  - **Slides plugin**: Wiki-image support with path resolution fallback; auto-shrink overflow text

  ### Fixes
  - Fixed heading backspace and inline math double-click editing
  - Fixed heading modification on blank lines
  - Fixed cursor position issues
  - Fixed linked source bug; graph panel tidying and linked sources hidden from file tree based on settings toggle

## 1.22.0

### Minor Changes

- 5f5dbd8: ### Features
  - **Callout blocks**: Full callout block support — remark plugin, ProseMirror schema/node view, slash commands, foldable toggle, keymap navigation, Backspace deletion, and drag handle
  - **Block operations**: Turn-into, duplicate, delete operations; content-visibility optimization; multi-block selection
  - **Code editor improvements**: markdown-it port with insert handle, focus mode, language memory, fallback parse; Tab/Shift-Tab indent in both editors; focus and scroll to cursor on source→visual switch
  - **LSP enhancements**: Toggle UI controls, inline diagnostics in visual editor, LSP-sourced suggestion labels, code document sync and language server operations, position mapping and tooltip improvements, Cmd+. hover at cursor
  - **Graph view**: "View as graph" action in omnibar search results; Phase 4 performance — degradation profiles, edge sampling, degree sizing
  - **References pane**: Flat/by-source/tree view modes
  - **File explorer**: Setting to hide @linked sources from tree
  - **Plugin system**: Sidebar panel rendering with live iframe UI, plugin lifecycle activation, Smart Templates plugin, SDK extensibility — all 42 RPC methods exposed
  - **Terminal & editing**: Native xterm defaults; Paste HTML as Markdown command; within-document anchor link scrolling
  - **Theming**: Removed unused themes; lightened default dark mode
  - **Offline**: Bundled fonts for offline use

  ### Fixes
  - Fixed multiple tab-switch bugs: source editor dirty state, cursor restoration, stale content, visual editor persisting after last tab closed, source-mode edits lost
  - Fixed frontmatter loss on selectAll and undoable doc replacements
  - Fixed invisible blocks after Enter in visual editor
  - Fixed Cmd+. code actions conflict and diagnostic tooltip labels
  - Fixed missing linked-sources toggle and broken catalog categories
  - Fixed LSP & plugin coexistence: block ref handoff, hover panel routing

## 1.21.0

### Minor Changes

- ba3643f: ### Features
  - **Hybrid omnibar search improvements**: Promoted the hybrid search pipeline to the primary omnibar path, added structured queries, scoped search, semantic graph edges, and graph interaction improvements
  - **Heading autocomplete in wiki links**: Added heading completion support for `[[note#heading]]` and `[[#heading]]` flows
  - **Editor and plugin workflow improvements**: Added plugin commands to the command palette, HTML source editing support, and document metadata access via `editor.get_info`
  - **LSP provider architecture upgrades**: Introduced shared `LspProvider` abstractions, generalized provider config handling, and added Markdown Oxide support in shared client and frontend settings

  ### Fixes
  - Fixed plugin sub-resource requests to fall back to the active vault
  - Reduced embedding latency and corrected note/block embedding behavior
  - Fixed link-repair bugs, hybrid search edge cases, dirty-state handling, toolbar undo, and related search indexing issues
  - Hardened LSP behavior by addressing race conditions, stale responses, timeouts, diagnostics metadata, settings mismatches, and bundled default server configs

## 1.20.0

### Minor Changes

- c72351b: ### Features
  - **HTML-to-markdown converter plugin**: New plugin that converts HTML files to markdown, with single-file conversion support and error routing
  - **PDF export rewrite**: Migrated PDF export from jsPDF to PDFKit with bundled Inter fonts, standalone browser build, and hardened error handling
  - **Inline note embedding on save**: Notes are now embedded inline on save using blake3 change detection for efficient diffing
  - **CLI/MCP tooling improvements**: Enhanced CLI and MCP tool integrations

  ### Fixes
  - Format and lint-fix actions are now undoable via Ctrl+Z
  - Serialized xterm.js writes to eliminate TUI app flickering
  - PDF export gated to only active note tabs; frontmatter stripped from export output
  - Resolved CLI sidecar path in bundled macOS app directory
  - Resolved cargo warnings and test failures

## 1.19.0

### Minor Changes

- 161ad73: ### Search Graph
  - Full search graph tab: domain types, subgraph extraction, store, service methods, actions, DI wiring, UI components, command palette entry, and keybinding
  - Visual enhancements: color-coded nodes, score-based sizing, folder clustering
  - Reactivity and macOS hotkey fixes

  ### Graph
  - Smart link edges rendered with dashed lines and hover provenance
  - Smart link edges added to graph data model

  ### Plugin System
  - `network.fetch` and `ai.execute` RPC namespaces for plugins
  - RPC timeouts, rate limiting, and consecutive error budget
  - Settings schema: textarea type, min/max, placeholder support
  - Slash command contribution point
  - Metadata-changed event bridge to plugin SDK
  - AI and network namespace docs, permissions, and `allowed_origins`

  ### MCP Tools
  - Tier 2: backlinks, outlinks, properties, references
  - Tier 3: git_status, git_log, rename_note, plugin MCP bridge

  ### CLI
  - Git, reference, bases, tasks, and dev CLI commands with backend routes
  - Built-in termimad markdown renderer (replaces external glow dependency)

  ### Settings & UI
  - Storage & Cleanup settings section
  - Tool status cards in Settings > Tools
  - Editor width standardized as CSS custom properties

  ### File System
  - Symlinked files and folders supported in file explorer with full read+write
  - Symlink safety guardrails on all WalkDir traversals

  ### Fixes
  - Embedding pipeline CPU thrash resolved; Metal GPU support added
  - `embed_sync` no longer cancels in-flight embeds
  - Linked sources open in-app with file name as blurb
  - Import linked source entries to reference library

## 1.18.0

### Minor Changes

- c6b30b3: ### New Features
  - **HTML viewer for linked sources:** View linked source files and vault files in an HTML viewer, wired up with proper rendering
  - **Embedding toggle controls:** Disable/enable embedding per-source via settings UI toggle switches and command palette actions
  - **STT feature-gated:** Speech-to-text subsystem gated behind `stt` Cargo feature flag, removed from default main build to reduce binary size and compile times

  ### Fixes
  - **Editor:** Catch ProseMirror position errors in `dispatchTransaction` to prevent silent crashes
  - **Vault sync:** Preserve linked source content during vault sync instead of overwriting
  - **Performance:** Defer linked source embedding to batch path; reduce CPU spike when adding linked source folders; stop embedding from blocking the writer thread
  - **UI:** Fix FolderSuggestInput trailing slash and nested path bugs
  - **STT stability:** Prevent CoreAudio SIGSEGV, fix model loading blocking the async runtime, prevent transcription spinner from hanging, correct VAD model resource path
  - **Deps:** Pin `tauri-plugin-dialog` to 2.6.0
  - **CI:** Switch `generate-bindings` to macOS for `ort_sys` linker fix; make candle accelerate feature macOS-only for Linux builds

## 1.17.0

### Minor Changes

- 906703f: ### New Features
  - **Speech-to-text (STT):** Full dictation support with configurable Whisper model, custom model path, keyboard shortcut, and settings UI with expandable model catalog
  - **Block drag-and-drop:** Drag handles on editor blocks with section-aware positioning and baseline alignment per block type
  - **Block embeddings & semantic search:** Section embedding pipeline, HNSW vector index for O(log n) approximate nearest-neighbor search, `block_knn_search`, and `find_similar_blocks` command via smart links

  ### Fixes
  - **Embeddings:** Off-by-two tokenizer truncation crash, N+1 query in block similarity, stale data and tag regression, proportional throttle in dev, include last line of section in embedding text
  - **Logging:** Crash-proof logging and console cleanup, silence settings/HNSW debug spam, replace `console.error` with `create_logger` in STT adapter
  - **Editor:** Drag grip opacity, CLI sidecar resolution from correct bundle location

## 1.16.0

### Minor Changes

- c5a8ab7: ### Generic source editing, CLI enhancements, and reliability fixes
  - **Generic source editing**: Non-markdown files (YAML, TOML, JSON, etc.) can now be edited through the LSP workspace edit pipeline, using a text-by-default architecture.
  - **CLI `reindex` command**: New `carbide reindex` subcommand triggers vault re-indexing via both CLI and MCP.
  - **CLI `edit` command**: Edit vault files directly from the command line.
  - **CLI `cat` command**: Read/display file contents with glow-rendered markdown output.
  - **CLI `search --paths-only`**: Search results can now return file paths only for scripting use.
  - **CLI `tags --filter`**: Filter tags listing by pattern.
  - **CLI exit codes**: Proper exit codes for all CLI commands, enabling reliable scripting.
  - **Dynamic shell completions**: Tab completions generated from live vault state.
  - **Glow rendering**: `read` and `open` commands now render markdown through glow for rich terminal output.
  - **Undoable workspace edits**: IWE workspace edits are now undoable in both the code and visual editors.
  - **Tag normalization**: Frontmatter tags with `#` prefix are now normalized consistently.
  - **URI handling**: Fixed double-prefixed `file://` URIs from the IWE LSP server.
  - **MCP protocol**: Added camelCase serde rename to MCP protocol structs for spec compliance.
  - **CodeAction fix**: Skip `codeAction/resolve` when the action already carries an edit field.
  - **Sidecar downloads**: Added curl timeouts/retries; removed broken `--version` call from download scripts.
  - **Security**: Triaged dependabot alerts — upgraded deps and removed unused `serde_yml`.

## 1.14.0

### Minor Changes

- 6c34c7c: ### LSP typed session model and reliability improvements
  - **Typed LSP status**: `MarkdownLspStatus` enum in Rust and TypeScript replaces fragile string-based status tracking. Statuses: Starting, Running, Restarting, Stopped, Failed.
  - **Provider resolution**: Extracted `provider.rs` module for markdown LSP provider resolution (IWES/Marksman) with capability metadata.
  - **Lint lifecycle fix (BUG-010)**: `lint_close_file` returns Ok when no session exists instead of erroring.
  - **Transport diagnostics (BUG-009)**: Stderr ring buffer, init timeout (30s default, 10s for cloud-backed vaults), typed init errors (`InitTimeout`, `InitEof`, `InitFailed`), retryable/non-retryable classification.
  - **IWES packaging (BUG-005)**: Populated `platform_binaries` for auto-download from upstream `iwe-org/iwe` releases. Removed vendored sidecar binary and submodule.
  - **Vault-aware startup**: Detect iCloud/Dropbox/OneDrive vault paths, apply shorter init timeouts for cloud-backed vaults.
  - **Document lifecycle**: Added `markdown_lsp_did_close` end-to-end. Editor features gated by provider health and capabilities.
  - **MCP stdio transport**: Claude Code setup now prefers stdio via `carbide mcp` CLI proxy (matching Claude Desktop), avoiding bearer tokens in `.mcp.json`.
  - **CLI install paths**: Default to `~/.local/bin/carbide` on macOS/Linux, `%LOCALAPPDATA%\Programs\Carbide\bin\carbide.exe` on Windows.
  - **Comprehensive test coverage**: Wave 4 verification tests for provider types, status serde, toolchain registry, store state, service lifecycle, and release validation script.

## 1.11.1

### Patch Changes

- 273265b: omnifind and file search memory fixes

## 1.11.0

### Minor Changes

- c8ac662: Changeset: High-Priority Feature Implementation — 2026-04-01

## 1.10.0

### Minor Changes

- f7e41dc: Linked sources & search integration: embed linked sources in vault and add search inclusion toggle. Auto-load reference library on vault open. Fix infinite reactive loop in virtual file tree ROW_HEIGHT effect.

## 1.9.0

### Minor Changes

- 6aea234: Restore reference backend (linked sources, Zotero BBT, annotations); fix window close permissions, trailing whitespace in paragraphs, find-replace after buffer switch, virtualizer row height re-measurement, and iCloud settings write.

## 1.8.1

### Patch Changes

- c58da8c: Fix process cleanup on app close via RunEvent::Exit handler; fix vault-open CPU hotspot with async URI handlers, deferred plugin iframes, and lazy images; add asset response cache with HTTP cache headers

## 1.8.0

### Minor Changes

- c1fa394: Add Editor tuning panel (font, size, line height, zoom) under Theme > Advanced; fix OmniFind FTS thread contention causing UI blocking; fix PDF export CSP violations and wire up editor zoom hotkeys

## 1.7.1

### Patch Changes

- 49641a9: Prevent .iwe directory creation in browse mode, fix ai_prompt_builder test

## 1.7.0

### Minor Changes

- 0306368: Task management improvements (M0-M6), indexing/embedding/watcher bug fixes, tree refresh on settings change, prompt builder

## 1.5.0

### Minor Changes

- 4495f15: ### File tree blurbs
  - AI-generated note descriptions displayed inline in the file tree
  - Configurable blurb position (below heading, below caption) and toggle in Layout settings
  - Markdown formatting stripped from blurbs for clean display

  ### Theme & CSS token editor
  - New CSS token reference tab with inline editing and revert
  - Theme-aware source editor styling

  ### Editor improvements
  - Split view mode with dedicated toggle
  - Heading markers toggle for visual editor
  - Cursor sync fixes in split editor
  - Escape key clears lightbulb decoration without dismissing dropdown
  - Editor status persistence across sessions

  ### Settings
  - Spell check toggle for rich and source editors
  - Terminal customization options
  - Reference manager UI wiring

  ### IWE dynamic transforms
  - Dynamic AI provider substitution for IWE transforms
  - Config-driven transform actions wired from IWE settings
  - Config reset properly reapplies provider and guards redundant restarts
  - Open config reveals in file manager

  ### LSP
  - Proper client capabilities and config logging
  - Undoable code actions

## 1.4.0

### Editor Pipeline Rewrite

- Replaced markdown-it with remark/mdast pipeline for parsing and serialization
- Extracted ProseMirror plugins into 16 composable extensions (Moraya Pattern)
- Added Yjs integration with PM-only Y.Doc binding via ySyncPlugin
- Removed prosemirror-markdown dependency

### LSP Unification — IWE → Marksman

- Replaced IWE language server with Marksman LSP
- Deleted IWE backend, frontend modules, and all related tests
- Renamed LSP plugins (iwe*\* → lsp*\*) and cleaned DI wiring
- Unified document sync reactor across all LSP clients

### Backend Simplification

- Deleted Rust-side parsers, tags service, references service, and graph service
- Moved link extraction, metadata extraction, and graph building to frontend
- Removed ~5,000 lines of dead backend code (link_parser, frontmatter, markdown_doc, linked_source)

### Layout System

- Added 10 new layout variants: Spotlight, Cockpit, Theater, Triptych, Grounded Heavy, HUD, Zen Deck, Dashboard, Command Deck, Monolith
- Replaced split-view system with multi-tab side pane
- Added ActivityBar component with layout-aware positioning

### Stability & Performance

- Fixed memory leaks, data races, and timer deduplication issues (11 findings from state/memory audit)
- Fixed git sync spinner hang and cache thrashing
- Repaired broken CSS in glass, zen-deck, and command-deck themes
- Fixed linked source PDF loading (vault scheme, double-slash normalization)

### Status Bar

- Merged count displays, collapsed git section, removed sync button

## 1.3.0

### Minor Changes

- Reskinning prototypes: bases panel UI, LSP results redesign, IWE results streamlined
- Linked source watcher refactored to pull-based; fixed PDF loading in content pane
- Toolchain manager with binary resolver, SHA-256 verification, lifecycle management
- Composable query language with parser, evaluator, saved `.query` files, lens views
- Unified diagnostics store, AST error surfacing, unresolved link diagnostics
- Tag completion plugin, ParsedNote frontend cache, unified LSP document sync

## 1.1.0

### Minor Changes

- Full LSP client infrastructure (hover, go-to-definition, completion, formatting, rename, inlay hints, diagnostics)
- Resizable code blocks, inline SVG preview, collapsible headings and details sections
- Plugin system with lifecycle, settings UI, iframe sandboxing
- Metadata sidebar, hierarchical tag tree, heading anchors, folder path autocomplete
- Split view with real-time content sync
- System color scheme preference, file tree style variants, theme persistence
- Vault startup optimization, state management efficiency improvements
- AST-indexed schema with property registry

## 1.0.0

### Major Changes

- Plugin system and markdown lint infrastructure
- Semantic search integration with vault graph visualization
- PDF viewer, canvas, fuzzy matching, and editor polish
- Tags sidebar panel, date links, note naming templates
- Type-safe IPC, ProseMirror migration, find & replace, and theme redesign

## 0.4.0

### Minor Changes

- Plugin system, semantic search, PDF viewer, canvas, tags, ProseMirror migration

## 0.3.0

### Major Changes

- Full-vault graph view, sqlite-vec embeddings, zen mode, native menubar
