# Phase 3 Implementation: Metadata and Bases

This document defines the metadata and Bases architecture that later graph features, tasks, and advanced views will depend on.

## Goal

Build a structured metadata layer carefully enough that it becomes shared infrastructure rather than another competing subsystem.

## Donor references from Lokus

Use as semantic donors:

- `src/bases/core/BaseSchema.js`
- `src/bases/query/QueryExecutor.js`
- `src/bases/data/FrontmatterParser.js`
- `src/bases/data/index.js`

Use as anti-pattern warnings:

- `src/bases/BasesContext.jsx`
- `.lokus/bases`
- `window.__WORKSPACE_PATH__`

## Core decision

### In-file YAML is the source of truth

Metadata is stored strictly as standard YAML frontmatter at the top of each Markdown document.
- Preserves ecosystem portability (Obsidian, GitHub, Hugo).
- Keeps data synchronized perfectly with standard file syncing tools.
- Visual editing is handled via a frontend widget; the backend only reads/indexes standard `.md` files without requiring sidecar files.

### Metadata indexing lives beside search, not beside the frontend

Use the existing search SQLite cache path as the home for metadata indexing.

Reason:

- search already owns SQLite indexing
- search already owns note path and outlink extraction
- search already owns index rebuild and sync behavior
- metadata should be another derived index, not a new persisted truth source

### Bases gets its own product surface

Metadata storage can live beside search internals. The Bases product surface should still be explicit.

Recommended split:

- metadata extraction and storage extend `src-tauri/src/features/search/`
- Bases query commands and types live in a dedicated `src-tauri/src/features/bases/` feature
- frontend gets a dedicated `bases` slice

## Backend plan

### Phase 3A: Metadata index

Primary Rust files:

- `src-tauri/src/features/search/db.rs`
- `src-tauri/src/features/search/service.rs`

Add:

- frontmatter parsing in the existing extraction path
- normalized property tables in the SQLite cache
- incremental update logic on note upsert, rename, and delete

Suggested tables:

- `note_properties`
- `note_tags`
- optionally `note_headings` if Bases or metadata views need them early

Principles:

- properties are derived from Markdown
- updates must remain incremental
- rename and delete flows must clean indexes correctly
- metadata does not become its own authoritative store

### Phase 3B: Bases query surface

Add:

- `src-tauri/src/features/bases/mod.rs`
- `src-tauri/src/features/bases/service.rs`
- `src-tauri/src/features/bases/types.rs`

This feature should expose read-only query operations over the metadata index, including:

- list available properties
- query rows with filters, sort, and pagination
- return basic stats for a result set where useful

## Frontend plan

### Phase 3A: Properties Widget (Visual Frontmatter)

Provide a premium, interactive widget to view and edit YAML frontmatter without forcing the user to manage raw YAML text in Visual mode.

Create a new editor plugin and UI:
- `src/lib/features/editor/ui/frontmatter_widget.svelte`: The visual UI component showing a key-value grid (text inputs, pill-based tags, boolean toggles, date pickers).
- `src/lib/features/editor/adapters/frontmatter_plugin.ts`: A Milkdown plugin using `remark-frontmatter` to intercept the YAML block and render the Svelte NodeView.
- Update `src/lib/features/editor/adapters/milkdown_adapter.ts` to register the plugin.

Principles:
- **Two-way sync:** Edits in the Svelte widget dispatch ProseMirror transactions to update the hidden YAML text seamlessly.
- **Source mode fallback:** If the user switches to Source Mode, the widget hides and reveals the raw `---` fences.
- **Graceful degradation:** If the YAML is severely malformed, show an error state and reveal the raw text box for manual fixing.

### Phase 3B: Bases slice

Create a dedicated Bases slice:

- `src/lib/features/bases/ports.ts`
- `src/lib/features/bases/state/bases_store.svelte.ts`
- `src/lib/features/bases/application/bases_service.ts`
- `src/lib/features/bases/application/bases_actions.ts`
- `src/lib/features/bases/adapters/bases_tauri_adapter.ts`
- `src/lib/features/bases/ui/bases_panel.svelte`
- `src/lib/features/bases/ui/bases_table.svelte`
- `src/lib/features/bases/ui/bases_list.svelte`
- `src/lib/features/bases/index.ts`

## State ownership

`BasesStore` should own:

- active view mode
- query definition for the current view
- available properties
- current result set
- pagination state
- loading and error state

Do not put Bases view state into `SearchStore` or `UIStore` unless it is purely visual shell state.

## Query model

Start small.

Ship first:

- property equality and contains filters
- basic numeric and date comparisons where typing is clear
- sort by one or more properties
- table and list views
- pagination

Defer:

- gallery unless it is clearly cheap and useful
- charts and complex visualization modes
- expression languages that are hard to test and explain

## `.base` files

`.base` definitions are optional for the first useful implementation.

Recommended order:

1. ship typed runtime-defined Bases queries and table or list views
2. add `.base` persistence only after the query and view model stabilizes

If `.base` files are added, they should be:

- schema-first
- easy to diff
- easy to validate
- not a second metadata source

## Integration points

### Frontend

Update:

- `src/lib/app/bootstrap/create_app_stores.ts`
- `src/lib/app/di/app_ports.ts`
- `src/lib/app/create_prod_ports.ts`
- `src/lib/app/di/create_app_context.ts`

### Backend

Update:

- `src-tauri/src/features/mod.rs`
- `src-tauri/src/app/mod.rs`

## Tests

### Metadata index

- frontmatter parsing tests
- SQLite schema tests
- incremental update tests for create, modify, rename, delete
- property normalization tests

### Properties Widget (Frontend)

- Milkdown frontmatter parsing and NodeView mounting
- Two-way sync: Svelte component updates dispatch correct ProseMirror transactions
- Malformed YAML fallback behavior

### Bases

- query execution tests
- pagination and sorting tests
- frontend store and service tests
- UI tests for table and list rendering on representative data

## Definition of done

This phase is done when:

- metadata is indexed through the existing search-backed cache path
- Bases has a dedicated feature surface on the frontend
- property queries are deterministic and test-covered
- graph and later task work can reuse the metadata index instead of rebuilding it
