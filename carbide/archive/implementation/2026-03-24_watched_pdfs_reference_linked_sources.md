# Linked Sources: Watched PDF Folders → Reference Library + FTS

## Context

Users have folders of PDFs (research papers, articles) outside their vault that they want Carbide to index without copying in. This feature registers external folders as "linked sources" that:

1. Watch for file changes in real-time
2. Extract PDF metadata → auto-create CSL references in the reference library
3. Index full text into SQLite FTS for unified global search
4. Surface through the reference library view with DOI enrichment

Think Zotero's linked-file library model, but integrated into Carbide's existing reference + search infrastructure.

---

## Architecture Overview

```
External PDF Folder
        │
   ┌────▼────┐
   │  Rust   │  scan_folder, extract_pdf_metadata, extract_pdf_text
   │ Backend │  notify::Watcher → Tauri events
   └────┬────┘
        │
   ┌────▼─────────────┐
   │ LinkedSourcePort  │  (new port, Tauri adapter)
   └────┬──────────────┘
        │
   ┌────▼──────────────┐
   │ ReferenceService   │  extended with linked source methods
   │ (+ SearchService)  │  FTS indexing via existing search commands
   └────┬──────────────┘
        │
   ┌────▼──────────────┐
   │ ReferenceStore     │  linked_sources[], library_items[] (with _linked_* fields)
   └────┬──────────────┘
        │
   ┌────▼────────────────┐
   │ Reactor              │  vault open → start watchers + initial scan
   │                      │  FS events → index/unindex individual PDFs
   └─────────────────────┘
```

---

## Phase 1: Rust Backend ✅

### `src-tauri/src/features/reference/linked_source.rs`

**Commands:**

| Command                                            | Purpose                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `linked_source_scan_folder(path) → Vec<ScanEntry>` | Walk dir (max depth 3), filter `*.pdf`/`*.html`, extract metadata + text       |
| `linked_source_extract_file(path) → ScanEntry`     | Single-file metadata + text extraction (PDF or HTML)                           |
| `linked_source_watch(path)`                        | Start `notify::RecommendedWatcher`, emit `linked-source-fs-event` Tauri events |
| `linked_source_unwatch(path)`                      | Stop watcher for folder                                                        |
| `linked_source_unwatch_all()`                      | Stop all (vault close cleanup)                                                 |

**`ScanEntry` struct:**

```rust
pub struct ScanEntry {
    pub file_path: String,      // absolute
    pub file_name: String,
    pub file_type: String,      // "pdf" or "html"
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Option<String>,
    pub doi: Option<String>,
    pub creation_date: Option<String>,
    pub body_text: String,       // extracted text (for FTS)
    pub page_offsets: Vec<usize>, // page boundaries in body_text
    pub modified_at: u64,
}
```

**PDF metadata extraction:** Uses `lopdf` to read the PDF info dictionary (`/Title`, `/Author`, `/Subject`, `/Keywords`, `/CreationDate`) with UTF-16BE and Latin1 decoding. DOI: regex scan first 2 pages for `10.\d{4,}/[^\s\]>)]+`.

**HTML extraction:** Parses `<title>`, `<meta>` tags for author/description/keywords, strips HTML tags (removing `<script>`/`<style>` blocks).

**Text extraction:** Reuses existing `pdf-extract` crate with page offset tracking, 512KB limit.

**Watcher:** Managed state `LinkedSourceWatcherState` with `HashMap<String, Sender<()>>` for cancellation. Filters events to `.pdf`/`.html` files only.

### Files modified:

- `src-tauri/Cargo.toml` — added `lopdf = "0.34"`, `pdf-extract = "0.10.0"`
- `src-tauri/src/features/reference/mod.rs` — added `pub mod linked_source;`
- `src-tauri/src/app/mod.rs` — registered state + 5 commands

### Tests: 274 Rust tests pass (includes linked source extraction tests)

---

## Phase 2: Types + Port + Adapter (TypeScript) ✅

### `src/lib/features/reference/types.ts`

```typescript
type LinkedSource = {
  id: string; // crypto.randomUUID()
  path: string; // absolute folder path
  name: string; // user label
  enabled: boolean;
  last_scan_at: number | null;
};

type ScanEntry = {
  file_path: string;
  file_name: string;
  file_type: string;
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  doi: string | null;
  creation_date: string | null;
  body_text: string;
  page_offsets: number[];
  modified_at: number;
};

type LinkedSourceFsEvent = {
  type: "added" | "removed" | "modified";
  folder_path: string;
  file_path: string;
};
```

**CslItem convention fields** (stored via existing `[key: string]: unknown` index sig):

- `_linked_source_id: string` — which source this came from
- `_linked_file_path: string` — absolute path to the file
- `_linked_file_modified_at: number` — for change detection
- `_source: "linked_source"` — reference source discriminator

### `LinkedSourcePort` in `src/lib/features/reference/ports.ts`

```typescript
interface LinkedSourcePort {
  scan_folder(path: string): Promise<ScanEntry[]>;
  extract_file(path: string): Promise<ScanEntry>;
  watch(path: string): Promise<void>;
  unwatch(path: string): Promise<void>;
  unwatch_all(): Promise<void>;
  subscribe_events(cb: (event: LinkedSourceFsEvent) => void): () => void;
  index_content(
    vault_id: string,
    source_id: string,
    entry: ScanEntry,
  ): Promise<void>;
  remove_content(
    vault_id: string,
    source_id: string,
    file_path: string,
  ): Promise<void>;
  clear_source(vault_id: string, source_id: string): Promise<void>;
}
```

### Adapter: `src/lib/features/reference/adapters/linked_source_tauri_adapter.ts`

Standard Tauri `invoke()` wrapper + `listen()` for watcher events. FTS methods route to search service commands.

### DI wiring:

- `src/lib/app/di/app_ports.ts` — `linked_source: LinkedSourcePort`
- `src/lib/app/di/create_prod_ports.ts` — instantiates adapter

---

## Phase 3: FTS Integration ✅

### Strategy: `source` column on `notes` table + synthetic path convention

Added `source TEXT DEFAULT 'vault'` column to the `notes` table via migration in `db.rs`.

- Vault files: `source = 'vault'`, `path` = vault-relative (default behavior, unchanged)
- Linked files: `source = 'linked:<source_id>'`, `path` = `linked:<source_id>/<filename>`

This gives **unified FTS search for free** — the existing search query hits both vault and linked content. The `source` column enables cleanup (remove all entries for a source) and filtering.

### Rust changes

**model.rs:** Added `source: Option<String>` to `IndexNoteMeta` (with `#[serde(default, skip_serializing_if)]`). Search results now carry the source through to the frontend.

**db.rs — new functions:**

| Function                  | Purpose                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `upsert_linked_content()` | Creates synthetic path `linked:<id>/<filename>`, inserts into `notes` + `notes_fts` with source = `linked:<id>` |
| `remove_linked_content()` | Removes a single linked file entry by synthetic path                                                            |
| `clear_linked_source()`   | Removes all entries for a source via `remove_notes_by_prefix`                                                   |

**db.rs — modified:** `upsert_plain_content` now writes the `source` column from `IndexNoteMeta.source`. `search()` query now selects `n.source` and populates it on the returned `SearchHit.note`.

**service.rs — new DbCommand variants:**

| Variant               | Purpose                             |
| --------------------- | ----------------------------------- |
| `UpsertLinkedContent` | Index linked file content into FTS  |
| `RemoveLinkedContent` | Remove single linked file from FTS  |
| `ClearLinkedSource`   | Remove all FTS entries for a source |

**service.rs — new Tauri commands:**

| Command                        | Signature                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `linked_source_index_content`  | `(vault_id, source_id, file_path, title, body, page_offsets, file_type, modified_at)` |
| `linked_source_remove_content` | `(vault_id, source_id, file_path)`                                                    |
| `linked_source_clear_source`   | `(vault_id, source_id)`                                                               |

All commands route through the existing search DB worker thread for thread safety.

### TypeScript changes

**`NoteMeta`** (shared type): Added `source?: string | undefined`.

**`LinkedSourcePort`**: Added `index_content()`, `remove_content()`, `clear_source()` methods.

**`linked_source_tauri_adapter.ts`**: Implements FTS methods via Tauri invoke.

**`reference_service.ts`**:

- `scan_linked_source()`: After bulk CSL merge, clears then re-indexes all entries into FTS
- `index_linked_pdf()`: Also calls `index_content()` for FTS (best-effort)
- `unindex_linked_pdf()`: Also calls `remove_content()` for FTS cleanup (best-effort)
- `remove_linked_source()`: Calls `clear_source()` when removing references

### app/mod.rs: Registered 3 new search commands

---

## Phase 4: Domain Logic + Store ✅

### `src/lib/features/reference/domain/linked_source_utils.ts`

```typescript
function scan_entry_to_csl_item(entry: ScanEntry, source_id: string): CslItem;
function derive_title_from_filename(path: string): string;
function parse_author_string(author: string): CslAuthor[];
function generate_linked_source_id(): string;
```

- Type mapping: pdf → "article", html → "webpage"
- Unique citekey generation via file path hashing
- Camel case aware title derivation from filenames

### `ReferenceStore` extensions

New state:

```typescript
linked_sources = $state<LinkedSource[]>([]);
linked_source_sync_status = $state<
  Record<string, "idle" | "scanning" | "error">
>({});
```

Mutations: `set_linked_sources`, `add_linked_source`, `remove_linked_source`, `update_linked_source`, `set_linked_source_sync_status`

Derived: `get_linked_source_items(source_id)`, `get_all_linked_items()`

### Tests: `tests/unit/features/reference/linked_source_utils.test.ts`

---

## Phase 5: Service Methods ✅

### `ReferenceService` extensions

Constructor takes `linked_source_port: LinkedSourcePort | null`.

| Method                                     | What it does                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `load_linked_sources()`                    | Read from vault settings, populate store                                |
| `save_linked_sources()`                    | Persist to vault settings                                               |
| `add_linked_source(path, name)`            | Create config, save, start watcher, trigger scan                        |
| `remove_linked_source(id, remove_refs)`    | Stop watcher, remove config, optionally remove refs + clear FTS entries |
| `toggle_linked_source(id)`                 | Toggle enabled, start/stop watcher accordingly                          |
| `scan_linked_source(id)`                   | Full folder scan → bulk upsert refs + FTS index, async DOI enrichment   |
| `index_linked_pdf(source_id, file_path)`   | Single file: extract → add ref + FTS entry                              |
| `unindex_linked_pdf(source_id, file_path)` | Remove ref + FTS entry                                                  |
| `start_linked_source_watchers()`           | Subscribe to FS events, start watchers for enabled sources              |
| `stop_linked_source_watchers()`            | Stop all watchers, unsubscribe events                                   |

**DOI enrichment flow:** After scan, collect entries with DOIs. Batch `lookup_doi()` calls (max 5 concurrent via `Promise.allSettled`). Merge CrossRef CSL data into existing items, preserving `_linked_*` fields. Non-blocking — UI shows extracted metadata immediately, updates when DOI resolves.

**Unavailable folder:** `scan_linked_source` catches FS errors, sets sync status to `"error"`. UI shows warning. Watcher failures logged but don't crash.

---

## Phase 6: Reactor ✅

### `src/lib/reactors/linked_source_sync.reactor.svelte.ts`

Watches `vault_store.vault`:

- **Vault open:** `load_linked_sources()` → `start_linked_source_watchers()` → `scan_linked_source()` for each enabled source
- **Vault close:** `stop_linked_source_watchers()` → reset state

FS event routing via `linked_source_port.subscribe_events()`:

- `added` → `index_linked_pdf()`
- `removed` → `unindex_linked_pdf()`
- `modified` → `index_linked_pdf()` (re-index)

### Wired into: `src/lib/reactors/index.ts` via `mount_reactors()`

---

## Phase 7: Actions + UI ✅

### Actions in `reference_actions.ts`

| Action ID                           | Trigger                                   |
| ----------------------------------- | ----------------------------------------- |
| `reference.add_linked_source`       | Folder picker → `add_linked_source()`     |
| `reference.remove_linked_source`    | Confirm dialog → `remove_linked_source()` |
| `reference.scan_linked_source`      | Force rescan single source                |
| `reference.scan_all_linked_sources` | Force rescan all                          |
| `reference.toggle_linked_source`    | Toggle enabled state                      |

### UI Components

**`src/lib/features/reference/ui/linked_source_manager.svelte`**

- List of linked sources with name, path, status badge (scanning/error/idle), item count
- Add/remove/toggle/rescan controls
- Empty state when no sources
- Integrated into citation picker

**`citation_picker.svelte`** — Linked items show link icon badge

---

## Files Summary

### Created

| File                                                                 | Purpose                             |
| -------------------------------------------------------------------- | ----------------------------------- |
| `src-tauri/src/features/reference/linked_source.rs`                  | Rust: scan, metadata, text, watcher |
| `src/lib/features/reference/domain/linked_source_utils.ts`           | Pure domain: ScanEntry → CslItem    |
| `src/lib/features/reference/adapters/linked_source_tauri_adapter.ts` | Tauri adapter                       |
| `src/lib/features/reference/ui/linked_source_manager.svelte`         | Manage linked folders               |
| `src/lib/reactors/linked_source_sync.reactor.svelte.ts`              | Auto-sync reactor                   |
| `tests/unit/features/reference/linked_source_utils.test.ts`          | Domain tests                        |

### Modified

| File                                                          | Change                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| `src/lib/features/reference/types.ts`                         | Add LinkedSource, ScanEntry, extend ReferenceSource             |
| `src/lib/features/reference/ports.ts`                         | Add LinkedSourcePort (incl. FTS methods)                        |
| `src/lib/features/reference/state/reference_store.svelte.ts`  | Add linked source state                                         |
| `src/lib/features/reference/application/reference_service.ts` | Add linked source methods + FTS integration                     |
| `src/lib/features/reference/application/reference_actions.ts` | Register 5 actions                                              |
| `src/lib/features/reference/ui/citation_picker.svelte`        | Linked item badge                                               |
| `src/lib/app/di/app_ports.ts`                                 | Add LinkedSourcePort to Ports                                   |
| `src/lib/app/di/create_prod_ports.ts`                         | Wire adapter                                                    |
| `src/lib/app/di/create_app_context.ts`                        | Pass port to service, register reactor                          |
| `src/lib/reactors/index.ts`                                   | Add linked source reactor                                       |
| `src/lib/shared/types/note.ts`                                | Add `source` field to NoteMeta                                  |
| `src-tauri/src/features/reference/mod.rs`                     | Add linked_source module                                        |
| `src-tauri/src/features/search/db.rs`                         | Add `source` column, linked content CRUD, search returns source |
| `src-tauri/src/features/search/model.rs`                      | Add `source` to IndexNoteMeta                                   |
| `src-tauri/src/features/search/service.rs`                    | 3 new DbCommand variants + 3 Tauri commands for linked FTS      |
| `src-tauri/src/app/mod.rs`                                    | Register state + 8 commands                                     |
| `src-tauri/Cargo.toml`                                        | Add `lopdf`, `pdf-extract`                                      |
| `tests/adapters/test_ports.ts`                                | Add FTS stubs to test linked source port                        |

---

## Verification

1. **Unit tests:** Domain utils (metadata→CSL conversion, author parsing, title derivation) — all pass
2. **Rust tests:** PDF metadata extraction, DOI regex, folder scan, file classification, HTML parsing — 274 tests pass
3. **TypeScript:** svelte-check passes (0 errors), 2503/2504 tests pass (1 pre-existing failure unrelated)
4. **Manual testing:**
   - Add folder via UI → all PDFs indexed, references visible in citation picker
   - Drop new PDF in watched folder → appears within ~2s
   - Remove PDF → reference removed
   - Search for text inside a linked PDF → result appears with linked badge
   - DOI found → reference auto-enriched with CrossRef metadata
   - Folder unavailable → error badge shown, no crash
   - Disable source → watcher stops, entries remain
   - Re-enable → rescan, watcher restarts

## Remaining Work

- **Search result UI badges:** Surface `source` field in omnibar/search results to show linked source indicator
- **Click-to-open:** Clicking a linked PDF search result should open it in the document viewer via `carbide-asset://` or Tauri shell open
- **Source filter in citation picker:** "All" | "Library" | per-linked-source filtering
- **Service tests:** `tests/unit/features/reference/linked_source_service.test.ts` (planned but not yet created)
- **Store tests:** `tests/unit/features/reference/linked_source_store.test.ts` (planned but not yet created)
