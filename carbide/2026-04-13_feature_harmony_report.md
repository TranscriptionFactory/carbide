# Feature Harmony Report: Links, Bases, Tasks, Tags, Graph, Search & LSP

**Date:** 2026-04-13
**Author:** opencode (AI-assisted analysis)
**Scope:** Review of links, bases, tasks, tags, graph, and vector/semantic search implementations and their interaction with LSP systems

---

## Executive Summary

The carbide app has **six** feature domains — **links**, **bases**, **tasks**, **tags**, **graph**, and **search** — that exhibit significant functional overlap and unclear boundaries. The primary source of creep is that **bases has become a de facto unified query layer** that subsumes the query capabilities of tags, tasks, and parts of search. Meanwhile, the **search feature** is far more than "search" — it is the central data infrastructure hub powering embeddings, HNSW vector indexing, hybrid search, smart link rules, and tag extraction. **LSP (Language Server Protocol)** is tightly coupled to links for backlink discovery but otherwise operates orthogonally. Three separate query interfaces exist, duplicate type definitions are scattered across features, two distinct task systems coexist without integration, and the graph feature consumes from nearly every other feature simultaneously.

This report maps the current state, identifies overlap zones, and proposes a path to harmonization.

---

## 1. Current Architecture Map

### 1.1 Feature Summary

| Feature | What It Claims To Do | What It Actually Does |
|---|---|---|
| **links** | Backlinks, outlinks, link repair | Backlinks via LSP `references()`, local link extraction from markdown, semantic/smart link suggestions, link repair on rename/move |
| **bases** | Property-based database views over notes | Full SQL query engine over tags, tasks, properties, content (FTS), and note metadata with filter/sort/pagination/saved-views |
| **tasks** | Inline markdown checkbox tasks | Extract `- [ ]` items from notes, store in SQLite, query/filter/group, 3 view modes (list/kanban/schedule), plus a separate `task_list` feature for standalone JSON checklists |
| **tags** | Hierarchical tag browsing | Thin wrapper over `note_inline_tags` table: list tags, get notes for tag/prefix, render tree UI |
| **graph** | Visual network of note relationships | Neighborhood view (SVG), full vault graph (Pixi.js + d3-force in Web Worker), search graph (hybrid search + subgraph extraction), semantic edges, smart-link edges |
| **search** | Full-text and semantic search | FTS (BM25), hybrid search (RRF merge of FTS + vector), omnibar, semantic similarity via HNSW, embedding generation (Snowflake Arctic Embed XS, 384d, Metal GPU), tag extraction, smart link rules engine |
| **graph** | Visual network of note relationships | Neighborhood view (SVG), full vault graph (Pixi.js + d3-force in Web Worker), search graph (hybrid search + subgraph extraction), semantic edges, smart-link edges |
| **search** | Full-text and semantic search | FTS (BM25), hybrid search (RRF merge of FTS + vector), omnibar, semantic similarity via HNSW, embedding generation (Snowflake Arctic Embed XS, 384d, Metal GPU), tag extraction, smart link rules engine |

### 1.2 LSP Landscape

Three LSP features exist:

- **`markdown_lsp`** — Markdown language intelligence (IWES or Marksman providers). Powers hover, completion, rename, diagnostics, code actions, and critically **backlinks via `references()`**.
- **`code_lsp`** — Code fence language servers (pyright, rust-analyzer, etc.). Per-language session management.
- **`lsp`** (unified) — Aggregated UI layer for code actions and diagnostics from both sources.

Shared infrastructure: `RestartableLspClient` (Rust) handles JSON-RPC over stdio with auto-retry. Document sync reactors bridge editor state to LSP `didOpen`/`didChange`/`didSave`/`didClose`.

### 1.3 Data Layer

All features share a single SQLite database (`~/.carbide/caches/vaults/{vault_id}.db`) with tables:
- `notes`, `notes_fts` — core metadata + full-text search
- `note_inline_tags` — tags (frontmatter + inline `#tag`)
- `note_properties` — frontmatter key-value pairs
- `tasks` — extracted checklist items
- `note_links`, `outlinks` — extracted and resolved links
- `note_embeddings` — note-level 384d vectors (binary blob)
- `block_embeddings` — section-level vectors with content hashes
- `embedding_meta` — model version, dimensions
- `note_headings`, `note_sections`, `note_code_blocks` — structural metadata
- `property_registry` — aggregated property metadata

**In-memory HNSW index** (per vault, in worker threads):
- `note_index` — note-level vectors, keyed by path
- `block_index` — block-level vectors, keyed by `"{path}\0{heading_id}"`
- Parameters: M=16, 16 layers, ef_construction=200, ef_search=dynamic
- Stale entry tracking with >30% threshold triggering rebuild

---

## 2. Overlap Analysis

### 2.1 HIGH SEVERITY: Bases Subsumes Tags and Tasks

The `query_bases()` function (~260 lines in `src-tauri/src/features/search/db.rs`) is a mega-query that:

- Filters by **tags** via `note_inline_tags` subquery
- Filters by **task aggregations** via LEFT JOIN on `tasks` table (task_count, tasks_done, tasks_todo, next_due_date)
- Filters by **content** via FTS subquery on `notes_fts`
- Filters by **properties** via `note_properties` subquery
- Filters by **note metadata** (title, path, mtime, outlink_count)
- Returns **tags per row** in results
- Returns **task stats per row** in results

**Concrete redundancy:**

| User Goal | Via Tags Feature | Via Bases | Via Query Language |
|---|---|---|---|
| Find notes with tag `#rust` | `tags_get_notes_for_tag()` | `bases_query({filter: {property: "tag", value: "rust"}})` | `with:#rust` |
| Find notes with tasks | N/A | `bases_query({filter: {property: "task_count", operator: "gt", value: "0"}})` | N/A |
| Find notes by content | N/A | `bases_query({filter: {property: "content", operator: "matches", value: "term"}})` | `with:"term"` |

All three paths hit the same underlying tables but return different result shapes, have different UI contexts, and maintain separate filter/query type definitions.

### 2.2 HIGH SEVERITY: Three Overlapping Query Interfaces

1. **`search_notes()`** — FTS-based search, the original query path
2. **`bases_query()`** — Property/tag/task/content SQL query engine
3. **Query language** (`query_solver.ts`) — Structured query with `named:`, `with:`, `in:`, `linked_from:`, `with_property:` clauses

The query solver delegates to both search and bases as backends:
```typescript
type QueryBackends = {
  search: SearchPort;
  index: WorkspaceIndexPort;
  tags: TagPort;
  bases: BasesPort;
};
```

But `bases.query()` already handles what `tags` does. The `resolve_with_property()` function delegates to `backends.bases.query()`, creating a layering issue where the query solver treats tags and bases as peers when bases is actually a superset.

### 2.3 MEDIUM SEVERITY: Two Task Systems

| Aspect | `task` Feature | `task_list` Feature |
|---|---|---|
| Storage | SQLite `tasks` table (extracted from markdown) | JSON files in `.carbide/task_lists/` |
| Purpose | Inline `- [ ]` checkboxes in notes | Standalone named checklists |
| Status type | `TaskStatus` enum (Rust): `Todo | Doing | Done` | `TaskListItemStatus` type (TS): `"todo" | "doing" | "done"` |
| Integration | None with task_list | None with task |

These serve different purposes but share concepts (status, due dates) with zero integration. A task_list item cannot reference a note task, and vice versa.

### 2.4 MEDIUM SEVERITY: Links Depends on LSP + Search

The `LinksService` has dependencies on:
- `MarkdownLspPort` — for backlink discovery via `references()`
- `SearchPort` — for semantic similarity, smart suggestions, link rewriting
- `MarkdownLspStore` — for status gating

This is reasonable coupling, but it means the links feature is not self-contained. The backlinks panel's data source switches between LSP (when running) and search index (fallback), creating potential inconsistency.

### 2.5 MEDIUM SEVERITY: Tags Feature is a Thin Pass-Through

The tags feature has no unique domain logic. Every operation is a direct database query:
- `list_all_tags()` → `SELECT tag, COUNT(*) FROM note_inline_tags GROUP BY tag`
- `get_notes_for_tag()` → `SELECT DISTINCT path FROM note_inline_tags WHERE tag = ?`
- `get_notes_for_tag_prefix()` → `SELECT DISTINCT path FROM note_inline_tags WHERE tag = ? OR tag LIKE ?/%`

Tags are extracted, stored, and queried entirely by the search feature. The tags feature exists only as a UI browsing surface and a query backend for the query solver.

### 2.6 MEDIUM SEVERITY: Graph Consumes from Every Feature

The graph feature is a **cross-cutting consumer** that pulls data from links, search, and embeddings:

| Graph Element | Data Source | Feature Owned By |
|---|---|---|
| Wiki-link edges | `extract_local_links()` parsing markdown | **links** feature domain function |
| Semantic edges | `search_port.semantic_search_batch()` on HNSW index | **search** feature |
| Smart-link edges | `search_port.compute_smart_link_vault_edges()` via rules engine | **search** feature (smart_links module) |
| Search subgraph | `hybrid_search()` hits + vault graph merge | **search** + **graph** |
| Node expansion | `find_similar_notes()` via HNSW KNN | **search** feature |
| Smart link rule labels | `shared_tag` rule reads `note_inline_tags` | **tags** data, served through **search** |

The graph has three view modes (neighborhood, vault, hierarchy) plus a search graph variant, each with its own store, actions, and rendering pipeline. The vault graph alone uses a three-layer architecture: Web Worker (d3-force), Pixi.js (WebGL renderer), and Svelte (orchestration). This is the most complex rendering feature in the app, yet its data is entirely derived from other features.

**Scope creep indicator:** The graph feature has its own `search_graph_store.svelte.ts` (multi-instance, keyed by tab_id), `search_graph_actions.ts` (8 actions), and dedicated canvas components — essentially a parallel feature within a feature.

### 2.7 HIGH SEVERITY: Search Feature is a Mega-Feature, Not Just Search

The "search" feature is the central data infrastructure hub. Beyond FTS and semantic search, it owns:

| Capability | Used By | Location |
|---|---|---|
| FTS search (`search_notes`) | Query solver, omnibar, bases | `search/db.rs` |
| Hybrid search (RRF merge) | Omnibar fallback, search graph | `search/hybrid.rs` |
| Embedding generation | Auto on-save, batch sync, full rebuild | `search/embeddings.rs` |
| HNSW vector index | `find_similar_notes`, semantic edges, smart links | `search/hnsw_index.rs` |
| Tag extraction & queries | Tags feature, bases, smart links | `search/db.rs` (`extract_tags`, `list_all_tags`, etc.) |
| Smart link rules engine | Links suggestions, graph edges | `smart_links/rules.rs` |
| Note property listing | Bases feature | `search/db.rs` (`list_all_properties`) |
| Base query engine | Bases feature | `search/db.rs` (`query_bases`) |
| Task extraction | Tasks feature | `search/service.rs` (regex extraction on upsert) |

The search feature's `service.rs` is the largest single file in the Rust backend. It orchestrates embedding pipelines, worker threads, FTS indexing, vector search, hybrid search, tag sync, task extraction, and the bases query engine. This is not a "search" feature — it is the **data indexing and retrieval layer** for the entire application.

### 2.8 MEDIUM SEVERITY: Vector/Semantic Search is Everywhere but Owned Nowhere

Semantic similarity is used by:
- **Links** — `find_similar_notes()` for suggested links
- **Graph** — semantic edges between vault nodes, search graph boost
- **Search** — hybrid search fallback (RRF merge), omnibar
- **Smart links rules** — `semantic_similarity` rule (weight 0.6), `block_semantic_similarity` rule (weight 0.5)

Yet there is no single `SemanticSearchService` or `VectorService`. The capability lives inside the search feature's `service.rs` and is exposed through individual `SearchPort` methods. The embedding pipeline (model loading, on-save embedding, batch sync, rebuild) is tightly coupled to the search indexing pipeline, making it impossible to use embeddings without also going through the search feature.

### 2.6 LOW SEVERITY: Duplicate Type Definitions

Structurally identical types defined separately:

| Type 1 | Type 2 | Location |
|---|---|---|
| `BaseFilter { property, operator, value }` | `TaskFilter { property, operator, value }` | Rust: `model.rs` vs `tasks/types.rs` |
| `BaseQuery { filters, sort, limit, offset }` | `TaskQuery { filters, sort, limit, offset }` | Rust: `model.rs` vs `tasks/types.rs` |
| `BaseSort { property, descending }` | `TaskSort { property, descending }` | Rust: `model.rs` vs `tasks/types.rs` |
| `NoteStats` (Rust) | `NoteStats` (TypeScript) | Cross-runtime duplication |
| `IndexNoteMeta` (Rust) | `NoteMeta` (TypeScript) | Cross-runtime duplication |

---

## 3. LSP Integration Map

### 3.1 How LSP Powers Each Feature

| Feature | LSP Dependency | LSP Method Used | Purpose |
|---|---|---|---|
| **links** | `markdown_lsp` | `references(vault_id, note_path, 0, 0)` | Backlink discovery — finds all wiki-links pointing to a note |
| **links** | `markdown_lsp` | `completion()` | Not directly used; trigger characters stored in store |
| **bases** | None | — | Operates entirely through SQLite |
| **tasks** | None | — | Task extraction via regex in Rust, not LSP |
| **tags** | None | — | Tag extraction via regex in Rust, not LSP |

### 3.2 LSP Reactor Interactions

Four reactors manage LSP lifecycle and document sync:

1. **`markdown_lsp_lifecycle`** — Starts/stops markdown LSP based on vault, settings, provider. Defers IWES start until note open (lazy). Periodically refreshes IWE transforms.
2. **`lsp_document_sync`** — Generic multi-client sync. Watches `editor_store.open_note` for path changes (open/close) and dirty state (change). Used by markdown_lsp.
3. **`code_lsp_document_sync`** — Watches `document_store.content_states` for code files.
4. **`code_lsp_lifecycle`** — Stops code LSP on vault close.

**Critical observation:** The links feature's backlinks are entirely dependent on markdown_lsp being in `"running"` state. The `create_backlinks_sync_reactor` watches `markdown_lsp_store.status` and only loads when LSP is ready. If LSP fails to start, backlinks silently fall back to stale or empty data.

### 3.3 LSP Provider Resolution

The markdown LSP supports two providers:
- **IWES** (Intelligent Writing Engine) — preferred, supports transforms (ai_rewrite, ai_summarize, etc.)
- **Marksman** — fallback when IWES binary resolution or preflight fails

Provider resolution happens in Rust (`provider.rs`), with cloud-backed vaults getting shorter init timeouts (10s vs 30s).

---

## 4. Root Causes of Scope Creep

### 4.1 Bases Started Small, Grew Organically

The bases feature was likely conceived as "Notion-style database views for notes" — a table/list UI with property filters and saved views. But because it queries the shared SQLite database, it naturally accumulated:
- Tag filtering (because tags are in the DB)
- Task filtering (because tasks are in the DB)
- Content search (because FTS is in the DB)
- Task stats in results (because the JOIN was convenient)

Each addition was individually reasonable, but collectively they made bases a superset.

### 4.2 No Query Abstraction Boundary

There is no single "query service" that owns the contract for "find notes matching criteria." Instead:
- The search feature owns FTS queries
- The bases feature owns property/tag/task SQL queries
- The tags feature owns tag-specific queries
- The tasks feature owns task-specific queries
- The query solver orchestrates across all of them

This means any feature that needs to "find notes" must choose which backend to call, and different features make different choices.

### 4.3 Feature Boundaries Defined by UI, Not Domain

The tags feature exists because there's a tag panel UI. The tasks feature exists because there's a tasks panel UI. But the underlying data and query capabilities are shared. This creates the illusion of separation where none exists at the data layer.

### 4.4 Search Feature Owns Too Much

The "search" feature name is misleading — it is actually the **data indexing and retrieval layer**. It owns:
- Embedding generation (ML model loading, inference, HNSW index management)
- Tag extraction and storage
- Task extraction
- Property indexing
- FTS indexing
- The bases SQL query engine
- The smart link rules engine

This means any feature that needs indexed data (tags, tasks, properties, embeddings, similarity) must go through "search," creating a bottleneck that violates the port-adapter principle. The search feature is not a peer of tags, tasks, or bases — it is their infrastructure provider.

### 4.5 Graph is Pure Derivative State

The graph feature computes zero original data. Every node and edge is derived from:
- Wiki-links (from links feature's `extract_local_links`)
- Semantic similarity (from search feature's HNSW index)
- Smart link rules (from search feature's rules engine)
- Search hits (from search feature's hybrid search)

The graph is a **visualization layer** over data owned by other features, yet it has its own store, service, actions, adapters, domain logic, and 13+8 actions. Its complexity is entirely in rendering (Pixi.js, Web Worker, spatial indexing, LOD, cluster hulls), not in data ownership.

### 4.4 Search Feature Owns Too Much

The "search" feature name is misleading — it is actually the **data indexing and retrieval layer**. It owns:
- Embedding generation (ML model loading, inference, HNSW index management)
- Tag extraction and storage
- Task extraction
- Property indexing
- FTS indexing
- The bases SQL query engine
- The smart link rules engine

This means any feature that needs indexed data (tags, tasks, properties, embeddings, similarity) must go through "search," creating a bottleneck that violates the port-adapter principle. The search feature is not a peer of tags, tasks, or bases — it is their infrastructure provider.

### 4.5 Graph is Pure Derivative State

The graph feature computes zero original data. Every node and edge is derived from:
- Wiki-links (from links feature's `extract_local_links`)
- Semantic similarity (from search feature's HNSW index)
- Smart link rules (from search feature's rules engine)
- Search hits (from search feature's hybrid search)

The graph is a **visualization layer** over data owned by other features, yet it has its own store, service, actions, adapters, domain logic, and 13+8 actions. Its complexity is entirely in rendering (Pixi.js, Web Worker, spatial indexing, LOD, cluster hulls), not in data ownership.

---

## 5. Recommendations for Harmonization

### 5.1 Rename Search to IndexService (Priority: High)

The "search" feature should be renamed to **`index`** or **`data_layer`** to reflect its actual role. It is not a search feature — it is the indexing and retrieval infrastructure. Its responsibilities should be:
- Embedding generation and HNSW index management
- FTS indexing and querying
- Tag extraction and storage
- Task extraction and storage
- Property indexing
- Smart link rules engine (as a pure computation layer)

The bases SQL query engine should be extracted into the QueryService (see 5.2). The search feature becomes purely about "index data and provide retrieval APIs."

### 5.2 Establish a Single Query Abstraction (Priority: High)

Create a **`QueryService`** that owns all note-finding operations. Internal backends:
- `fts_backend` — content search (from index/search feature)
- `vector_backend` — semantic similarity via HNSW (from index/search feature)
- `property_backend` — property/tag/task filtering (migrated from bases SQL)
- `link_backend` — link-based queries (from links/search)
- `tag_backend` — tag prefix queries (from index/search feature)

External surface:
- Single `query(criteria)` method accepting a unified query object
- All features (bases panel, tags panel, tasks panel, search omnibar, graph) use this service
- The query language (`query_solver.ts`) becomes the user-facing syntax that compiles to the unified query object

This eliminates the three separate query interfaces and makes bases, tags, and tasks **consumers** of the query service rather than independent query engines.

### 5.3 Redefine Bases as a View Layer (Priority: High)

Bases should be **only** a saved-view UI over query results:
- Remove `query_bases()` SQL mega-query from Rust
- Bases panel calls `QueryService.query()` with its filter/sort/pagination
- Saved views persist the query criteria + view mode (table/list)
- Bases owns the table/list UI, column configuration, and view persistence
- No bases-specific types for filters/sorts — use the unified query types

This reduces bases from ~500 lines of Rust + ~700 lines of TypeScript to ~200 lines of TypeScript (UI + view persistence).

### 5.4 Fold Tags into QueryService (Priority: Medium)

The tags feature should become:
- A **UI browsing surface** only (tag tree panel)
- A **query backend** for tag prefix resolution (folded into QueryService's tag_backend)
- No separate `TagPort` — tag queries go through `QueryService.query({with: "#tag"})`
- Tag extraction, storage, and indexing remain in the index feature (where they belong)

The tag panel becomes a specialized view that calls `QueryService.query()` when a tag is selected, rather than having its own dedicated backend calls.

### 5.5 Unify Task Systems (Priority: Medium)

Merge `task` and `task_list` into a single task domain:
- Unified `Task` type with a `source` field: `"inline" | "standalone"`
- Inline tasks: extracted from markdown, stored in SQLite
- Standalone tasks: JSON files, loaded on demand
- Single `TaskService` with methods for both sources
- Shared status type, due date handling, and query interface
- Task panel can show both sources with a filter toggle

### 5.6 Decouple Links from LSP Running State (Priority: Medium)

The links feature should not depend on LSP being in `"running"` state for backlinks:
- Primary backlink source should be the **search index** (`outlinks` table), which is always available
- LSP `references()` can be an enhancement for real-time accuracy (e.g., detecting links in unsaved editor content)
- Remove the `markdown_lsp_store.status` gate from `create_backlinks_sync_reactor`
- Keep LSP for link-related features that genuinely need it: completion, rename, hover

### 5.7 Treat Graph as Pure Visualization (Priority: Medium)

The graph feature should be a **rendering layer** that consumes from QueryService and index feature:
- Remove graph's direct calls to `search_port.semantic_search_batch()` and `search_port.compute_smart_link_vault_edges()`
- Graph requests a "graph dataset" from QueryService with edge type filters (wiki, semantic, smart_link)
- Graph owns only: layout computation, rendering (SVG/Pixi.js), interaction state, Web Worker
- Search graph becomes a QueryService query with `view: "graph"` flag

This reduces graph's data-layer complexity and makes it a pure consumer of the unified query interface.

### 5.8 Consolidate Duplicate Types (Priority: Low)

Extract shared types into a single location:
- `QueryFilter`, `QuerySort`, `QueryPagination` — shared across all query consumers
- Single `TaskStatus` type used by both inline and standalone tasks
- Cross-runtime type generation (Specta) should be the single source of truth, with TypeScript types generated from Rust definitions

---

## 6. Proposed Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI Panels (consumers, not data owners)                              │
│  ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐        │
│  │ Tags    │ │ Bases  │ │ Tasks  │ │ Links  │ │ Graph    │        │
│  │ (browse)│ │ (views)│ │ (views)│ │ (panel)│ │ (viz)    │        │
│  └────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────┬─────┘        │
│       │          │          │          │           │                │
│       └──────────┴──────────┴──────────┴───────────┘                │
│                          │                                          │
│              ┌───────────▼───────────┐                              │
│              │     QueryService      │  Single query surface        │
│              │  - fts_backend        │  (from index feature)        │
│              │  - vector_backend     │  (from index feature)        │
│              │  - property_backend   │  (migrated from bases)       │
│              │  - tag_backend        │  (from index feature)        │
│              │  - link_backend       │  (from links/index)          │
│              └───────────┬───────────┘                              │
│                          │                                          │
│       ┌──────────────────┼──────────────────┐                       │
│       ▼                  ▼                  ▼                       │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐               │
│  │  Index   │   │   SQLite     │   │   HNSW       │               │
│  │ Feature  │   │   Database   │   │   Index      │               │
│  │ (was     │   │   (tags,     │   │   (vectors,  │               │
│  │ "search")│   │    tasks,    │   │    cosine)   │               │
│  │          │   │    props,    │   │              │               │
│  │ - FTS    │   │    links,    │   │              │               │
│  │ - embed  │   │    FTS)      │   │              │               │
│  │ - tags   │   └──────────────┘   └──────────────┘               │
│  │ - tasks  │                                                      │
│  │ - props  │   ┌──────────────────────────────────────┐          │
│  │ - rules  │   │  LSP Layer (orthogonal to query)      │          │
│  └──────────┘   │  markdown_lsp ──► editor intelligence │          │
│                 │  code_lsp     ──► code intelligence   │          │
│                 │  lsp (unified)──► diagnostics UI      │          │
│                 └──────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

**Key changes from current state:**
1. "Search" renamed to "Index" — reflects its true role as data infrastructure
2. QueryService is the single entry point for all note-finding
3. Bases is a view layer, not a query engine
4. Tags is a browsing UI + query backend, not an independent query feature
5. Tasks are unified under one domain
6. Graph is pure visualization — consumes from QueryService
7. Links uses search index as primary backlink source, LSP as enhancement
8. LSP remains orthogonal — it powers editor intelligence, not data queries
9. HNSW vector index exposed as a query backend, not buried in search service

---

## 7. Migration Path

### Phase 1: Foundation
1. Rename "search" feature to "index" in code and docs
2. Create `QueryService` with unified query types
3. Migrate `query_bases()` SQL into `property_backend`
4. Migrate tag queries into `tag_backend`
5. Expose HNSW vector search as `vector_backend`
6. Update query solver to use QueryService internally

### Phase 2: UI Migration
1. Update bases panel to call QueryService instead of BasesPort
2. Update tags panel to call QueryService instead of TagPort
3. Update graph to request graph datasets from QueryService
4. Deprecate `BasesPort.query()` and `TagPort.get_notes_for_tag()`

### Phase 3: Task Unification
1. Merge `task` and `task_list` types
2. Create unified `TaskService`
3. Update UI to show both sources

### Phase 4: Links Decoupling
1. Switch backlinks primary source to index (`outlinks` table)
2. Remove LSP status gate from backlinks reactor
3. Keep LSP for real-time enhancement only

### Phase 5: Cleanup
1. Remove duplicate type definitions
2. Remove deprecated ports
3. Consolidate Rust query types
4. Extract smart link rules engine as standalone module (used by links + graph)
4. Extract smart link rules engine as standalone module (used by links + graph)

---

## 8. Risk Assessment

| Change | Risk | Mitigation |
|---|---|---|
| Search → Index rename | Low — mechanical rename + docs update | Update all imports, ports, and docs together |
| QueryService creation | Medium — large refactor | Build incrementally, keep old ports working during transition |
| Bases redefinition | Low — UI change only | Bases panel is a single component, easy to update |
| Graph decoupling | Medium — complex rendering pipeline | Keep rendering intact, only swap data source |
| Task unification | Medium — two features merge | Do types first, then services, then UI |
| Links LSP decoupling | Low — index already has outlinks | Verify outlinks table is populated before switching |
| Type consolidation | Low — mechanical change | Use Specta type generation as single source |

---

## 9. Conclusion

The scope creep in links, bases, tasks, tags, graph, and search is a natural consequence of building on a shared data layer without establishing clear abstraction boundaries. The fix is not to remove features but to **clarify responsibilities**:

- **Index** (was "search") owns "data indexing and retrieval" — FTS, embeddings, HNSW, tag/task/property extraction, smart link rules
- **QueryService** owns "find notes matching criteria" — single entry point with multiple backends
- **Bases** owns "saved views over query results with table/list UI"
- **Tags** owns "hierarchical tag browsing UI"
- **Tasks** owns "task management (inline + standalone) with list/kanban/schedule views"
- **Links** owns "link discovery, repair, and suggestions"
- **Graph** owns "visualization of note relationships" — pure rendering layer
- **LSP** owns "editor intelligence (completion, hover, rename, diagnostics)"

With these boundaries, each feature has a clear purpose, no feature subsumes another, the search/index feature is correctly named for its infrastructure role, graph is recognized as a visualization consumer, and LSP serves its intended role as an editor enhancement layer rather than a data query backend.
