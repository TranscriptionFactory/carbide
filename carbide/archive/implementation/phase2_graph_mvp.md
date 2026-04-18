# Phase 2 Implementation: Graph MVP

This document defines the first native Carbide graph implementation.

## Goal

Ship a useful graph MVP early without waiting for full Bases maturity, while keeping the implementation aligned with Badgerly's slice architecture.

## What to borrow from Lokus

Primary donor files:

- `src/core/graph/GraphDataProcessor.js`
- `src/core/graph/GraphDatabase.js`
- `src/features/graph/hooks/useGraphEngine.js`

Borrow:

- staged graph build pipeline
- batch processing ideas
- incremental note-content updates
- phantom or unresolved link handling
- cheap graph stats and neighborhood exploration

Do not borrow:

- React hook ownership model
- graph state inside a broad editor layout store
- workspace bootstrap assumptions

## Current Carbide seams

Relevant existing files:

- `src/lib/features/links/state/links_store.svelte.ts`
- `src/lib/features/links/application/links_service.ts`
- `src/lib/features/search/ports.ts`
- `src/lib/features/search/adapters/workspace_index_tauri_adapter.ts`
- `src-tauri/src/features/search/db.rs`
- `src-tauri/src/features/search/service.rs`

Current reality:

- Carbide already has local links, backlinks, and outlinks
- search and indexing already own an SQLite cache and outlink tables
- there is no dedicated graph slice yet

## MVP shape

### Frontend

Create a new `graph` feature slice:

- `src/lib/features/graph/ports.ts`
- `src/lib/features/graph/state/graph_store.svelte.ts`
- `src/lib/features/graph/application/graph_service.ts`
- `src/lib/features/graph/application/graph_actions.ts`
- `src/lib/features/graph/adapters/graph_tauri_adapter.ts`
- `src/lib/features/graph/ui/graph_panel.svelte`
- `src/lib/features/graph/ui/graph_canvas.svelte`
- `src/lib/features/graph/index.ts`

### Backend

Add a dedicated `graph` read surface in Rust.

Recommended shape:

- `src-tauri/src/features/graph/mod.rs`
- `src-tauri/src/features/graph/service.rs`
- `src-tauri/src/features/graph/types.rs`

The graph feature should read from existing search DB data instead of inventing a second persisted graph store.

If shared queries need to live in `search/db.rs`, that is fine. But the frontend-facing command surface should be graph-specific.

## State ownership

`GraphStore` should own:

- current graph mode or scope
- loaded snapshot
- selected node ids
- hovered node id
- filter state
- loading and error state
- whether the graph UI is visible and what note it is centered on

Do not put graph state into `LinksStore`, `TabStore`, or any generic layout store.

## Service ownership

`GraphService` should own:

- load graph snapshot for active vault
- load neighborhood for a note
- refresh graph after index changes
- focus graph on active note
- apply filters to the loaded snapshot

## Port ownership

`GraphPort` should expose read-only operations such as:

- `load_graph_snapshot(vault_id, options)`
- `load_note_neighborhood(vault_id, note_path, depth)`
- `refresh_graph(vault_id)` if explicit refresh is needed

Avoid mixing graph-specific API into `SearchPort` unless there is a compelling reason.

## UI scope for MVP

The MVP should stay narrow.

Ship:

- note nodes only
- link edges only
- local neighborhood focus
- active note focus action
- simple filters if they are cheap and useful
- a few cheap stats if they are legible

Defer:

- graph-as-everything visualizations
- large style systems for nodes
- expensive centrality calculations unless they remain cheap and useful
- cross-vault or multi-root behavior

## Data flow

### Initial path

1. backend reads note and outlink data from the existing search DB
2. graph service returns a graph snapshot
3. `GraphService` writes it into `GraphStore`
4. UI renders from `GraphStore`
5. actions trigger note open, focus active note, or graph refresh

### Update path

Use existing index lifecycle instead of direct editor coupling.

Preferred approach:

- graph reloads after index events or explicit refresh actions
- later, add neighborhood-level incremental refresh if it remains clean

Do not couple graph rendering directly to editor transaction streams on day one.

## Integration points

### Frontend composition root

Update:

- `src/lib/app/bootstrap/create_app_stores.ts`
- `src/lib/app/di/app_ports.ts`
- `src/lib/app/create_prod_ports.ts`
- `src/lib/app/di/create_app_context.ts`

### Layout and actions

Likely touch points:

- `src/lib/app/bootstrap/ui/workspace_layout.svelte`
- command palette definitions under search
- note or editor actions for "focus in graph"

## Tests

- graph store tests
- graph service tests with mocked graph port
- backend tests for graph snapshot queries over representative link data
- UI interaction tests for node selection and note open actions

## Definition of done

Graph MVP is done when:

- a dedicated graph slice exists
- graph data is loaded through a graph-specific port and adapter
- the graph uses existing link and index foundations instead of inventing a second graph database
- the UI is useful on real vaults without violating architecture boundaries
