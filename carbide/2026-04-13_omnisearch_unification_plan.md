# Implementation Plan: Unified Omnisearch Architecture

**Date:** 2026-04-13
**Status:** Draft - Pending Review
**Derived from:** [2026-04-13_feature_harmony_report.md](./2026-04-13_feature_harmony_report.md)

---

## Executive Summary

Unify six disparate search mechanisms (FTS, semantic, hybrid, omnibar, query language, search graph) into a single **Omnisearch** system with a unified query surface, pluggable backends, and a cohesive UI that adapts to query intent. The current architecture fragments search across multiple entry points with overlapping logic; this plan consolidates them while preserving all existing capabilities.

---

## 1. Current State Analysis

### 1.1 Search Mechanisms to Unify

| Mechanism | Current Location | Primary Use | Limitations |
|---|---|---|---|
| **FTS** | `search/db.rs` | Keyword content search | Text-only, no semantics |
| **Semantic** | `search/embeddings.rs` + `hnsw_index.rs` | Similarity-based search | Requires embeddings, no keyword matching |
| **Hybrid** | `search/hybrid.rs` | RRF merge of FTS + vector | Only triggered as omnibar fallback |
| **Omnibar** | `search/ui/omnibar.svelte` + `search_service.ts` | Quick note/command search | Limited to FTS with hybrid fallback, no structured queries |
| **Query Language** | `query/domain/query_parser.ts` + `query_solver.ts` | Structured queries with clauses | Separate parser, separate UI, not integrated with omnibar |
| **Search Graph** | `graph/domain/search_subgraph.ts` + `graph_service.ts` | Graph visualization of search results | Frontend-only composition, re-runs multiple backends independently |

### 1.2 Key Problems

1. **Fragmented entry points**: User must choose between omnibar, query panel, or search graph
2. **Duplicated orchestration**: Hybrid fallback logic exists in omnibar AND search graph independently
3. **Parser split**: `search_query_parser.ts` (simple) vs `query_parser.ts` (full recursive descent)
4. **Backend redundancy**: Search graph calls `hybrid_search()`, `semantic_search_batch()`, and `load_vault_graph()` separately instead of through a unified pipeline
5. **No intent detection**: System doesn't adapt search strategy based on query characteristics
6. **Query language isolated**: Powerful clause syntax exists but isn't accessible from omnibar

---

## 2. Target Architecture

### 2.1 Unified Omnisearch Pipeline

```
User Input
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Query Analyzer                            │
│  - Intent detection (notes/commands/files/structured)        │
│  - Clause parsing (unified parser replaces both existing)    │
│  - Query classification (keyword/semantic/mixed/graph)       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Query Orchestrator                         │
│  - Backend selection based on intent + classification        │
│  - Parallel execution of relevant backends                   │
│  - Result fusion (configurable: RRF, priority, union)        │
│  - Staleness-aware caching                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌──────────┐  ┌──────────┐
         │  FTS   │  │  Vector  │  │ Property │
         │Backend │  │ Backend  │  │ Backend  │
         └────────┘  └──────────┘  └──────────┘
              │            │            │
              └────────────┼────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Result Adapter                            │
│  - Unified result type (OmnisearchResult)                    │
│  - View mode selection (list/table/graph)                    │
│  - Cross-vault aggregation                                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Key Design Principles

1. **Single entry point**: All search flows through `OmnisearchService.execute()`
2. **Pluggable backends**: Each search type is a backend that can be enabled/disabled
3. **Intent-driven**: Query analyzer determines which backends to activate
4. **Progressive disclosure**: Simple queries get fast results; complex queries get rich results
5. **Backward compatible**: Existing omnibar, query panel, and search graph continue to work during migration

---

## 3. Implementation Phases

### Phase 1: Unified Query Parser (Foundation)

**Goal**: Replace the two existing parsers with a single unified parser that handles both simple omnibar queries and structured query language syntax.

#### 1.1 Create Unified Parser

**New file**: `src/lib/features/search/domain/unified_query_parser.ts`

- Merge capabilities of `search_query_parser.ts` (domain detection) and `query_parser.ts` (recursive descent)
- Support both implicit syntax (`>command`, `#planned`, `#tag`) and explicit clause syntax (`with:`, `named:`, `in:`, `linked from:`)
- Output a unified `UnifiedQuery` AST that can be executed by the orchestrator

**Key types**:
```typescript
interface UnifiedQuery {
  intent: QueryIntent;           // 'notes' | 'commands' | 'files' | 'mixed'
  text: string;                  // Raw query text
  clauses: QueryClause[];        // Parsed clauses (if any)
  domains: QueryDomain[];        // Detected domains (notes, commands, planned)
  isStructured: boolean;         // True if explicit clause syntax detected
}

type QueryClause = 
  | { type: 'with'; text: string; isTag: boolean }
  | { type: 'named'; text: string; isRegex: boolean }
  | { type: 'in'; path: string }
  | { type: 'linkedFrom'; notePath: string }
  | { type: 'withProperty'; property: string; operator: string; value: string }
  | { type: 'not'; clause: QueryClause };

type QueryIntent = 'notes' | 'commands' | 'files' | 'mixed' | 'graph';
type QueryDomain = 'notes' | 'commands' | 'planned';
```

#### 1.2 Create Query Analyzer

**New file**: `src/lib/features/search/domain/query_analyzer.ts`

- Classify queries by complexity and intent
- Determine which backends to activate
- Suggest search strategy (FTS-only, hybrid, full graph)

**Logic**:
```
if query starts with '>' → commands domain
if query contains 'with:' or 'named:' or 'in:' or 'linked from:' → structured mode
if query contains '#word' without quotes → tag clause detection
if query is empty → recent notes
if query is short (1-2 words) → FTS backend only
if query is medium (3-5 words) → FTS + hybrid fallback
if query is long (5+ words) OR has tag clauses → full hybrid (FTS + vector)
if query contains 'graph:' prefix OR result count > threshold → enable graph view
```

#### 1.3 Migration Steps

1. Create `unified_query_parser.ts` with full parser implementation
2. Create `query_analyzer.ts` with intent detection logic
3. Write comprehensive tests covering all existing query syntaxes
4. Update omnibar to use unified parser (replace `search_query_parser.ts`)
5. Update query panel to use unified parser (replace `query_parser.ts`)
6. Deprecate old parser files

**Files affected**:
- `src/lib/features/search/domain/unified_query_parser.ts` (new)
- `src/lib/features/search/domain/query_analyzer.ts` (new)
- `src/lib/features/search/application/search_service.ts` (update to use unified parser)
- `src/lib/features/query/domain/query_parser.ts` (deprecate, redirect to unified)
- `src/lib/features/query/domain/query_solver.ts` (update to use unified types)

---

### Phase 2: Unified Query Orchestrator

**Goal**: Create a single orchestrator that manages backend selection, parallel execution, and result fusion.

#### 2.1 Create Query Orchestrator

**New file**: `src/lib/features/search/application/query_orchestrator.ts`

- Accept `UnifiedQuery` from analyzer
- Execute relevant backends in parallel
- Fuse results using configurable strategy
- Return unified `OmnisearchResult[]`

**Key interface**:
```typescript
interface QueryOrchestrator {
  execute(query: UnifiedQuery, options?: ExecutionOptions): Promise<OmnisearchResult[]>;
}

interface ExecutionOptions {
  backends?: SearchBackend[];      // Override backend selection
  fusionStrategy?: FusionStrategy;  // 'rrf' | 'priority' | 'union'
  maxResults?: number;
  timeoutMs?: number;
  includeGraph?: boolean;           // Enable graph data collection
}

type SearchBackend = 'fts' | 'vector' | 'property' | 'link' | 'command' | 'planned';
type FusionStrategy = 'rrf' | 'priority' | 'union';
```

#### 2.2 Create Backend Adapters

Wrap existing port methods into a consistent backend interface:

**New file**: `src/lib/features/search/application/search_backends.ts`

```typescript
interface SearchBackend {
  name: string;
  execute(query: UnifiedQuery, options: BackendOptions): Promise<BackendResult[]>;
}

// Implementations:
// - FtsBackend: wraps search_port.search_notes()
// - VectorBackend: wraps search_port.semantic_search()
// - HybridBackend: wraps search_port.hybrid_search()
// - PropertyBackend: wraps bases_port.query()
// - LinkBackend: wraps search_port.get_note_links_snapshot()
// - CommandBackend: fuzzy match on COMMANDS_REGISTRY
// - PlannedBackend: wraps search_port.suggest_planned_links()
```

#### 2.3 Create Result Fusion Engine

**New file**: `src/lib/features/search/domain/result_fusion.ts`

- Implement RRF (Reciprocal Rank Fusion) for merging ranked results
- Implement priority-based fusion (FTS > Hybrid > Vector > Property)
- Implement union fusion (deduplicated union of all results)
- Handle cross-vault result grouping

**RRF Implementation** (existing logic from `hybrid.rs`, ported to TypeScript for frontend fusion):
```typescript
function rrfMerge(resultSets: BackendResult[][], k: number = 60): OmnisearchResult[] {
  const scores = new Map<string, number>();
  for (const results of resultSets) {
    for (const [rank, result] of results.entries()) {
      const current = scores.get(result.id) ?? 0;
      scores.set(result.id, current + 1 / (k + rank + 1));
    }
  }
  // Sort by score, return unified results
}
```

#### 2.4 Migration Steps

1. Create `search_backends.ts` with adapter implementations
2. Create `result_fusion.ts` with fusion strategies
3. Create `query_orchestrator.ts` with execution logic
4. Update `SearchService.search_omnibar()` to use orchestrator
5. Update `QueryService.execute()` to use orchestrator
6. Write integration tests for orchestrator with mock backends

**Files affected**:
- `src/lib/features/search/application/query_orchestrator.ts` (new)
- `src/lib/features/search/application/search_backends.ts` (new)
- `src/lib/features/search/domain/result_fusion.ts` (new)
- `src/lib/features/search/application/search_service.ts` (update)
- `src/lib/features/query/application/query_service.ts` (update)

---

### Phase 3: Unified Omnisearch UI

**Goal**: Replace the separate omnibar and query panel with a single adaptive search UI.

#### 3.1 Create Unified Omnisearch Component

**New file**: `src/lib/features/search/ui/omnisearch.svelte`

- Adaptive UI that changes based on query intent and complexity
- Supports three view modes: `list` (default), `table` (bases-style), `graph` (search graph)
- Inline query syntax hints and autocomplete
- Progressive result loading (show FTS results immediately, enrich with semantic/graph as available)

**Key features**:
- Single input field that accepts both simple and structured queries
- View mode toggle (list/table/graph) appears contextually
- Result items with unified metadata display
- Keyboard navigation and command execution
- Cross-vault result grouping with vault indicators

#### 3.2 Create Adaptive Result Renderers

**New file**: `src/lib/features/search/ui/omnisearch_result_list.svelte`

- Renders `OmnisearchResult[]` with appropriate formatting per result type
- Supports note results, command results, planned notes, cross-vault notes
- Shows relevance indicators (FTS match, semantic match, both)
- Inline actions (open, preview, copy path, etc.)

**New file**: `src/lib/features/search/ui/omnisearch_graph_view.svelte`

- Extract search graph canvas into a view mode within omnisearch
- Reuse existing `search_graph_canvas.svelte` rendering logic
- Trigger graph view when:
  - User explicitly requests it (`graph:` prefix or view toggle)
  - Query produces enough results to benefit from graph visualization
  - Query contains graph-related clauses (`linked from:`)

#### 3.3 Migrate Existing UI Components

1. Update `omnibar.svelte` to become a thin wrapper around `omnisearch.svelte` with default list mode
2. Update query panel to use `omnisearch.svelte` with structured mode enabled
3. Update search graph tab view to use `omnisearch.svelte` with graph mode enabled
4. Ensure all three entry points produce identical results for the same query

#### 3.4 Migration Steps

1. Create `omnisearch.svelte` with adaptive UI logic
2. Create `omnisearch_result_list.svelte` for list view
3. Create `omnisearch_graph_view.svelte` for graph view
4. Create `omnisearch_table_view.svelte` for bases-style table view (extract from bases UI)
5. Update omnibar to use omnisearch component
6. Update query panel to use omnisearch component
7. Update search graph tab to use omnisearch component
8. Write visual regression tests for all three entry points

**Files affected**:
- `src/lib/features/search/ui/omnisearch.svelte` (new)
- `src/lib/features/search/ui/omnisearch_result_list.svelte` (new)
- `src/lib/features/search/ui/omnisearch_graph_view.svelte` (new)
- `src/lib/features/search/ui/omnisearch_table_view.svelte` (new)
- `src/lib/features/search/ui/omnibar.svelte` (update to wrap omnisearch)
- `src/lib/features/query/ui/query_panel.svelte` (update to use omnisearch)
- `src/lib/features/graph/ui/search_graph_tab_view.svelte` (update to use omnisearch)

---

### Phase 4: Search Graph Integration

**Goal**: Integrate search graph as a first-class view mode within the omnisearch pipeline rather than a separate feature.

#### 4.1 Create Graph Data Collector

**New file**: `src/lib/features/search/application/graph_data_collector.ts`

- When `includeGraph: true` in execution options, collect graph data alongside search results
- Single coordinated call to backends instead of independent calls:
  - Get hybrid search hits
  - Get wiki-link snapshot (reuse existing graph cache)
  - Get semantic edges for hits (batch call)
  - Get smart link edges (from graph store)
- Build `SearchSubgraph` from collected data

#### 4.2 Integrate with Orchestrator

- Add `graph` backend to orchestrator
- When graph mode is active, orchestrator:
  1. Executes search backends for results
  2. Triggers graph data collector
  3. Returns both `OmnisearchResult[]` and `SearchSubgraph`
  4. UI switches to graph view mode

#### 4.3 Migration Steps

1. Create `graph_data_collector.ts`
2. Update orchestrator to support graph backend
3. Update `execute_search_graph()` in `GraphService` to use orchestrator
4. Ensure search graph results are identical before/after migration
5. Write tests for graph data collection

**Files affected**:
- `src/lib/features/search/application/graph_data_collector.ts` (new)
- `src/lib/features/search/application/query_orchestrator.ts` (update)
- `src/lib/features/graph/application/graph_service.ts` (update to use orchestrator)
- `src/lib/features/graph/domain/search_subgraph.ts` (may be reusable as-is)

---

### Phase 5: Rust Backend Consolidation

**Goal**: Align Rust backend with unified frontend architecture.

#### 5.1 Create Unified Search Command

**New file**: `src-tauri/src/features/search/omnisearch.rs`

- Single Tauri command `omnisearch()` that accepts a unified query object
- Internally routes to appropriate backends (FTS, hybrid, semantic)
- Returns unified result structure with hit type indicators
- Supports optional graph data collection

```rust
#[derive(Serialize, Deserialize)]
struct OmnisearchQuery {
    text: String,
    backends: Vec<SearchBackend>,
    fusion_strategy: FusionStrategy,
    max_results: usize,
    include_graph: bool,
}

#[tauri::command]
async fn omnisearch(
    state: State<'_, EmbeddingServiceState>,
    query: OmnisearchQuery,
) -> Result<OmnisearchResult, String> {
    // Route to appropriate backends
    // Fuse results
    // Optionally collect graph data
    // Return unified result
}
```

#### 5.2 Consolidate Existing Commands

- Keep existing commands (`index_search`, `hybrid_search`, `semantic_search`) during migration
- Mark as deprecated with comments pointing to `omnisearch`
- Eventually remove after frontend fully migrates

#### 5.3 Migration Steps

1. Create `omnisearch.rs` with unified command
2. Add `omnisearch` command to `lib.rs`
3. Update Tauri adapter to use new command
4. Write Rust tests for omnisearch command
5. Deprecate old commands incrementally

**Files affected**:
- `src-tauri/src/features/search/omnisearch.rs` (new)
- `src-tauri/src/features/search/mod.rs` (add omnisearch module)
- `src-tauri/src/lib.rs` (register omnisearch command)
- `src/lib/features/search/infrastructure/tauri_adapter.ts` (add omnisearch method)

---

### Phase 6: Cleanup and Deprecation

**Goal**: Remove deprecated code and finalize the unified architecture.

#### 6.1 Remove Deprecated Files

- `src/lib/features/search/domain/search_query_parser.ts` (replaced by unified parser)
- `src/lib/features/query/domain/query_parser.ts` (replaced by unified parser)
- `src/lib/features/query/domain/query_solver.ts` (replaced by orchestrator)
- `src/lib/features/graph/ui/search_graph_canvas.svelte` (integrated into omnisearch)
- `src/lib/features/graph/ui/search_graph_tab_view.svelte` (integrated into omnisearch)

#### 6.2 Update Port Interfaces

- Consolidate `SearchPort` and `QueryBackends` into single `OmnisearchPort`
- Remove redundant methods that are now handled by orchestrator
- Keep backward-compatible aliases during transition

#### 6.3 Update Documentation

- Update architecture docs to reflect unified search
- Update feature harmony report with post-migration state
- Update any user-facing documentation about search syntax

#### 6.4 Final Verification

- Run full test suite
- Verify all existing search scenarios work with unified system
- Performance benchmarking against pre-migration baseline
- Cross-vault search verification
- Graph view parity verification

---

## 4. File Change Summary

### New Files (12)

| File | Purpose |
|---|---|
| `src/lib/features/search/domain/unified_query_parser.ts` | Single parser for all query syntaxes |
| `src/lib/features/search/domain/query_analyzer.ts` | Intent detection and backend selection |
| `src/lib/features/search/domain/result_fusion.ts` | RRF, priority, and union fusion strategies |
| `src/lib/features/search/application/query_orchestrator.ts` | Central query execution orchestrator |
| `src/lib/features/search/application/search_backends.ts` | Backend adapter implementations |
| `src/lib/features/search/application/graph_data_collector.ts` | Graph data collection for search results |
| `src/lib/features/search/ui/omnisearch.svelte` | Unified adaptive search UI |
| `src/lib/features/search/ui/omnisearch_result_list.svelte` | List view renderer |
| `src/lib/features/search/ui/omnisearch_graph_view.svelte` | Graph view renderer |
| `src/lib/features/search/ui/omnisearch_table_view.svelte` | Table view renderer |
| `src-tauri/src/features/search/omnisearch.rs` | Unified Rust search command |
| `tests/search/omnisearch_integration.test.ts` | Integration tests |

### Modified Files (10)

| File | Change |
|---|---|
| `src/lib/features/search/application/search_service.ts` | Use orchestrator instead of direct backend calls |
| `src/lib/features/search/ui/omnibar.svelte` | Wrap omnisearch component |
| `src/lib/features/query/application/query_service.ts` | Use orchestrator instead of query solver |
| `src/lib/features/query/ui/query_panel.svelte` | Use omnisearch component |
| `src/lib/features/graph/application/graph_service.ts` | Use orchestrator for search graph |
| `src/lib/features/graph/ui/search_graph_tab_view.svelte` | Use omnisearch with graph mode |
| `src/lib/features/search/infrastructure/tauri_adapter.ts` | Add omnisearch method |
| `src-tauri/src/features/search/mod.rs` | Add omnisearch module |
| `src-tauri/src/lib.rs` | Register omnisearch command |
| `docs/architecture.md` | Update search architecture section |

### Deprecated Files (5)

| File | Replacement |
|---|---|
| `src/lib/features/search/domain/search_query_parser.ts` | `unified_query_parser.ts` |
| `src/lib/features/query/domain/query_parser.ts` | `unifiedquery_parser.ts` |
| `src/lib/features/query/domain/query_solver.ts` | `query_orchestrator.ts` |
| `src/lib/features/graph/ui/search_graph_canvas.svelte` | `omnisearch_graph_view.svelte` |
| `src/lib/features/graph/ui/search_graph_result_list.svelte` | `omnisearch_result_list.svelte` |

---

## 5. Test Strategy

### 5.1 Unit Tests

- `unified_query_parser.test.ts`: All query syntaxes, edge cases, error handling
- `query_analyzer.test.ts`: Intent detection for various query patterns
- `result_fusion.test.ts`: RRF, priority, and union fusion correctness
- `query_orchestrator.test.ts`: Backend selection, parallel execution, timeout handling

### 5.2 Integration Tests

- `omnisearch_integration.test.ts`: End-to-end search flows with mock backends
- Cross-vault search integration
- Graph view integration with search results
- Command execution from search results

### 5.3 Migration Tests

- Verify omnibar produces identical results before/after migration
- Verify query panel produces identical results before/after migration
- Verify search graph produces identical results before/after migration
- Performance regression tests (latency, memory usage)

### 5.4 Test Files

| File | Coverage |
|---|---|
| `tests/search/unified_query_parser.test.ts` | Parser unit tests |
| `tests/search/query_analyzer.test.ts` | Analyzer unit tests |
| `tests/search/result_fusion.test.ts` | Fusion strategy tests |
| `tests/search/query_orchestrator.test.ts` | Orchestrator unit tests |
| `tests/search/omnisearch_integration.test.ts` | End-to-end integration |
| `tests/search/migration_parity.test.ts` | Before/after parity checks |

---

## 6. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Parser incompatibility with existing syntax | High | Medium | Comprehensive test coverage of all existing syntaxes before deprecation |
| Performance regression from orchestration overhead | Medium | Low | Backend parallelization, caching, benchmarking at each phase |
| Graph view complexity in unified UI | Medium | Medium | Progressive enhancement - graph view is opt-in initially |
| Cross-vault search complexity | Low | Low | Existing cross-vault logic is well-tested, minimal changes needed |
| Rust command migration breaking changes | Low | Low | Keep old commands during transition, gradual deprecation |
| UI/UX regression in omnibar | High | Medium | Visual regression tests, user testing before deprecation |

---

## 7. Success Criteria

1. **Single entry point**: All search flows through `OmnisearchService.execute()`
2. **Unified parser**: One parser handles all query syntaxes (simple + structured)
3. **Adaptive UI**: Single component adapts to query intent (list/table/graph)
4. **Backward compatibility**: All existing search scenarios produce identical results
5. **Performance**: No regression in search latency (p95 < 200ms for FTS, < 500ms for hybrid)
6. **Test coverage**: >90% coverage on new parser, analyzer, orchestrator, and fusion modules
7. **Code reduction**: Net reduction in total lines of search-related code (target: -20%)

---

## 8. Execution Order

```
Phase 1: Unified Query Parser (Week 1-2)
  ├── 1.1 Create unified parser
  ├── 1.2 Create query analyzer
  └── 1.3 Migration + tests

Phase 2: Query Orchestrator (Week 2-3)
  ├── 2.1 Create orchestrator
  ├── 2.2 Create backend adapters
  ├── 2.3 Create result fusion engine
  └── 2.4 Migration + tests

Phase 3: Unified UI (Week 3-4)
  ├── 3.1 Create omnisearch component
  ├── 3.2 Create adaptive renderers
  ├── 3.3 Migrate existing UIs
  └── 3.4 Visual regression tests

Phase 4: Search Graph Integration (Week 4-5)
  ├── 4.1 Create graph data collector
  ├── 4.2 Integrate with orchestrator
  └── 4.3 Migration + tests

Phase 5: Rust Backend (Week 5-6)
  ├── 5.1 Create omnisearch command
  ├── 5.2 Consolidate existing commands
  └── 5.3 Migration + tests

Phase 6: Cleanup (Week 6-7)
  ├── 6.1 Remove deprecated files
  ├── 6.2 Update port interfaces
  ├── 6.3 Update documentation
  └── 6.4 Final verification
```

**Estimated total timeline**: 6-7 weeks

---

## 9. Open Questions

1. **Query syntax convergence**: Should we keep both implicit (`>command`, `#tag`) and explicit (`with:`, `named:`) syntax, or converge on one? Recommendation: keep both for backward compatibility, but document explicit syntax as canonical.

2. **Graph view trigger**: Should graph view be opt-in (user toggles) or automatic (system decides based on query)? Recommendation: opt-in initially, with automatic suggestion when query produces graph-worthy results.

3. **Cross-vault search scope**: Should cross-vault search be enabled by default or opt-in? Recommendation: opt-in to avoid performance impact on single-vault users.

4. **Result caching strategy**: How aggressively should we cache search results? Recommendation: cache FTS results by (vault_id, query_text) with 5s TTL, cache graph data with 30s TTL.

5. **Mobile/responsive considerations**: The unified UI needs to work on smaller screens. Recommendation: design omnisearch component with responsive breakpoints from the start.

---

## 10. Dependencies and Prerequisites

- Existing HNSW index infrastructure must be stable
- Embedding model loading must be reliable (no changes to embedding pipeline)
- SQLite FTS5 table must be properly indexed
- Graph cache infrastructure must be functional
- Tauri command infrastructure must support new omnisearch command

No new external dependencies required. All work uses existing libraries and infrastructure.
