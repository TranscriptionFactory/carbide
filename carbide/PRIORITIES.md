# 1. Editor Polish & Power Features

### 1. Contextual Command Palette (Phase 6c)

Smart `when` predicate filtering reduces clutter as command count grows. Not urgent at current feature count, but becomes important soon.

- [ ] `image_context_menu_plugin.ts` — right-click on images
- [ ] `image_context_menu.svelte` + `image_alt_editor.svelte`
- [ ] Actions: resize, copy image/URL, edit alt, open in browser, save as, delete

### 2. Formatting Toolbar (Phase 6e — Batch 5)

Useful for discoverability and touch/trackpad users. WYSIWYG editors without a toolbar feel incomplete. Keyboard-first early adopters can live without it.

- [ ] `formatting_toolbar.svelte` + `formatting_toolbar_commands.ts`
- [ ] Toolbar: undo/redo, bold/italic/strike/code/link, H1-H3, quote, lists, code block, table, image, HR
- [ ] Show/hide via settings toggle or responsive breakpoint

### 3. Document viewing in editor

### Architecture

- [x] Create `DocumentViewer.svelte` — dispatches to renderer by file extension
- [x] Extend editor pane: show Milkdown for `.md`, appropriate viewer for other types

### PDF Viewer

- [x] Add `pdfjs-dist` to `package.json`
- [x] Render PDF in editor pane: page navigation, zoom, scroll, text search
- [x] "Open to Side" context menu for side-by-side PDF + notes

### Image Viewer

- [x] Display PNG, JPG, SVG, GIF, WebP in editor pane
- [x] Zoom/pan controls, fit-to-width default
- [x] Dark/light checkerboard for transparent images

### CSV/TSV Viewer

- [-] Add `papaparse` to `package.json` — deferred (large file DOM performance concerns)
- [-] Render as scrollable, sortable table — deferred
- [-] Column resize, row count display — deferred

### Code/Text Viewer

- [x] Syntax-highlighted read-only view (CodeMirror with @codemirror/language-data)
- [x] Line numbers, copy button
- [x] Support: `.py`, `.R`, `.rs`, `.json`, `.yaml`, `.toml`, `.sh`

### Cross-cutting

- [x] File tree icon badges by file type
- [x] Drag non-markdown file into note → insert markdown link
- [x] PDF export of notes (jsPDF + Cmd+Shift+E)

### Stretch

- [ ] PDF text selection → "Copy as Quote" into active note
- [ ] PDF annotations stored in `.carbide/annotations/<filename>.json`

### 4: Canvas & Visual Knowledge Layout

### Architecture

- [x] Create `canvas` feature slice (`src/lib/features/canvas/`)
- [x] Define `CanvasPort` and `CanvasTauriAdapter` for IO
- [x] Implement `CanvasService` and `CanvasStore` for spatial state

### JSON Canvas (Spatial Boards)

- [ ] Parser/Serializer for `.canvas` (JSON Canvas standard)
- [ ] Svelte-based renderer for nodes (Note, Text, File, Link) and edges
- [ ] Basic node manipulation (add, move, resize, delete)
- [ ] Note embedding: render Markdown content inside canvas nodes
- [ ] Image embedding: render local assets inside canvas nodes

### Excalidraw (Drawings)

- [x] Support for `.excalidraw` and `.excalidraw.json` files
- [x] Host Excalidraw editor (iframe sandbox with custom URI scheme)
- [x] Bi-directional sync between app and Excalidraw instance
- [x] Canvas naming dialog on create
- [x] Theme-aware background
- [ ] Export canvas/drawing to PNG/SVG

### Vault & Link Integration

- [ ] Canvas reactor: rename-safe backlink rewrites for note references inside canvases
- [ ] Index canvas content in search DB (text nodes, note paths)

### Testing

- [ ] Test JSON Canvas schema validation and round-trip
- [ ] Test node manipulation and state persistence
- [ ] Test canvas link rewriting on note rename
- [ ] Test canvas content indexing

# 2. Backend Architecture: What AppFlowy's Stack Gets Right

> This section evaluates AppFlowy's technical backend patterns (block-ID tree, protobuf+FFI, Rust collab crate) for applicability to Carbide, given that Carbide is not bound by any legacy constraints and targets extensibility, efficiency, and flexibility. The hard constraint remains: markdown files on disk, Obsidian-compatible, human-readable. AppFlowy's CRDT storage format is explicitly rejected — that is the format problem.

### 1. Shared parsed AST in Rust — ✅ IMPLEMENTED

> **Status (2026-03-17):** Fully implemented. `shared/markdown_doc.rs` provides a centralized `parse_note()` function using `comrak` (v0.50.0) that returns a `ParsedNote` struct with headings, links (wiki + markdown), tasks, frontmatter, and word/char counts. Consumed by search indexing and other backend features.

~~AppFlowy's collab crate holds a structured document tree as the authoritative representation in Rust. Carbide's Rust backend is a file I/O layer — it reads/writes `.md` bytes and delegates all structure to ProseMirror on the frontend.~~

~~The gap: every Rust feature that needs document structure (`search`, `bases`, `graph`, `tags`, `pipeline`, `links`) either reparses markdown independently or receives pre-parsed data pushed from the frontend. These features almost certainly each implement their own string/regex markdown parsing rather than sharing a single AST.~~

~~**Recommendation:** A shared `markdown_doc` internal crate (using `comrak` or `pulldown-cmark`) that parses markdown into a structured AST, consumed by all Rust backend features. ProseMirror stays authoritative for _editing_. Rust owns the parsed representation for _backend operations_. This eliminates redundant parsing and creates a single upgrade point for parser improvements.~~

### 2. Richer SQLite schema — index the AST, not just frontmatter — ⚠️ PARTIALLY IMPLEMENTED

> **Status (2026-03-17):** `note_headings` and `note_links` tables implemented in `features/search/db.rs`. `note_blocks` table is still missing. Schema also includes `notes` (with word/char counts, heading count, reading time), `notes_fts`, `outlinks`, `note_properties` (typed: date/string/number/boolean/json), `note_tags`, `tasks`, and `note_embeddings` (384-dim bge-small-en-v1.5 vectors).

~~AppFlowy's `DatabaseViewCache` indexes typed fields per row. Carbide's SQLite index (`note_properties`, `note_tags`, FTS5) is flat: frontmatter key/value pairs and raw text. This is a ceiling for Bases query expressiveness and search result quality.~~

Tables ~~worth adding~~ derived from the shared AST (#16.1):

| Table           | Columns                                          | Enables                                                                           | Status     |
| --------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- | ---------- |
| `note_headings` | `note_path, level, text, char_offset`            | Heading deep links, outline search, section-level FTS                             | ✅ Done    |
| `note_blocks`   | `note_path, block_type, content, position`       | "Find all code blocks", task count summaries in Bases, block-level search results | ❌ Not yet |
| `note_links`    | `source_path, target_path, link_text, link_type` | Proper relation table for backlinks, orphan detection, graph queries              | ✅ Done    |

The `graph` and `links` features ~~would benefit~~ benefit from `note_links` being a real relation table ~~rather than a re-scanned wikilink search~~.

### 3. Event-driven incremental index invalidation — ✅ IMPLEMENTED

> **Status (2026-03-17):** Fully implemented. `features/watcher/service.rs` emits typed `VaultFsEvent` variants (`NoteChangedExternally`, `NoteAdded`, `NoteRemoved`, `AssetChanged`) with vault ID and path. Uses `notify` crate (v7.0.0) with debouncing. Frontend listens and triggers incremental index operations per-note.

~~AppFlowy propagates changes via typed callbacks (`OnRowsCreated`, `OnFiltersChanged`, etc.). Carbide has a `watcher` feature detecting filesystem changes. The risk is that post-detection behavior re-indexes more than necessary, or that the index update is disconnected from the save path.~~

~~The target model: the watcher emits a typed `NoteChanged { path, change_kind }` event; a pipeline handler processes only that note; SQLite is updated incrementally. No polling, no full-vault re-index on change. This mirrors AppFlowy's callback pattern adapted to Carbide's file-based model.~~

### 4. Type-safe IPC schema (protobuf's benefit, without protobuf) — ✅ IMPLEMENTED

> **Status (2026-03-17):** Fully implemented. `tauri-specta` (v2.0.0-rc.21) with `specta` (v2.0.0-rc.22) and `specta-typescript` (v0.0.9) generate TypeScript bindings at `src/lib/generated/bindings.ts`. All 95+ Rust commands decorated with `#[specta::specta]`. Full type-safe IPC boundary with zero serialization overhead.

~~AppFlowy uses protobuf because Dart↔Rust has no shared type system. Tauri provides Rust↔TypeScript — and `tauri-specta` generates TypeScript types directly from Rust structs. If Carbide isn't already using `tauri-specta`, this is the highest-leverage zero-cost improvement: generated types make the IPC boundary as type-safe as AppFlowy's protobuf schema, with no serialization overhead and no separate schema language.~~

### 5. Atomic save → parse → index pipeline — ✅ IMPLEMENTED

> **Status (2026-03-17):** Fully implemented. Single IPC call `write_and_index_note` writes to disk via BufferManager, then passes the in-memory markdown to the search writer thread (`DbCommand::UpsertNoteWithContent`) which parses and indexes without re-reading from disk. `upsert_note_parsed` now wraps all SQL in `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` for crash consistency. Bulk callers use `upsert_note_parsed_inner` (non-transactional) since they manage their own batch transactions. Frontend `write_existing_note` calls the unified command in vault mode, falls back to `write_note` in browse mode.

Current model:

```
ProseMirror edit → markdown serialized → IPC → Rust handler (write_and_index_note)
                                                    │
                                   ┌────────────────┼────────────────┐
                                   │                │                │
                               write file     pass markdown     writer thread:
                             (BufferManager)   (no re-read)      parse AST →
                                                                 BEGIN IMMEDIATE →
                                                                   upsert index →
                                                                   set outlinks →
                                                                 COMMIT
```

Implementation details: `carbide/implementation/atomic_save_parse_index.md`

### 6. What to explicitly not adopt

| AppFlowy pattern                                | Reason to skip                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| CRDT collab crate (y-crdt)                      | Breaks markdown storage; this is the format problem                                  |
| Block-ID tree as document storage format        | IDs embedded in `.md` files destroy readability and Obsidian compatibility           |
| Full block-ID tree in Rust as editing authority | Duplicates ProseMirror, requires bidirectional sync, high complexity for single-user |
| Protobuf for IPC                                | `tauri-specta` gives equivalent type safety with less ceremony                       |
| Awareness / cursor collaboration metadata       | Single-user app; irrelevant                                                          |

### Implementation priority (updated 2026-03-17)

1. ~~**`tauri-specta` for typed IPC**~~ — ✅ Done. 95+ commands with generated TypeScript bindings.
2. ~~**Shared `comrak`-based AST parser**~~ — ✅ Done. `shared/markdown_doc.rs` with `ParsedNote`.
3. **Richer SQLite schema** — ⚠️ `note_headings` ✅, `note_links` ✅, `note_blocks` ❌ still needed
4. ~~**Atomic save → parse → index handler**~~ — ✅ Done. `write_and_index_note` unifies write + parse + index into single IPC call with transaction wrapping.

---

## 3. Frontend Architecture: What AppFlowy's Stack Gets Right

> This section evaluates AppFlowy's frontend patterns (BlockComponentBuilder system, BLoC state, type-dispatch cell editors) for applicability to Carbide's Svelte 5 + ProseMirror frontend. Findings are grounded in Carbide's actual codebase: 22+ PM plugins in `editor/adapters/`, `EditorStore` state shape, and `bases/ui/` structure. **Note:** Milkdown has been fully ejected as of 2026-03-17; the editor now uses raw ProseMirror exclusively.

### 17.1 Editor extension contribution points model — ❌ NOT IMPLEMENTED

> **Status (2026-03-17):** Not implemented. Plugins are still registered as an ad-hoc array in `prosemirror_adapter.ts` (lines 404-523) via individual `create_*_plugin()` calls pushed to a `plugins: Plugin[]` array. No unified `EditorExtension` interface exists.

Carbide has 22+ individual ProseMirror plugin files in `editor/adapters/`. Each is ad-hoc — a slash command plugin looks nothing like a toolbar plugin or a keymap plugin. There is no shared interface. Adding a new block type requires knowing to touch multiple unrelated files.

AppFlowy's `BlockComponentBuilder` gives each block type a single registration point declaring all its contributions. The Carbide equivalent would be an `EditorExtension` interface:

```ts
interface EditorExtension {
  schema?: NodeSpec | MarkSpec;
  plugins?: () => Plugin[];
  inputRules?: (schema: Schema) => InputRule[];
  keymaps?: (schema: Schema) => Keymap;
  slashCommands?: SlashCommandEntry[];
  toolbarItems?: ToolbarItem[];
}
```

Each existing plugin file becomes one conforming export. New block types (toggle, inline AI, outline block) are self-contained and auditable from a single location. This refactor should be done **before** adding further complex block types — the current flat-file approach does not scale past ~35 plugins without becoming a maintenance burden.

### 17.2 PM selection state in EditorStore — ⚠️ INTENTIONALLY RETAINED

> **Status (2026-03-17):** `EditorStore` still holds `selection`, `cursor`, and `cursor_offset` fields (in `editor_store.svelte.ts`). These serve legitimate cross-feature UI purposes: `cursor` drives the status bar line/column display, `cursor_offset` persists scroll position across tab switches, and `selection` tracks selected text for UI features. Projected from PM via `on_cursor_change` callback — not owned by the store. The dual-source-of-truth concern remains valid but the fields have clear consumers.

`EditorStore` holds `selection`, `cursor`, and `cursor_offset` — projected from ProseMirror via callbacks in the PM adapter. This creates two sources of truth: ProseMirror's authoritative `state.selection` and a Svelte store mirror. They stay in sync only as long as every mutation path fires the callback correctly.

AppFlowy keeps document/editing state strictly inside the editor's state machine. Only coarse-grained signals are projected to the app layer.

**Recommendation:** Still relevant — audit whether floating toolbar visibility and format mark states read from the store or from PM plugin state. If any selection-sensitive behavior reads from the store rather than PM, consider moving it into a PM plugin to avoid races between the two update cycles. The status bar and tab-switch scroll restoration are valid store consumers.

### 17.3 Milkdown's role is ambiguous at this point — ✅ RESOLVED (Milkdown ejected)

> **Status (2026-03-17):** Decision made and executed — **Option A: pure ProseMirror**. Milkdown has been fully ejected. Zero `@milkdown` imports remain in the editor feature. New core files replace Milkdown's responsibilities:
>
> - `schema.ts` — complete PM schema definition (replaces Milkdown presets)
> - `markdown_pipeline.ts` — markdown-it + prosemirror-markdown (replaces remark)
> - `prosemirror_adapter.ts` — direct EditorState/EditorView construction (replaces Editor.make())
> - `lazy_editor_adapter.ts` — lazy-loading wrapper (renamed from lazy_milkdown_adapter.ts)
>
> Research and migration plan documented in `carbide/research/milkdown_role_assessment.md` and `carbide/implementation/milkdown_ejection.md`. Recent commits (`77393cb`, `d4ed0e8`, `65803b3`, `af7deba`, `71d0bcc`) fix post-ejection issues, indicating migration is complete and stabilizing.

~~With 30+ raw PM plugins and `create_milkdown_editor_port` as the primary integration surface, Milkdown is functioning as an initialization harness — schema presets and markdown serialization — rather than as an active plugin framework. The codebase is already operating at the raw ProseMirror level for almost all extensions. `LARGE_DOC_CHAR_THRESHOLD` / `LARGE_DOC_LINE_THRESHOLD` in `milkdown_adapter.ts` suggest there are performance-sensitive paths where raw PM control already matters.~~

~~This is not a problem today, but it becomes one when adding complex new block types: the choice of whether to build against Milkdown's plugin API or raw PM affects API surface, upgrade coupling, and how much of Milkdown's internals you need to understand.~~

~~**Recommendation:** Make an explicit decision before the next complex block type (toggle, inline AI). Either: (a) commit to raw PM for all new extensions and treat Milkdown as a thin init layer only, or (b) verify Milkdown's plugin API can handle the required complexity without fighting it. Avoid mixing both approaches further.~~

### 17.4 Type-dispatch cell editors for Bases — ❌ NOT IMPLEMENTED

> **Status (2026-03-17):** Not implemented. `bases_table.svelte` renders all cell values as plain text (`row.properties[key]?.value ?? ""`). No per-field-type editor components exist. The table is read-only — clicking a row opens the note. No date picker, toggle, dropdown, or type-specific editors.

Confirmed: `bases/ui/` contains `bases_panel.svelte` and `bases_table.svelte`. There are no per-field-type cell editor components. AppFlowy's pattern here is directly applicable: each field type (date, boolean, single-select, number, text) renders its own editor component rather than a generic input. A `CellEditor` component that switches on field type and renders the appropriate widget is pure UI work — no backend changes required.

**Recommendation:** Before adding new Bases field types, introduce a `CellEditor` dispatch component. Date fields get a date picker; booleans get a toggle; select fields get a pill dropdown. This should be implemented alongside the Bases board/calendar views (section 2) since those views also require typed cell rendering.

### 17.5 ViewTypeRegistry (confirmed missing) — ❌ NOT IMPLEMENTED

> **Status (2026-03-17):** Still not implemented. View type selection uses ad-hoc `{#if}/{:else if}` conditional rendering in `note_editor.svelte` (lines 54-93) dispatching on `active_tab?.kind` (`"graph"`, `"document"`, `"note"`). Tab types are formally typed as a union in `tab/types/tab.ts`. Pragmatic for 3 view types but won't scale well past 5+.

Carbide's different view types (editor, bases, canvas, graph) are wired via ad-hoc conditional rendering at the layout level — there is no self-registration pattern. A `ViewTypeRegistry` where each view type registers its renderer, toolbar contributions, and action handlers would scale better as Kanban and Calendar views are added.

This is lower priority than 17.1 and 17.4 but should be in place before a third Bases view mode is implemented.

### 17.6 What to explicitly not adopt from AppFlowy's frontend

| AppFlowy pattern                 | Reason to skip                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Flutter widget tree / BLoC state | Svelte 5 runes are equivalent and better suited to a webview context                    |
| Custom block-ID delta editor     | ProseMirror's schema model is more compositional; replacing it would be a full rewrite  |
| Dart `get_it` service locator    | Carbide's DI via store instantiation in `create_app_stores()` is cleaner for this scale |
| Per-document collab adapter      | Single-user; no collaborative state to reconcile                                        |

### Implementation priority (updated 2026-03-17)

1. **`EditorExtension` contribution interface** — ❌ Still needed. Define interface, migrate 22+ existing plugins; prerequisite for toggle/inline-AI blocks.
2. **Audit and reduce PM state in EditorStore** — ⚠️ Fields retained intentionally for status bar and tab-switch scroll. Audit floating toolbar consumers to confirm they read from PM plugin state, not the store.
3. **`CellEditor` type-dispatch for Bases** — ❌ Still needed. Per-field-type editor components before new field types or board/calendar views.
4. ~~**Milkdown vs raw PM decision**~~ — ✅ Done. Pure ProseMirror. Milkdown fully ejected.
5. **ViewTypeRegistry** — ❌ Still needed before a third Bases view mode.

# 3. Graph & Semantic Search — Current State and Next Steps

> Findings from audit of `src/lib/features/graph/`, `src/lib/features/links/`, `src-tauri/src/features/graph/`, and `~/src/RAG/`.

### What exists today

**Graph (frontend + Rust backend)**

- 1-hop neighborhood view: center note → direct backlinks, outlinks, bidirectional links, orphan links.
- Data sourced from SQLite FTS index via `search_db::get_backlinks`/`get_outlinks`/`get_orphan_outlinks`.
- LRU cache in Rust (`GraphCacheState`) with hit/miss/eviction observability.
- Frontend renders a static column-layout canvas (`resolve_graph_canvas_view`) with node selection, hover, and filter-by-query.
- Graph panel toggled from activity bar; refresh reactor syncs on active-note change.

**Links**

- `LinksStore` tracks backlinks, outlinks, external links, orphan links per note.
- Link repair service handles renames across vault.

**RAG reference (`~/src/RAG`)**

- ChromaDB-backed MCP server for local document search.
- Hybrid search pipeline: semantic (ChromaDB default embeddings) + keyword (`$contains`) merged via Reciprocal Rank Fusion (k=60).
- Heuristic re-ranking (inverse distance 0.6, term overlap 0.3, exact phrase 0.3).
- Chunk expansion fetches adjacent chunks by `chunk_index` metadata.
- Ingestion via `extract_text.py`: PDF/MD/TXT/DOCX/CSV/HTML → chunked (1000 chars, 150 overlap) → stored with source metadata.

### What's missing / opportunities for sophistication

#### Tier A: High-impact graph features

**A1. Full-vault graph view**
The current graph is 1-hop only. A global graph showing all notes + edges would let users see clusters, isolated notes, and structural patterns. Implementation path: Rust-side query that returns all notes + all link edges; frontend renders with a force-directed layout (e.g. d3-force or a lightweight WebGL renderer for large vaults). Consider progressive loading — start with the current neighborhood, expand on demand.

**A2. Multi-hop traversal**
Allow expanding the neighborhood to 2-hop or N-hop. The Rust side already has the primitives (`get_backlinks`/`get_outlinks`); this is BFS/DFS from center with a depth parameter. Enables "show me everything connected within 3 hops" exploration.

**A3. Semantic similarity edges**
Use text embeddings (borrowing from the RAG approach) to surface "similar but unlinked" notes. This is the highest-value semantic feature — it turns the graph from a link-based map into a knowledge map. Implementation: embed each note's content at index time, store vectors in SQLite (via `sqlite-vec` extension) or a sidecar ChromaDB, then query nearest neighbors for any note. Display as dashed/weighted edges on the graph.

**A4. Graph clustering / community detection**
Once the full graph exists, run lightweight community detection (e.g. connected components, or Louvain on edge weights) to auto-identify topic clusters. Surface these as color-coded groups on the canvas or as a "Topics" sidebar.

#### Tier B: Semantic search integration

**B1. Vault-wide semantic search**
Port the RAG hybrid search pipeline into Carbide's Rust backend. Options:

- **sqlite-vec**: Keeps everything in one SQLite DB. Embed notes at index time (using a local model like `all-MiniLM-L6-v2` via `ort`/ONNX Runtime in Rust), store vectors alongside FTS. Hybrid search = FTS + vector ANN + RRF merge. Zero external dependencies.
- **ChromaDB sidecar**: Reuse the existing `~/src/RAG` approach. Simpler to prototype but adds a Python process dependency.
  Recommendation: `sqlite-vec` for production (local-first, single binary), ChromaDB for rapid prototyping.

**B2. "Related notes" panel**
Given a note, show top-K semantically similar notes (not just linked ones). This is the user-facing surface for A3. Could live as a tab in the existing links panel or as an overlay on the graph.

**B3. Semantic search in omnibar**
Extend the command palette / omnibar to support semantic queries, not just fuzzy filename matching. When the user types a natural-language phrase, fall back to vector search if FTS returns poor results.

#### Tier C: Advanced / future

**C1. Note embeddings for AI context**
When invoking the AI assistant, automatically retrieve the K most relevant notes as context (RAG over the vault). This makes the AI vault-aware without the user manually copying content.

**C2. Link prediction / suggestion**
"This note mentions concepts from X, Y, Z — would you like to add wiki-links?" Combine keyword extraction + embedding similarity to suggest links the user hasn't made yet.

**C3. Temporal graph / version-aware edges**
Leverage the built-in Git history to show how the graph evolved over time — when links were added/removed, which notes grew together. This is unique to a Git-native app.
