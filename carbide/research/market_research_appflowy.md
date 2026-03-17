# AppFlowy — Carbide Research Notes

> Source: `/Users/abir/src/KBM_Notes/AppFlowy/frontend/`
> AppFlowy is an open-source Notion alternative built with Flutter/Dart + Rust backend.
> Research focus: patterns, algorithms, and designs portable to Carbide (Tauri + Svelte + ProseMirror).

---

## 1. Editor Architecture

### What AppFlowy does

AppFlowy uses a **custom block-based editor** (`appflowy_editor` package), not a traditional markdown or WYSIWYG editor. The document is a tree of typed blocks — each block has a unique ID, a type, and delta-based rich text content within it. Changes go through a **transaction system**: mutations are batched into `EditorTransaction` objects and applied atomically.

Block types are registered via a **plugin/builder system**. Each block type provides:

- A component builder (`BlockComponentBuilder`)
- Actions (context menus, toolbar items)
- Hover menus and placeholder logic

There are 58+ editor plugin directories covering: paragraphs, headings, lists, code, tables, math, images, videos, embeds, mentions, outlines, columns, AI writer, slash menu, copy/paste, and shortcuts.

### Contrast with Carbide

Carbide uses **Milkdown/ProseMirror** as a WYSIWYG markdown editor. The schema is node/mark-based rather than block-ID-based. This is a fundamental design difference — ProseMirror's schema is more constrained but also more compositional for collaborative editing tools.

**Key takeaway:** AppFlowy's block-ID system (every block has a stable unique ID) enables deep linking, back-references, block-level history, and stable sub-page navigation. Carbide could consider block-level anchoring for wiki-link resolution without relying on heading text stability.

### Portable patterns

| Pattern                        | AppFlowy                                                | Carbide applicability                                                     |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Stable block IDs               | Every block has UUID; enables deep links and references | Useful for block-level wiki-links (`[[Note#blockid]]`) and history        |
| Transaction batching           | Mutations staged then applied atomically                | Carbide already does this via ProseMirror transactions                    |
| Type-dispatch plugin system    | Each block type owns its rendering/editing logic        | Already reflected in Carbide's Milkdown node plugins; reinforce isolation |
| Delta-based text within blocks | Quill delta for inline formatting                       | ProseMirror marks serve the same role                                     |
| Custom paste handlers          | Markdown/HTML → block tree conversion                   | Carbide needs this for pasting rich content from external sources         |

---

## 2. Database / Grid Views (Bases)

### What AppFlowy does

AppFlowy's "database" is a multi-view collection: the same data can be viewed as **Grid** (spreadsheet), **Board** (Kanban), or **Calendar**. The architecture:

- `DatabaseController` owns field, row, filter, sort, and group state.
- `DatabaseViewCache` holds in-memory rows indexed by ID.
- Changes propagate through a **callback system**: `OnFieldsChanged`, `OnRowsCreated`, `OnFiltersChanged`, etc.
- Field types: Text, Number, Date, Single/Multi Select, Checkbox, Checklist, Relation, URL.
- Cell editing is type-dispatched — each field type provides its own editor widget and service.
- Filtering, sorting, and grouping are first-class: dedicated service objects per concern.

**Board view** groups rows by a Select field. Drag-and-drop reorders within groups and reassigns group membership.

**Calendar view** groups rows by a Date field. Each event is a database row.

### Contrast with Carbide

Carbide's **Bases** feature (Phase 3B) is a filtered, sorted table view over the vault's metadata index (SQLite `note_properties` and `note_tags`). It is closer to AppFlowy's Grid view on a fixed schema (notes as rows, frontmatter keys as columns). Carbide does **not** currently have:

- Board/Kanban view
- Calendar view
- Multi-select field type (in editor — exists in sidebar tags)
- Relation/linked-record fields
- Checklist fields with progress
- Per-row editing as a standalone document

### Portable patterns

**Board view for Bases:** AppFlowy's board groups rows by a select field. For Carbide, a Kanban board over notes grouped by a frontmatter property (e.g., `status: todo/in-progress/done`) would be very high-value. The implementation is: render group columns, each group lists matching rows, drag moves the row and updates the frontmatter field.

**Calendar view for Bases:** Group notes by a date frontmatter field (e.g., `date`, `due`). Each note appears as an event on that day. Click opens the note.

**Relation field:** AppFlowy supports linking rows across databases. For Carbide, this maps to wiki-links between notes as a "first-class" field type in the Bases table — click a relation cell and navigate to the linked note.

**Checklist field:** Progress-tracking list within a cell. In Carbide context: a note's task list (`- [ ] item`) could be summarized as a checklist field in Bases, showing `3/5 done`.

**Type-dispatch cell editors:** AppFlowy keeps each field type's rendering/editing isolated. Carbide's Bases currently uses generic input fields. Adding a date picker, multi-select pill editor, and checkbox toggle per-cell-type would match AppFlowy quality.

**View persistence:** AppFlowy stores per-view settings (field visibility, filter, sort, grouping) as JSON in the view's metadata. Carbide stores `.base` files for this — same concept, already implemented.

---

## 3. Workspace / Space / View Hierarchy

### What AppFlowy does

Three-level hierarchy:

1. **Workspace** — top-level container (one per user/team)
2. **Space** — organizational grouping within workspace (akin to "section" or "project")
3. **View** — individual document, database, chat, etc.; can be nested recursively

Views carry metadata: emoji/icon, cover image, pinned status, timestamps, parent ID. Views of type `document` are rich text; views of type `grid/board/calendar` are database layouts over the same underlying data.

Favorites and recent-views are tracked separately for quick access.

### Contrast with Carbide

Carbide uses a flat vault (folder on disk, Obsidian-compatible). The file tree is the hierarchy. No explicit "spaces" — folders serve this role.

**Takeaway:** Carbide's vault-as-folder model is simpler and more portable (POSIX files). AppFlowy's space model is richer but requires a proprietary backend. No action needed here; Carbide's model is intentionally Obsidian-compatible.

**Worth borrowing:** Favorites/pinned notes as a first-class concept at the sidebar level, distinct from recent files. AppFlowy tracks these separately; Carbide currently surfaces recents but has no pinning.

---

## 4. AI Integration

### What AppFlowy does

- **AI Writer block**: An editor block type that generates content inline. The block renders a prompt input; on submit it streams generated text into the document.
- **AI Writer toolbar item**: Selected text → context menu → "Improve writing", "Make longer", etc. Sends selection as context, applies streamed diff.
- **AI Chat plugin**: Full standalone chat page with history, file attachment for context, page selection (which vault pages to include as RAG context).
- **Model selector**: Users pick backend model from a dropdown in the AI panel.
- **Streaming**: All AI responses are streamed progressively into the UI.

### Contrast with Carbide

Carbide has an AI assistant panel (context rail) with Claude/Codex/Ollama backends, diff-first review with partial apply, CLI-backed execution, and edit/ask mode toggle.

**Gaps vs AppFlowy:**

| Feature                           | AppFlowy                                      | Carbide                                              |
| --------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Inline AI writer block            | Yes — `/ai` slash command inserts an AI block | Not yet — AI is panel-only                           |
| Selection → AI rewrite (in-place) | Yes — toolbar item on selection               | Not yet                                              |
| RAG context from vault pages      | Yes — user picks pages to include             | Not yet                                              |
| Streaming into editor             | Yes                                           | Not yet (partial apply is batch)                     |
| Model selector in UI              | Yes                                           | Exists (configurable default, no per-session picker) |

**Highest-value AI port for Carbide:**

1. **Inline AI block** (`/ai` slash command that inserts a prompt area; Ctrl+Enter generates into the doc). Already a natural extension of Carbide's slash command infrastructure.
2. **Selection rewrite** (select text → floating toolbar → "Improve" → streamed in-place replacement). Requires detecting non-empty selection and showing a toolbar item.
3. **Vault-page context** (let user attach specific notes as context for AI queries — attach a note file path, read its content into the prompt).

---

## 5. Plugin System

### What AppFlowy does

Two distinct plugin layers:

**View plugins** (high-level): Each view type (document, grid, board, calendar, chat) is a registered plugin with a `PluginBuilder` that produces a `Plugin` with a `PluginWidgetBuilder`. The plugin registry (`PluginSandbox` via `get_it`) maps view layout types to builders. Plugins have `init()`/`dispose()` lifecycle.

**Editor plugins** (low-level): Each block type inside a document is also a plugin: a `BlockComponentBuilder` that renders and handles interactions for one block type. 58+ such plugins registered at editor initialization.

### Contrast with Carbide

Carbide's plugin system (`Phase 8`) is user-facing: third-party plugins discovered from `<vault>/.carbide/plugins/` via `manifest.json`, sandboxed in iframes, with a `postMessage` RPC bridge. It is primarily an **extensibility surface for users**, not an architectural pattern for internal features.

AppFlowy uses its plugin pattern **internally** for first-party feature isolation (each view type is a plugin). This is more like a service-locator architecture than a sandboxed user extension.

**Takeaway for Carbide:** The internal plugin pattern (each view type registers itself) could improve Carbide's architecture for adding new panel types (e.g., future JSON Canvas view, new Bases view modes). Currently Carbide adds new view types via ad-hoc conditional rendering. A small `ViewTypeRegistry` where each view type self-registers its renderer and actions would scale better.

**User-facing plugin improvements from AppFlowy:**

- TypeScript SDK (`@carbide/plugin-api`) — AppFlowy doesn't have a public SDK either; this is still a gap.
- Hot-reload in dev mode — AppFlowy also doesn't do this; low priority.
- Proper load/unload — both have stubs; worth implementing together.

---

## 6. Collaboration / Sync

### What AppFlowy does

AppFlowy supports real-time collaboration:

- **Awareness metadata**: Per-user cursor position, color, selection range. Broadcast via sync layer.
- **Collaborator avatar stack**: Shows active users' avatars at top of document.
- **Three sync versions**:
  - V1: Full reload (dev only)
  - V2: Delta-based ops (partial)
  - V3: Diff-based (current production)
- **Document collab adapter** (`document_collab_adapter.dart`): Applies remote changes to local `EditorState`.
- Protobuf-serialized `DocEventPB` events from Rust backend.

### Contrast with Carbide

Carbide does not target real-time collaboration. Git-based async sync is the model. No awareness or CRDT infrastructure.

**Takeaway:** No direct port needed. However, the **diff-based sync approach** (V3) is interesting for future consideration: computing a diff between saved and current doc state, then applying it as a ProseMirror transaction. This is relevant if Carbide ever adds external-editor detection and live reload.

---

## 7. Outline / Table of Contents

### What AppFlowy does

AppFlowy has an **Outline block** — a special block type that scans the document tree for heading nodes and renders them as a linked list. It is a **document block** that can be inserted anywhere, not a sidebar panel. Clicking a heading scrolls to it.

### Contrast with Carbide

Carbide has an `OutlinePanel.svelte` in the right sidebar that extracts h1–h6 from ProseMirror state with live updates (300ms debounce), click-to-scroll, active heading tracking, and a floating mode. This is equivalent in functionality.

**Worth adding:** AppFlowy's inline `/outline` block — inserting a live table of contents _inside_ the note itself. This is a natural Milkdown node (custom NodeView that renders the current heading list). Useful for long technical notes.

---

## 8. Column Layout

### What AppFlowy does

AppFlowy supports **multi-column layouts** via a "Columns" block. It creates two or more side-by-side containers, each of which can hold any block type. Column widths are independently resizable.

The implementation is a special block type (`ColumnBlock`) that renders a horizontal `Row` of child column containers. Each column is itself a block with children.

### Contrast with Carbide

Carbide has no column layout support. Milkdown/ProseMirror can support this via a custom schema node (`columns` → `column*` → any block content), but it requires careful markdown serialization (which has no native column syntax).

**Recommendation:** Defer. Column layout breaks Obsidian-compatible markdown unless stored as custom HTML comments or a div block. Not worth the complexity for current priorities.

---

## 9. Toggle / Collapsible Blocks

### What AppFlowy does

AppFlowy has **Toggle List** blocks — a block with a disclosure triangle that collapses/expands its children. Equivalent to Notion's toggle. Stored as a block with `collapsed: bool` attribute and child blocks as its content.

### Contrast with Carbide

Carbide does not have collapsible/toggle blocks. Milkdown's `details/summary` nodes would be the entry point.

**Recommendation:** Medium priority. Markdown spec has `<details>/<summary>` HTML that Obsidian also supports. A `ToggleBlock` Milkdown plugin with `/toggle` slash command would render as `<details>` in source mode and be compatible with Obsidian vaults.

---

## 10. Cover Images

### What AppFlowy does

Each view (document) can have a **cover image** — a banner at the top of the document. Stored as view metadata, not inside the document body. Supports: solid colors, gradients, local images, and unsplash images.

### Contrast with Carbide

No cover image support. Could be stored as frontmatter (`cover: path/to/image.png`) and rendered as a special header NodeView above the editor content.

**Recommendation:** Low priority unless we target a "Notion-like" aesthetic. Frontmatter-driven implementation is feasible if desired.

---

## 11. Emoji Picker / Icon System

AppFlowy uses a rich emoji/icon picker for documents and fields. Icons are stored as view metadata.

Carbide already has emoji shortcodes (`:emoji:` expansion) in the editor. A document-level emoji/icon (shown in file tree and tabs) is not implemented. This maps to storing an emoji in frontmatter (`icon: 🦦`) and reading it in the file tree.

---

## 12. Recycle Bin / Trash

AppFlowy has a soft-delete Trash bin. Deleted views go to Trash and can be restored.

Carbide does not have this. Git history serves as a recovery mechanism. Soft-delete would require a different file lifecycle model.

**Recommendation:** Not needed. Git-backed recovery is sufficient and more powerful.

---

## 13. Find & Replace

AppFlowy has a find-and-replace plugin in the editor (keyboard shortcut opens a floating bar with match highlighting and replace-all).

Carbide does not have find-and-replace in the editor pane (only in the terminal via the shell, and in file search via the omnibar).

**Recommendation:** **High value**. In-editor find (`Cmd+F`) with match highlighting and optional replace (`Cmd+H`) is a standard expectation. ProseMirror has `prosemirror-search` (maintained) or it can be implemented as a plugin that decorates match ranges.

---

## 14. Mentions / Linked Mentions

AppFlowy supports `@` mentions for:

- Pages (inserts a link to another document)
- Users (for collaboration notifications)
- Dates (inserts a date reference)

Carbide already has:

- Wiki-links (`[[Note]]`) for page references
- `@`-trigger date link auto-suggest (inserts `[[YYYY-MM-DD]]` wiki links)

No user mentions are needed (single-user app).

---

## 15. Inline Database / Sub-page

AppFlowy supports **inline databases** — a database view embedded within a document as a block. Also supports **sub-pages** — a document nested within another document, shown as a block that expands inline.

These require block-ID-based addressing and backend persistence separate from the file system. Not compatible with Carbide's flat-file vault model without significant redesign.

**Recommendation:** Not feasible in current architecture. The vault-as-files model makes inline databases and sub-pages complex. Bases as a top-level view (already implemented) is the right abstraction for Carbide.

---

## Priority Recommendations for Carbide

Ranked by value vs implementation effort, based on Carbide's current state and TODO list:

### High priority (fill clear gaps vs AppFlowy)

1. **In-editor find & replace** (`Cmd+F` / `Cmd+H`)
   - `prosemirror-search` package or custom decoration plugin
   - Floating bar UI, match count, navigate matches, optional replace
   - No backend changes needed

2. **Inline AI writer block** (`/ai` slash command)
   - Milkdown node that renders a prompt input
   - On submit: calls existing AI backend, streams result into document
   - Reuses existing `ai` feature slice

3. **Selection → AI rewrite toolbar**
   - Floating toolbar item on text selection: "Improve", "Summarize", "Make shorter"
   - Uses selected text as prompt context, replaces selection with result
   - Natural extension of existing AI integration

4. **Board/Kanban view for Bases**
   - Group notes by a frontmatter field (e.g., `status`)
   - Drag card → update frontmatter, write note file
   - High perceived value for task/project notes

### Medium priority

5. **Toggle/collapsible blocks** (`/toggle` slash command)
   - Milkdown node rendering as `<details><summary>...</summary>...</details>`
   - Obsidian-compatible via HTML passthrough
   - Low complexity: 1 new node type + 1 slash command

6. **Calendar view for Bases**
   - Group notes by a date frontmatter field on a calendar grid
   - Existing `note_properties` index already stores date fields
   - Reuse `@fullcalendar/svelte` or similar

7. **Pinned / starred notes** in sidebar
   - Store pinned note paths in vault settings
   - Show pinned section at top of sidebar above recents
   - AppFlowy's favorites pattern: first-class metadata, not a tag

8. **Inline `/outline` block** (table of contents block)
   - Custom Milkdown node that renders heading list from current doc
   - Supplement (not replace) the existing outline sidebar panel

### Lower priority / defer

9. **Multi-column layout** — markdown incompatibility, complex serialization
10. **Cover images** — cosmetic; frontmatter-driven if ever needed
11. **Checklist cell type in Bases** — auto-aggregate `- [ ]` task counts from notes
12. **Real-time collaboration** — out of scope for Carbide's single-user model

---

## Summary

AppFlowy is more feature-rich but architecturally heavier (Flutter, proprietary backend, block-ID tree). Carbide's Obsidian-compatible flat-file model is the right constraint. The clearest gaps AppFlowy reveals are:

- **Find & Replace** in editor (universal expectation, not yet in Carbide)
- **Inline AI** (AppFlowy has it; Carbide's AI is panel-only)
- **Board/Calendar views** on top of the existing Bases metadata infrastructure
- **Toggle blocks** for collapsible content

These are all buildable within Carbide's existing architecture without breaking vault compatibility.

---

## 16. Backend Architecture: What AppFlowy's Stack Gets Right

> This section evaluates AppFlowy's technical backend patterns (block-ID tree, protobuf+FFI, Rust collab crate) for applicability to Carbide, given that Carbide is not bound by any legacy constraints and targets extensibility, efficiency, and flexibility. The hard constraint remains: markdown files on disk, Obsidian-compatible, human-readable. AppFlowy's CRDT storage format is explicitly rejected — that is the format problem.

### 16.1 Shared parsed AST in Rust

AppFlowy's collab crate holds a structured document tree as the authoritative representation in Rust. Carbide's Rust backend is a file I/O layer — it reads/writes `.md` bytes and delegates all structure to ProseMirror on the frontend.

The gap: every Rust feature that needs document structure (`search`, `bases`, `graph`, `tags`, `pipeline`, `links`) either reparses markdown independently or receives pre-parsed data pushed from the frontend. These features almost certainly each implement their own string/regex markdown parsing rather than sharing a single AST.

**Recommendation:** A shared `markdown_doc` internal crate (using `comrak` or `pulldown-cmark`) that parses markdown into a structured AST, consumed by all Rust backend features. ProseMirror stays authoritative for _editing_. Rust owns the parsed representation for _backend operations_. This eliminates redundant parsing and creates a single upgrade point for parser improvements.

### 16.2 Richer SQLite schema — index the AST, not just frontmatter

AppFlowy's `DatabaseViewCache` indexes typed fields per row. Carbide's SQLite index (`note_properties`, `note_tags`, FTS5) is flat: frontmatter key/value pairs and raw text. This is a ceiling for Bases query expressiveness and search result quality.

Tables worth adding, all derived from the shared AST (#16.1):

| Table           | Columns                                          | Enables                                                                           |
| --------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `note_headings` | `note_path, level, text, char_offset`            | Heading deep links, outline search, section-level FTS                             |
| `note_blocks`   | `note_path, block_type, content, position`       | "Find all code blocks", task count summaries in Bases, block-level search results |
| `note_links`    | `source_path, target_path, link_text, link_type` | Proper relation table for backlinks, orphan detection, graph queries              |

The `graph` and `links` features would benefit immediately from `note_links` being a real relation table rather than a re-scanned wikilink search.

### 16.3 Event-driven incremental index invalidation

AppFlowy propagates changes via typed callbacks (`OnRowsCreated`, `OnFiltersChanged`, etc.). Carbide has a `watcher` feature detecting filesystem changes. The risk is that post-detection behavior re-indexes more than necessary, or that the index update is disconnected from the save path.

The target model: the watcher emits a typed `NoteChanged { path, change_kind }` event; a pipeline handler processes only that note; SQLite is updated incrementally. No polling, no full-vault re-index on change. This mirrors AppFlowy's callback pattern adapted to Carbide's file-based model.

### 16.4 Type-safe IPC schema (protobuf's benefit, without protobuf)

AppFlowy uses protobuf because Dart↔Rust has no shared type system. Tauri provides Rust↔TypeScript — and `tauri-specta` generates TypeScript types directly from Rust structs. If Carbide isn't already using `tauri-specta`, this is the highest-leverage zero-cost improvement: generated types make the IPC boundary as type-safe as AppFlowy's protobuf schema, with no serialization overhead and no separate schema language.

### 16.5 Atomic save → parse → index pipeline

The structural shift worth seriously evaluating: make the Rust file-write handler also own the AST parse and index update, atomically.

Current model:

```
ProseMirror edit → markdown serialized → IPC → Rust writes file
                                                      (index update: separate, possibly async, possibly polling)
```

Target model:

```
ProseMirror edit → markdown serialized → IPC → Rust handler
                                                    │
                                   ┌────────────────┼────────────────┐
                                   │                │                │
                               write file       parse AST       update SQLite
                              (current)          (new)          (incremental)
```

The index update and the file write share the same handler and the same parsed AST. No separate polling loop. No stale index window between save and re-index. This is the core of what AppFlowy gets right architecturally — Rust is the integration point, not a dumb file writer — adapted to Carbide's markdown-first constraints.

### 16.6 What to explicitly not adopt

| AppFlowy pattern                                | Reason to skip                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| CRDT collab crate (y-crdt)                      | Breaks markdown storage; this is the format problem                                  |
| Block-ID tree as document storage format        | IDs embedded in `.md` files destroy readability and Obsidian compatibility           |
| Full block-ID tree in Rust as editing authority | Duplicates ProseMirror, requires bidirectional sync, high complexity for single-user |
| Protobuf for IPC                                | `tauri-specta` gives equivalent type safety with less ceremony                       |
| Awareness / cursor collaboration metadata       | Single-user app; irrelevant                                                          |

### Implementation priority

1. **`tauri-specta` for typed IPC** — one-time setup, immediate type safety across the entire IPC boundary
2. **Shared `comrak`-based AST parser** used by all Rust features — eliminates redundant parsing, single upgrade point
3. **Richer SQLite schema** (`note_headings`, `note_blocks`, `note_links`) with incremental update on save
4. **Atomic save → parse → index handler** — eliminates the stale-index window and any polling-based re-index

---

## 17. Frontend Architecture: What AppFlowy's Stack Gets Right

> This section evaluates AppFlowy's frontend patterns (BlockComponentBuilder system, BLoC state, type-dispatch cell editors) for applicability to Carbide's Svelte 5 + ProseMirror/Milkdown frontend. Findings are grounded in Carbide's actual codebase: 30+ PM plugins in `editor/adapters/`, `EditorStore` state shape, and `bases/ui/` structure.

### 17.1 Editor extension contribution points model

Carbide has 30+ individual ProseMirror plugin files in `editor/adapters/`. Each is ad-hoc — a slash command plugin looks nothing like a toolbar plugin or a keymap plugin. There is no shared interface. Adding a new block type requires knowing to touch multiple unrelated files.

AppFlowy's `BlockComponentBuilder` gives each block type a single registration point declaring all its contributions. The Carbide equivalent is an `EditorExtension` interface:

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

### 17.2 PM selection state in EditorStore

`EditorStore` holds `selection`, `cursor`, and `cursor_offset` — projected from ProseMirror via callbacks in `milkdown_adapter.ts`. This creates two sources of truth: ProseMirror's authoritative `state.selection` and a Svelte store mirror. They stay in sync only as long as every mutation path fires the callback correctly.

AppFlowy keeps document/editing state strictly inside the editor's state machine. Only coarse-grained signals are projected to the app layer.

The right question for Carbide: does any Svelte component actually _need_ `selection` from the store, or is all selection-sensitive behaviour (floating toolbar visibility, format mark states, word count) already handled inside ProseMirror plugins? If the answer is mostly the latter, the store projection is unnecessary coupling. Floating toolbars in particular should be driven by PM plugin state — not a Svelte store — to avoid races between the two update cycles.

**Recommendation:** Audit consumers of `editor_store.selection` and `cursor_offset`. Move selection-sensitive UI logic into PM plugins where possible. Retain store projection only for cross-feature consumers (e.g. status bar word/line count) that genuinely cannot live inside a PM plugin.

### 17.3 Milkdown's role is ambiguous at this point

With 30+ raw PM plugins and `create_milkdown_editor_port` as the primary integration surface, Milkdown is functioning as an initialization harness — schema presets and markdown serialization — rather than as an active plugin framework. The codebase is already operating at the raw ProseMirror level for almost all extensions. `LARGE_DOC_CHAR_THRESHOLD` / `LARGE_DOC_LINE_THRESHOLD` in `milkdown_adapter.ts` suggest there are performance-sensitive paths where raw PM control already matters.

This is not a problem today, but it becomes one when adding complex new block types: the choice of whether to build against Milkdown's plugin API or raw PM affects API surface, upgrade coupling, and how much of Milkdown's internals you need to understand.

**Recommendation:** Make an explicit decision before the next complex block type (toggle, inline AI). Either: (a) commit to raw PM for all new extensions and treat Milkdown as a thin init layer only, or (b) verify Milkdown's plugin API can handle the required complexity without fighting it. Avoid mixing both approaches further.

### 17.4 Type-dispatch cell editors for Bases

Confirmed: `bases/ui/` contains only `bases_panel.svelte` and `bases_table.svelte`. There are no per-field-type cell editor components. AppFlowy's pattern here is directly applicable: each field type (date, boolean, single-select, number, text) renders its own editor component rather than a generic input. A `CellEditor` component that switches on field type and renders the appropriate widget is pure UI work — no backend changes required.

**Recommendation:** Before adding new Bases field types, introduce a `CellEditor` dispatch component. Date fields get a date picker; booleans get a toggle; select fields get a pill dropdown. This should be implemented alongside the Bases board/calendar views (section 2) since those views also require typed cell rendering.

### 17.5 ViewTypeRegistry (confirmed missing)

Carbide's different view types (editor, bases, canvas, graph) are wired via ad-hoc conditional rendering at the layout level — there is no self-registration pattern. As noted in section 5, a `ViewTypeRegistry` where each view type registers its renderer, toolbar contributions, and action handlers would scale better as Kanban and Calendar views are added.

This is lower priority than 17.1 and 17.4 but should be in place before a third Bases view mode is implemented.

### 17.6 What to explicitly not adopt from AppFlowy's frontend

| AppFlowy pattern                 | Reason to skip                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Flutter widget tree / BLoC state | Svelte 5 runes are equivalent and better suited to a webview context                    |
| Custom block-ID delta editor     | ProseMirror's schema model is more compositional; replacing it would be a full rewrite  |
| Dart `get_it` service locator    | Carbide's DI via store instantiation in `create_app_stores()` is cleaner for this scale |
| Per-document collab adapter      | Single-user; no collaborative state to reconcile                                        |

### Implementation priority

1. **`EditorExtension` contribution interface** — define interface, migrate 30 existing plugins; prerequisite for toggle/inline-AI blocks
2. **Audit and reduce PM state in EditorStore** — remove `selection`/`cursor_offset` projection where Svelte components don't genuinely need it
3. **`CellEditor` type-dispatch for Bases** — per-field-type editor components before new field types are added
4. **Milkdown vs raw PM decision** — architecture decision before the next complex block type
5. **ViewTypeRegistry** — before a third Bases view mode
