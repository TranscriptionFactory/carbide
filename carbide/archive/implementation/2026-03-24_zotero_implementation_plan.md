# Zotero Integration — Implementation Plan

Date: 2026-03-24
Status: Phases 1–5 complete. Phases 6–7 deferred indefinitely (low value — revisit only on user demand).
Depends on: `carbide/zotero.md` (strategy)

## Overview

Three tiers: Zotero Bridge (integrate), Citation.js Standalone (lightweight reimplement), Translation Server Sidecar (optional). All tiers share a single `reference` feature domain with ports-and-adapters architecture. Tiers 1 and 2 are two different port adapters for the same domain; Tier 3 adds a supplementary port.

## Data Model

### CSL JSON as Canonical Format

All tiers store references in CSL JSON — the interchange format understood by Zotero, Citation.js, citeproc-js, and Pandoc.

**Dual storage**:

1. **Per-note frontmatter** — citekey + denormalized metadata (`authors`, `year`, `title`, `doi`) in a `references` array. Enables Bases/queries via existing `BasesPort.query()` infrastructure (reads frontmatter properties from search index — no bases changes needed)
2. **Vault-level reference library** — `<vault>/.carbide/references/library.json` (array of full CSL JSON items). Source of truth for complete metadata. Annotations at `<vault>/.carbide/references/annotations/<citekey>.md`

### Core Types

```typescript
// src/lib/features/reference/types.ts

type CslItem = {
  id: string; // citekey
  type: string; // "article-journal", "book", "chapter", etc.
  title?: string;
  author?: CslName[];
  issued?: CslDate;
  DOI?: string;
  URL?: string;
  abstract?: string;
  "container-title"?: string; // journal/book title
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  [key: string]: unknown; // CSL JSON is extensible
};

type CslName = { family?: string; given?: string; literal?: string };
type CslDate = { "date-parts"?: number[][]; literal?: string };

type ReferenceLibrary = {
  schema_version: number;
  items: CslItem[];
};

type ZoteroConnectionConfig = {
  mode: "bbt" | "web_api";
  bbt_url?: string; // default: http://localhost:23119/better-bibtex/json-rpc
  api_key?: string;
  user_id?: string;
  group_id?: string;
};

type PdfAnnotation = {
  citekey: string;
  page: number;
  text: string;
  comment?: string;
  color?: string;
  type: "highlight" | "note" | "underline";
};

type ReferenceSource =
  | "zotero_bbt"
  | "zotero_web"
  | "citationjs"
  | "manual"
  | "translation_server";
```

## Feature Structure

```
src/lib/features/reference/
  index.ts
  ports.ts
  types.ts
  state/
    reference_store.svelte.ts
  domain/
    csl_utils.ts                     # author formatting, year extraction, citekey gen
    frontmatter_sync.ts              # merge reference metadata into frontmatter YAML
    annotation_to_markdown.ts        # convert PDF annotations to markdown
  application/
    reference_service.ts
    reference_actions.ts
  adapters/
    zotero_bbt_adapter.ts           # Tier 1: BBT JSON-RPC
    zotero_web_adapter.ts           # Tier 1: Zotero Web API
    citationjs_adapter.ts           # Tier 2: Citation.js in-browser
    translation_adapter.ts          # Tier 3: Translation server
    reference_tauri_adapter.ts      # Storage: Tauri IPC for library CRUD
  ui/
    citation_picker.svelte
    reference_detail.svelte
    citation_insert.svelte
    reference_settings.svelte
    annotation_viewer.svelte

src-tauri/src/features/reference/
  mod.rs
  service.rs                         # Tauri commands for library CRUD, HTTP proxying
  types.rs                           # Rust-side CSL types (serde)
```

## Port Interfaces

```typescript
// Core storage (always available, Tauri-backed)
interface ReferenceStoragePort {
  load_library(vault_id: string): Promise<ReferenceLibrary>;
  save_library(vault_id: string, library: ReferenceLibrary): Promise<void>;
  save_annotation_note(
    vault_id: string,
    citekey: string,
    markdown: string,
  ): Promise<void>;
  read_annotation_note(
    vault_id: string,
    citekey: string,
  ): Promise<string | null>;
}

// Zotero connection (Tier 1) — two adapters: BBT and Web API
interface ZoteroPort {
  test_connection(): Promise<boolean>;
  search_items(query: string, limit?: number): Promise<CslItem[]>;
  get_item(citekey: string): Promise<CslItem | null>;
  get_collections(): Promise<ZoteroCollection[]>;
  get_collection_items(collection_key: string): Promise<CslItem[]>;
  get_item_attachments(citekey: string): Promise<ZoteroAttachment[]>;
  get_item_annotations(citekey: string): Promise<PdfAnnotation[]>;
  get_bibliography(citekeys: string[], style?: string): Promise<string>;
}

// Citation processing (Tier 2) — Citation.js in-browser
interface CitationPort {
  parse_bibtex(bibtex: string): Promise<CslItem[]>;
  parse_ris(ris: string): Promise<CslItem[]>;
  lookup_doi(doi: string): Promise<CslItem | null>;
  render_citation(
    items: CslItem[],
    style: string,
    format?: "text" | "html",
  ): Promise<string>;
  render_bibliography(
    items: CslItem[],
    style: string,
    format?: "text" | "html",
  ): Promise<string>;
  list_styles(): string[];
}

// Translation server (Tier 3)
interface TranslationPort {
  test_connection(): Promise<boolean>;
  extract_from_url(url: string): Promise<CslItem[]>;
  search_identifier(identifier: string): Promise<CslItem[]>;
  export_items(items: CslItem[], format: "bibtex" | "ris"): Promise<string>;
}
```

## Service

```typescript
class ReferenceService {
  constructor(
    private storage_port: ReferenceStoragePort,
    private store: ReferenceStore,
    private vault_store: VaultStore,
    private op_store: OpStore,
    private now_ms: () => number,
    private zotero_port: ZoteroPort | null,
    private citation_port: CitationPort | null,
    private translation_port: TranslationPort | null,
  ) {}

  // Library management
  async load_library(): Promise<void>;
  async add_reference(item: CslItem, source: ReferenceSource): Promise<void>;
  async remove_reference(citekey: string): Promise<void>;
  async search_library(query: string): Promise<CslItem[]>;

  // Zotero operations (Tier 1)
  async search_zotero(query: string): Promise<CslItem[]>;
  async import_from_zotero(citekeys: string[]): Promise<void>;
  async sync_annotations(citekey: string): Promise<void>;
  async test_zotero_connection(): Promise<boolean>;

  // Citation.js operations (Tier 2)
  async import_bibtex(bibtex: string): Promise<CslItem[]>;
  async import_ris(ris: string): Promise<CslItem[]>;
  async lookup_doi(doi: string): Promise<CslItem | null>;
  async render_bibliography(citekeys: string[], style: string): Promise<string>;

  // Translation server operations (Tier 3)
  async save_url_as_reference(url: string): Promise<CslItem | null>;

  // Frontmatter integration
  async insert_citation_in_note(
    note_path: string,
    citekey: string,
  ): Promise<void>;
}
```

## Build Order and Phases

### Dependency Graph

```
Phase 1 (Storage + Types)     ← foundation, required by everything         ✅
  ↑
Phase 2 (Citation.js)         ← standalone citation processing             ✅
  ↑
Phase 3 (BBT Connection)      ← Zotero search + import                    ✅
  ↑
Phase 4a (Settings + Frontmatter) ← makes feature configurable            ✅
Phase 4b (Citation Picker)     ← makes feature usable from editor         ✅  MVP COMPLETE
  ↑
Phase 5 (Annotations)         ← post-MVP, requires BBT                    ✅
Phase 6 (Web API)             ← deferred indefinitely (narrow audience)    ✗
Phase 7 (Translation Server)  ← deferred indefinitely (high friction)      ✗
```

### Prioritization Rationale

Phases 1–3 built backend infrastructure. No user can interact with references yet — there is no UI to configure, search, or insert citations. **Phase 4 is the critical path** that turns infrastructure into a usable feature.

Phase 4 is split into two sub-phases:

- **4a** (settings + frontmatter sync) is pure logic + a settings panel — no editor integration, independently testable
- **4b** (citation picker) is the user-facing interaction that ties everything together

Phases 5–7 are post-MVP and independently valuable. They can ship in any order after Phase 4.

### Phase 1: Foundation (Storage + Types + Service Skeleton) — COMPLETE

**Status**: Committed as `25e05433`

**Deliverables**: Feature directory scaffolding, types, `ReferenceStoragePort`, Rust CRUD commands, `ReferenceStore`, basic `ReferenceService` with library management methods.

**Implementation**:

- Rust: `reference_load_library`, `reference_save_library`, `reference_add_item`, `reference_remove_item` Tauri commands. Read/write `<vault>/.carbide/references/library.json`. Dedup by citekey on add
- Store: `library_items: CslItem[]`, `search_results: CslItem[]`, `connection_status`, `selected_citekeys: string[]`
- Service: `load_library()`, `add_reference()`, `remove_reference()`, `search_library()` (in-memory filter over store)
- Wire into composition root: stores in `create_app_stores.ts`, ports in `app_ports.ts`, adapters in `create_prod_ports.ts`, service + actions in `create_app_context.ts`, Rust commands in `src-tauri/src/app/mod.rs`
- Domain: `csl_utils.ts` — `format_authors()`, `extract_year()`, `generate_citekey()`, `match_query()`
- Tests: 35 tests (store: 8, service: 7, csl_utils: 20)

**BDD Scenarios**:

- Library persistence: add item → close vault → reopen → item still present
- Duplicate prevention: add same citekey twice → library contains exactly one (updated metadata)
- Library search: query "Smith" matches items with "Smith" in author or title

### Phase 2: Citation.js Integration (Tier 2A + 2B) — COMPLETE

**Status**: Committed as `c48f9dfa`

**Deliverables**: `CitationPort`, `citationjs_adapter.ts`, BibTeX/RIS import, DOI lookup, CSL rendering.

**Dependencies**: `@citation-js/core@0.7.21`, `@citation-js/plugin-bibtex@0.7.21`, `@citation-js/plugin-ris@0.7.21`, `@citation-js/plugin-csl@0.7.22`. All MIT licensed.

**Implementation**:

- `citationjs_adapter.ts`: Implements `CitationPort` using Citation.js APIs in-browser
- `doi_tauri_adapter.ts`: Separate `DoiLookupPort` adapter — DOI lookups go through Rust backend (`reference_doi_lookup` command using `reqwest` → CrossRef API) to avoid CSP issues in Tauri webview
- `citation_js.d.ts`: Type declarations for Citation.js (no `@types` available)
- Service methods: `import_bibtex()`, `import_ris()`, `lookup_doi()`, `render_bibliography()`, `list_citation_styles()`
- Actions: `reference.import_bibtex`, `reference.import_ris`, `reference.lookup_doi`, `reference.render_bibliography`
- Tests: 44 tests (citationjs_adapter: 25, citation_service: 19)
- Note: `lookup_doi` was extracted to a separate `DoiLookupPort` (not on `CitationPort`) since it goes through Rust, not Citation.js

**BDD Scenarios**:

- Import BibTeX: 50-entry .bib file → all parsed to CslItems → added to library
- DOI lookup: valid DOI → resolves to CslItem with full metadata
- Render bibliography: 3 references in APA → formatted HTML output
- Switch style: APA → Chicago → bibliography updates

### Phase 3: Zotero BBT Connection (Tier 1A) — COMPLETE

**Status**: Committed as `858ebab4`

**Deliverables**: `ZoteroPort`, `zotero_bbt_adapter.ts`, BBT JSON-RPC proxy commands, connection testing, Zotero search + import.

**Implementation**:

- Rust: `bbt_rpc()` helper for JSON-RPC 2.0 protocol. 6 Tauri commands: `reference_bbt_test_connection`, `reference_bbt_search`, `reference_bbt_get_item`, `reference_bbt_collections`, `reference_bbt_collection_items`, `reference_bbt_bibliography`. All use `reqwest` to POST JSON-RPC to configurable BBT URL
- `ZoteroPort` interface: `test_connection`, `search_items`, `get_item`, `get_collections`, `get_collection_items`, `get_bibliography`
- `zotero_bbt_adapter.ts`: Implements `ZoteroPort` via Tauri invoke, BBT URL parameterized (default `http://localhost:23119/better-bibtex/json-rpc`)
- Service methods: `test_zotero_connection()`, `search_zotero()`, `import_from_zotero()`
- Actions: `reference.test_zotero_connection`, `reference.search_zotero`, `reference.import_from_zotero`
- Types added: `ZoteroCollection`, `ZoteroAttachment`, `PdfAnnotation`, `ZoteroConnectionConfig`
- Tests: 12 tests (connection: 4, search: 3, import: 5)

**Deferred to later phases**:

- `zotero_web_adapter.ts` (Tier 1E — Web API alternative)
- Settings UI for connection mode selection
- Rate limit handling for Web API

**BDD Scenarios**:

- Connect to BBT: Zotero + BBT running → test passes → status "connected"
- BBT not available: Zotero not running → test fails → status "disconnected"
- Search Zotero: query "smith" → results with citekeys → populates search_results
- Import from Zotero: citekeys → fetch items → merge into library with dedup

### Phase 4a: Reference Settings + Frontmatter Sync — COMPLETE

**Status**: Committed as `a83ea02b`

**Deliverables**: Reference settings in `EditorSettings` + settings catalog, `frontmatter_sync.ts` domain function with YAML library.

**Why this first**: Without settings UI, users cannot configure their Zotero connection. Without frontmatter sync, inserted citations won't be queryable via Bases.

**Implementation**:

- Settings: Added 3 vault-scoped settings to `EditorSettings` + `SETTINGS_REGISTRY`
  - `reference_enabled: boolean` (default: `false`) — enable/disable reference feature
  - `reference_bbt_url: string` (default: `http://localhost:23119/better-bibtex/json-rpc`) — BBT endpoint
  - `reference_citation_style: string` (default: `"apa"`) — default CSL citation style
  - Settings appear in "Tools" category alongside IWE/linting settings
  - "Test Connection" button deferred to Phase 4b UI (settings values are stored, action already exists from Phase 3)
- Domain function `frontmatter_sync.ts`: Two pure functions operating on YAML strings
  - `sync_reference_to_frontmatter(yaml, CslItem)` → updated YAML with `references` array containing `{citekey, authors, year, title, doi, journal}`
  - `remove_reference_from_frontmatter(yaml, citekey)` → YAML with entry removed, `references` key deleted when empty
  - Idempotent: adding same citekey twice → one entry, updated metadata
  - Preserves existing frontmatter keys
  - Uses `yaml@2.8.3` (MIT) for robust YAML parse/serialize
- Barrel exports updated: `FrontmatterReference` type, `sync_reference_to_frontmatter`, `remove_reference_from_frontmatter`
- Bases queries work automatically — references in frontmatter are queryable properties via existing `BasesPort.query()` infrastructure
- Tests: 13 tests (sync: 7, remove: 6)

**New dependency**: `yaml@2.8.3` (MIT) — YAML parser/serializer for frontmatter manipulation

**BDD Scenarios**:

- Settings: configure BBT URL → test connection → status "connected"
- Frontmatter sync: add "smith2024" to note → frontmatter has `references: [{citekey: "smith2024", ...}]`
- Frontmatter idempotent: insert same citekey twice → frontmatter contains one entry (no duplicates)
- Frontmatter removal: remove citekey → frontmatter entry removed
- Bases query: filter `references.year = 2024` → only notes citing 2024 papers appear

### Phase 4b: Citation Picker + Insert — COMPLETE

**Status**: Committed as `34a1e247`

**Deliverables**: Citation picker sidebar panel, `[@citekey]` insertion at editor cursor with frontmatter sync.

**Dependencies**: Phase 4a (frontmatter sync must exist for insert to update frontmatter).

**Implementation**:

- Sidebar view registered via `PluginService.register_sidebar_view()` with id `"references"`, `BookMarked` icon
- `citation_picker.svelte`: Search input with 250ms debounce, two-section results (Library / Zotero), connection status indicator (Plug/PlugZap icon), empty state with BookOpen icon
  - Search sources: local library (always), Zotero (when connected, deduped against local)
  - Shows full library when no search query
- Action `reference.insert_citation`: ensures item in library (auto-imports from Zotero if needed), inserts `[@citekey]` at editor cursor via `editor_service.insert_text()`, updates frontmatter via `sync_reference_to_markdown()`
- Action `reference.open_picker`: switches sidebar to `"references"` view
- Service methods: `ensure_in_library(citekey)` — returns existing or auto-imports from Zotero; `find_in_library(citekey)` — pure local lookup
- Domain: `sync_reference_to_markdown(markdown, item)` — extracts frontmatter from full markdown, syncs reference, rebuilds; `extract_frontmatter(markdown)` — parses `---` delimiters
- Composition root: `reference_service` and `reference` store exposed on `AppContext`; `editor_service` + `ui_store` passed to reference actions
- Tests: 13 tests (ensure_in_library: 4, find_in_library: 2, extract_frontmatter: 4, sync_reference_to_markdown: 3)

**BDD Scenarios**:

- Insert citation: select "smith2024" → `[@smith2024]` inserted at cursor → frontmatter updated with metadata
- Debounced search: rapid typing → single search request after debounce
- Search local + Zotero: query matches both local and remote items → combined results (Zotero deduped)
- Auto-import: select Zotero item not in library → imported to library → then inserted

### Phase 5: PDF Annotation Sync — COMPLETE

**Status**: Committed (pending)

**Deliverables**: Annotation pull from Zotero via BBT, markdown conversion with color labels and page grouping, additive merge for re-sync, annotation note storage.

**Dependencies**: Requires BBT connection (Phase 3). Independent of Phase 4.

**Implementation**:

- Extended `ZoteroPort` with `get_item_annotations(citekey: string): Promise<PdfAnnotation[]>`
- Extended `ReferenceStoragePort` with `save_annotation_note()` and `read_annotation_note()`
- Rust commands: `reference_bbt_annotations` (BBT JSON-RPC `item.notes`), `reference_save_annotation_note` (atomic write to `<vault>/.carbide/references/annotations/<citekey>.md`), `reference_read_annotation_note` (read annotation file)
- Domain functions in `annotation_to_markdown.ts`:
  - `annotations_to_markdown(annotations, citekey)` — converts `PdfAnnotation[]` to structured markdown with page sections, highlight/note/underline type labels, color names (Yellow, Red, Green, Blue, Purple, Magenta, Orange, Gray), blockquoted text, and comments
  - `merge_annotations(existing, incoming)` — additive dedup by page+text key
- Service method: `sync_annotations(citekey)` — fetches from Zotero, merges with existing, saves markdown, updates store
- Action: `reference.sync_annotations` — wired in action registry
- Store: added `annotations: PdfAnnotation[]` state field with `set_annotations()` method
- BBT adapter: `get_item_annotations()` normalizes raw BBT response to `PdfAnnotation[]` with type validation
- `annotation_viewer.svelte` deferred — annotations are stored as markdown files, viewable in editor
- Tests: 22 tests (annotation_to_markdown: 15, annotation_service: 7)

**BDD Scenarios**:

- Sync annotations: 3 highlights + 1 note → markdown file created with page-grouped entries
- Re-sync: add 2 new annotations in Zotero → re-sync → file has all, no duplicates
- Empty annotations: Zotero returns none → empty markdown saved
- Error handling: BBT unreachable → error set on store, returns empty array

### Phase 6: Zotero Web API Adapter — DEFERRED INDEFINITELY

**Status**: Deferred. Revisit only if user feedback specifically requests it.

**What it would do**: `zotero_web_adapter.ts` — alternative to BBT for users without the BBT plugin.

**Why deferred**: Narrow audience. Anyone serious enough about Zotero to want Carbide integration likely already has BBT (free, well-maintained, standard power-user plugin). The one real argument — cloud-only access without local Zotero desktop — is a thin use case for a desktop app. Adds credential management, rate limiting (429/Backoff), and a second adapter to maintain against `ZoteroPort`.

### Phase 7: Translation Server Sidecar — DEFERRED INDEFINITELY

**Status**: Deferred. Revisit only if user feedback specifically requests it.

**What it would do**: `TranslationPort`, `translation_adapter.ts`, "save URL as reference" via self-hosted Docker container.

**Why deferred**: High friction, low value. Requires users to self-host `zotero/translation-server` in Docker — steep ask for researchers/writers. The core use case (paste URL → extract metadata) is partially covered by DOI lookup (Phase 2) and manual import. Adds a third adapter + Rust proxy commands for a feature most users won't configure.

## Wiring Into Composition Root

| What                 | Where                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| Stores               | `src/lib/app/bootstrap/create_app_stores.ts`                           |
| Port types           | `src/lib/app/di/app_ports.ts`                                          |
| Adapters             | `src/lib/app/create_prod_ports.ts`                                     |
| Service + actions    | `src/lib/app/di/create_app_context.ts`                                 |
| Sidebar registration | `create_app_context.ts` (via `plugin_service.register_sidebar_view()`) |
| Rust commands        | `src-tauri/src/app/mod.rs`                                             |
| Settings UI          | `src/lib/features/settings/` — add References section                  |

## New Dependencies

**Frontend (npm)** — all MIT:

- `@citation-js/core@0.7.21`
- `@citation-js/plugin-bibtex@0.7.21`
- `@citation-js/plugin-ris@0.7.21`
- `@citation-js/plugin-csl@0.7.22`
- `yaml@2.8.3` (Phase 4a — YAML parse/serialize for frontmatter sync)

**Backend (Cargo)**: No new crates. `reqwest` (with `json` feature), `serde_json`, `serde`, `tokio` already present and sufficient.

## Test Plan

**Current: 139 tests across 10 files, all passing**

```
tests/unit/features/reference/
  csl_utils.test.ts                        # 20 tests — author formatting, year extraction, citekey gen, match_query
  reference_store.test.ts                  # 8 tests  — store mutations, selection, reset
  reference_service.test.ts                # 7 tests  — library CRUD with mock ports (9 w/ updated helpers)
  reference_citation_service.test.ts       # 19 tests — BibTeX/RIS import, DOI lookup, bibliography rendering
  citationjs_adapter.test.ts              # 25 tests — Citation.js integration (uses real lib)
  reference_zotero_service.test.ts        # 12 tests — Zotero connection, search, import
  frontmatter_sync.test.ts               # 13 tests — sync/remove references in YAML frontmatter
  insert_citation.test.ts                # 13 tests — ensure_in_library, extract_frontmatter, sync_reference_to_markdown
  annotation_to_markdown.test.ts         # 15 tests — markdown conversion, page grouping, color labels, merge dedup
  reference_annotation_service.test.ts   # 7 tests  — sync_annotations service flow with mocked ports
```

## Architecture Decision: Feature, Not Plugin

Implement as a first-party feature in `src/lib/features/reference/`, not a plugin. Rationale:

1. Deep integration with frontmatter, bases, and editor requires APIs the plugin sandbox doesn't yet expose (metadata providers, editor content transforms)
2. Plugin system is still Phase 1a; building on it adds risk
3. Can always extract into a plugin later once the plugin API is richer

The feature is **opt-in** via vault settings (`zotero_enabled`, `citation_enabled`). Sidebar panel only registers when enabled.

## Implementation Progress

| Phase | Description                  | Status   | Commit     | Tests |
| ----- | ---------------------------- | -------- | ---------- | ----- |
| 1     | Foundation (Storage + Types) | COMPLETE | `25e05433` | 35    |
| 2     | Citation.js Integration      | COMPLETE | `c48f9dfa` | 44    |
| 3     | Zotero BBT Connection        | COMPLETE | `858ebab4` | 12    |
| 4a    | Settings + Frontmatter Sync  | COMPLETE | `a83ea02b` | 13    |
| 4b    | Citation Picker + Insert     | COMPLETE | `34a1e247` | 13    |
| 5     | PDF Annotation Sync          | COMPLETE | (pending)  | 22    |
| 6     | Zotero Web API               | DEFERRED | —          | —     |
| 7     | Translation Server           | DEFERRED | —          | —     |

**Total tests: 139** (all passing)

**MVP = Phases 1–4b.** Phases 5+ are independently shippable post-MVP enhancements.

### Design Deviations from Plan

1. **`DoiLookupPort` separated from `CitationPort`** — DOI lookup goes through Rust (reqwest → CrossRef), not Citation.js in-browser. Cleaner separation of concerns since the transport is fundamentally different.
2. **`ZoteroPort` scoped incrementally** — `get_item_annotations()` added in Phase 5. `get_item_attachments()` still deferred (not needed until PDF viewer integration). Keeps the port focused on what's actually used.
3. **Web API adapter (`zotero_web_adapter.ts`) deferred** — BBT adapter covers the primary use case. Web API can reuse the same `ZoteroPort` interface when needed.
4. **Dependencies**: Used `@citation-js/core` + individual plugins instead of the monolithic `citation-js` package. More tree-shakeable, same functionality.
5. **Phase 4a scoped to settings + domain logic** — "Test Connection" button and citation style selector UI deferred to Phase 4b (when the reference sidebar panel is built). Settings values are stored via `EditorSettings`; the `test_zotero_connection` action already exists from Phase 3. Added `yaml@2.8.3` for frontmatter YAML manipulation.
6. **Phase 5: `annotation_viewer.svelte` deferred** — Annotations stored as markdown files at `<vault>/.carbide/references/annotations/<citekey>.md`, viewable directly in the editor. Dedicated viewer component deferred until there's a clear UX need beyond what the markdown view provides. BBT `item.notes` used instead of `item.attachments()` + annotation extraction — simpler and covers the primary use case.
