# Implementation Plan: Omnisearch Incremental Unification

**Date:** 2026-04-13 (revised 2026-04-14)
**Status:** Phases 2-3 Complete — Phase 1 Pending
**Derived from:** [2026-04-13_feature_harmony_report.md](./2026-04-13_feature_harmony_report.md)

---

## Executive Summary

Incrementally unify the search surface by extending the existing architecture rather than replacing it. The current system has clean ports (`SearchPort`, `WorkspaceIndexPort`) and a well-separated domain/application/UI stack — the problem is not architectural rot but **missing connections** between features that already work well independently.

Three targeted phases address the actual pain points:
1. **Extend the omnibar** to accept structured query syntax (reuse the existing query parser, don't rewrite it)
2. **Extract a shared search pipeline** that both omnibar and graph search call, eliminating duplicated orchestration
3. **Add scoped hybrid search** in Rust so the pipeline can filter by title/path/content

No new abstractions, no frontend fusion engine, no god-component. Each phase ships independently and improves the product on its own.

---

## 1. Current State (What Works, What Doesn't)

### What works well

| Component | Design | Quality |
|---|---|---|
| `search_query_parser.ts` | Flat prefix tokenizer — fast, infallible, perfect for keystroke-level parsing | Good |
| `query_parser.ts` | Full recursive descent parser with AST, error recovery, boolean composition | Good |
| `query_solver.ts` | AST evaluator that dispatches to `SearchPort`, `TagPort`, `BasesPort` backends | Good |
| `SearchPort` | 20 well-defined methods behind a port interface | Good |
| `hybrid.rs` / `rrf_merge` | RRF fusion in Rust, close to data, no serialization overhead | Good |
| `omnibar.svelte` | Purely presentational, receives pre-computed items as props | Good |

### What doesn't work

| Problem | Impact | Root Cause |
|---|---|---|
| **Omnibar can't use structured queries** | Users must switch to query panel for `with:`, `named:`, `in:`, `linked from:` | `SearchService.search_omnibar` only uses `search_query_parser`, never the full `query_parser` |
| **Graph search re-orchestrates independently** | `GraphService.execute_search_graph` calls `hybrid_search` + `semantic_search_batch` + `load_vault_graph` separately | No shared pipeline between omnibar search and graph search |
| **Hybrid search ignores scope** | `hybrid_search` Rust command takes bare `String`, not `SearchQueryInput` | Omission when hybrid was added — FTS leg doesn't scope, vector leg can't scope |
| **No cross-view result display** | Omnibar shows list only, bases shows table only, graph shows canvas only | Each feature renders its own results independently |
| **Vector-only hits silently dropped** | `rrf_merge` filters out paths without FTS hits — pure semantic matches never surface | Intentional (FTS provides `note` metadata), but undocumented and surprising |

---

## 2. Design Principles

1. **Extend, don't replace.** Both parsers are correct for their use cases. The flat tokenizer is right for per-keystroke routing; the recursive descent parser is right for structured queries. Connect them, don't merge them.
2. **Keep fusion in Rust.** RRF belongs close to the data. Don't port it to TypeScript.
3. **Thin coordination, not thick orchestration.** A shared function that calls the right backends in sequence is better than a `QueryOrchestrator` with pluggable `SearchBackend` adapters and configurable `FusionStrategy` enums.
4. **Ship incrementally.** Each phase delivers user-visible value. No phase depends on completing all others.
5. **Preserve existing behavior.** The vector-only-hit filter in `rrf_merge` is load-bearing (it provides `IndexNoteMeta` from FTS results). Don't change it without explicit decision.

---

## 3. Implementation Phases

### Phase 1: Structured Queries in the Omnibar

**Goal:** Let users type structured query syntax (`notes with #rust`, `named /regex/`, `in "Projects"`) directly in the omnibar, using the existing `query_parser` + `query_solver`.

**Approach:** Detect structured syntax in the omnibar input and route to the query solver when appropriate, while keeping the fast path (plain text → hybrid search) for simple queries.

#### 1.1 Add query detection to `SearchService`

**Modified file:** `src/lib/features/search/application/search_service.ts`

Add a method `search_omnibar_structured` that:
1. Attempts `parse_query(raw)` from the existing query parser
2. If it succeeds and the query has clauses (not just bare text) → execute via `query_solver.solve_query()`
3. Map `QueryResultItem[]` → `OmnibarItem[]` (note results with a `structured_query` badge)
4. If parse fails or query is just bare text → fall through to existing `search_omnibar` path

```typescript
// Pseudocode for the routing logic
async search_omnibar(raw_query: string, ...): Promise<void> {
  const parsed_simple = parse_search_query(raw_query);

  // Fast path: commands, planned, settings
  if (parsed_simple.domain !== 'notes') {
    return this.search_by_domain(parsed_simple);
  }

  // Try structured parse if input looks like it has clauses
  if (looks_structured(raw_query)) {
    const parse_result = parse_query(raw_query);
    if (parse_result.ok) {
      const results = await solve_query(vault_id, parse_result.query, this.query_backends);
      this.search_store.set_omnibar_items(map_query_results_to_omnibar_items(results));
      return;
    }
  }

  // Default path: hybrid/FTS search (existing logic)
  return this.search_notes_hybrid(parsed_simple);
}
```

**`looks_structured(raw)`** is a cheap heuristic (not a full parse): returns `true` if the input contains any of the clause keywords (`with `, `named `, `in "`, `linked from `, `not `), a query form prefix (`notes `, `files `, `folders `), or known value syntax (`#tag`, `[[wikilink]]`, `/regex/`). This avoids parsing overhead on every keystroke for plain searches.

#### 1.2 Wire `QueryBackends` into `SearchService`

**Modified file:** `src/lib/features/search/application/search_service.ts`

`SearchService` already holds `search_port: SearchPort`. The query solver needs `QueryBackends { search, index, tags, bases }`. Wire these in:
- `search` → existing `this.search_port`
- `index` → existing `this.index_port`
- `tags` → add `tags_port: TagPort` to constructor (already available in the app's DI)
- `bases` → add `bases_port: BasesPort` to constructor

#### 1.3 Map query results to omnibar items

**New function in:** `src/lib/features/search/application/search_service.ts` (or a small helper file if it exceeds ~40 lines)

Map `QueryResultItem { path, title, snippet?, matched_clauses? }` to the existing `OmnibarItem` shape (`kind: 'note'`, with note metadata). Reuse the existing `to_omnibar_note_item()` helper.

#### 1.4 Add syntax hints to omnibar UI

**Modified file:** `src/lib/features/search/ui/omnibar.svelte`

When the user types a clause keyword prefix (e.g., `with`), show a subtle inline hint below the input: `with #tag | with "text" | with property = value`. This is a small UX affordance, not a full autocomplete system. Implement as a reactive derived value from the current query text.

#### 1.5 Tests

**New file:** `tests/search/omnibar_structured_query.test.ts`

- `looks_structured()` unit tests: positive cases (clause keywords, form prefixes, value syntax), negative cases (plain text, commands prefix, planned prefix)
- Integration: `search_omnibar` with structured input produces correct results via mock `QueryBackends`
- Integration: `search_omnibar` with plain text still routes to hybrid/FTS (no regression)
- Edge cases: partial clause input (`with` alone), mixed syntax (`notes #rust some text`)

**Files affected:**
- `src/lib/features/search/application/search_service.ts` (modify: add structured routing, wire backends)
- `src/lib/features/search/ui/omnibar.svelte` (modify: add syntax hints)
- `tests/search/omnibar_structured_query.test.ts` (new)

**Estimated scope:** ~150 lines of new logic, ~100 lines of tests.

---

### Phase 2: Shared Search Pipeline for Graph ✅ COMPLETED (2026-04-14)

**Goal:** Eliminate duplicated orchestration in `GraphService.execute_search_graph()` by extracting a shared `run_hybrid_search_pipeline()` that both omnibar and graph search call.

**Current problem:** `GraphService.execute_search_graph()` independently calls:
1. `search_port.hybrid_search()` → seed hits
2. `search_port.get_note_links_snapshot()` → link graph
3. `search_port.semantic_search_batch()` → semantic edges
4. `extract_search_subgraph()` → merge into subgraph

Meanwhile, `SearchService.search_omnibar()` calls `search_port.hybrid_search()` separately. The hybrid call is duplicated, and the graph service manages its own error handling, revision tracking, and result mapping.

#### 2.1 Extract `run_search_pipeline` from `SearchService`

**Modified file:** `src/lib/features/search/application/search_service.ts`

Extract the core hybrid search logic into a reusable method:

```typescript
// Returns raw hybrid hits + optional metadata, usable by both omnibar and graph
async run_search_pipeline(
  vault_id: string,
  query: string,
  options?: { limit?: number; include_links_snapshot?: boolean }
): Promise<SearchPipelineResult> {
  const hits = await this.search_port.hybrid_search(vault_id, query, options?.limit ?? 20);

  let links_snapshot: NoteLinksSnapshot | undefined;
  if (options?.include_links_snapshot) {
    links_snapshot = await this.search_port.get_note_links_snapshot(vault_id);
  }

  return { hits, links_snapshot };
}
```

**New type** (add to `types/search_service_result.ts`):

```typescript
type SearchPipelineResult = {
  hits: HybridSearchHit[];
  links_snapshot?: NoteLinksSnapshot;
};
```

#### 2.2 Update `GraphService` to use the shared pipeline

**Modified file:** `src/lib/features/graph/application/graph_service.ts`

Replace the direct `search_port.hybrid_search()` + `search_port.get_note_links_snapshot()` calls with a single call to `search_service.run_search_pipeline(vault_id, query, { include_links_snapshot: true })`.

This requires `GraphService` to depend on `SearchService` rather than directly on `SearchPort` for the hybrid search leg. The `semantic_search_batch` call for semantic edges remains on `GraphService` since it's graph-specific (batch similarity between search hits, not a general search operation).

#### 2.3 Tests

**New file:** `tests/search/search_pipeline.test.ts`

- `run_search_pipeline` with mock `SearchPort`: returns hits, optionally includes links snapshot
- `GraphService.execute_search_graph` still produces correct subgraph after refactor (parity test)
- Error handling: hybrid search failure falls back gracefully

**Files affected:**
- `src/lib/features/search/application/search_service.ts` (modify: extract pipeline method)
- `src/lib/features/search/types/search_service_result.ts` (modify: add `SearchPipelineResult`)
- `src/lib/features/graph/application/graph_service.ts` (modify: use shared pipeline)
- `tests/search/search_pipeline.test.ts` (new)

**Estimated scope:** ~60 lines of new logic, ~80 lines of tests.

**Implementation notes (2026-04-14):**
- Added `SearchPipelineResult = { hits: HybridSearchHit[] }` type to `search_service_result.ts`
- Extracted `run_search_pipeline(vault_id, query, options?)` method on `SearchService` — parses query via `parse_search_query`, calls `hybrid_search` with the parsed `{ raw, text, scope }`
- `search_omnibar` now calls `run_search_pipeline` internally instead of `search_port.hybrid_search` directly
- `GraphService` constructor now accepts `SearchService` as a dependency (injected between `search_port` and `vault_store`)
- `execute_search_graph` calls `search_service.run_search_pipeline(vault_id, query, { limit: 50 })` instead of constructing `SearchQueryInput` manually
- Key behavior change: graph search now gets scope parsing for free — `title:react` in graph search scopes to titles (previously hardcoded `scope: "all"`)
- `semantic_search_batch` and `semantic_search` calls remain on `GraphService` since they are graph-specific
- DI wiring updated in `create_app_context.ts` — `search_service` (created at line 169) is passed to `GraphService` (created at line 549)
- 7 new tests: 5 for `run_search_pipeline` (hits, scope propagation, custom limit, error propagation), 2 for graph→pipeline integration
- All 3242 tests pass, `pnpm check` clean

---

### Phase 3: Scoped Hybrid Search in Rust ✅ COMPLETED (2026-04-14)

**Goal:** Let `hybrid_search` accept a `SearchQueryInput` (with scope) instead of a bare `String`, so the omnibar can run scoped hybrid searches (e.g., `title:react` triggers hybrid search scoped to titles).

**Current problem:** `hybrid_search` in Rust takes `query: String` and always searches with `SearchScope::All`. The FTS leg in `rrf_merge` calls `search_db::search(conn, query, SearchScope::All, over_fetch)`. Users who type `title:react` in the omnibar get FTS-scoped results but lose semantic hits because hybrid search ignores the scope.

#### 3.1 Update Rust `hybrid_search` signature

**Modified file:** `src-tauri/src/features/search/service.rs`

Change the Tauri command:
```rust
// Before
pub async fn hybrid_search(app: AppHandle, vault_id: String, query: String, limit: Option<usize>) -> Result<Vec<HybridSearchHit>, String>

// After
pub async fn hybrid_search(app: AppHandle, vault_id: String, query: SearchQueryInput, limit: Option<usize>) -> Result<Vec<HybridSearchHit>, String>
```

#### 3.2 Update `hybrid::hybrid_search` to accept scope

**Modified file:** `src-tauri/src/features/search/hybrid.rs`

```rust
// Before
pub fn hybrid_search(conn, note_index, model, query: &str, limit) -> ...

// After
pub fn hybrid_search(conn, note_index, model, query: &SearchQueryInput, limit) -> ...
```

Pass `query.scope` to the FTS leg: `search_db::search(conn, &query.text, query.scope, over_fetch)`. The vector leg continues to use `query.text` for embedding (scope doesn't affect semantic similarity).

#### 3.3 Update TypeScript adapter

**Modified file:** `src/lib/features/search/adapters/search_tauri_adapter.ts`

Update the `hybrid_search` adapter call to pass `SearchQueryInput` instead of a bare string. Update `SearchPort.hybrid_search` signature to accept the structured input.

#### 3.4 Update `SearchPort` interface

**Modified file:** `src/lib/features/search/ports.ts`

```typescript
// Before
hybrid_search(vault_id: string, query: string, limit?: number): Promise<HybridSearchHit[]>;

// After
hybrid_search(vault_id: string, query: SearchQueryInput, limit?: number): Promise<HybridSearchHit[]>;
```

Update all call sites (there are exactly two: `SearchService.search_omnibar` and `GraphService.execute_search_graph`).

#### 3.5 Tests

- Rust unit test in `hybrid.rs`: scoped hybrid search filters FTS results by scope while still including vector hits
- TypeScript adapter test: verify `SearchQueryInput` serialization

**Files affected:**
- `src-tauri/src/features/search/service.rs` (modify: command signature)
- `src-tauri/src/features/search/hybrid.rs` (modify: accept scope)
- `src/lib/features/search/ports.ts` (modify: signature)
- `src/lib/features/search/adapters/search_tauri_adapter.ts` (modify: pass structured input)
- `src/lib/features/search/application/search_service.ts` (modify: pass scope to hybrid)
- `src/lib/features/graph/application/graph_service.ts` (modify: construct SearchQueryInput)

**Estimated scope:** ~30 lines of Rust changes, ~20 lines of TypeScript changes, ~40 lines of tests.

**Implementation notes (2026-04-14):**
- Rust `SearchQueryInput` struct already existed in `service.rs` with `{ raw, text, scope }` fields — reused directly
- Added `SearchQueryInput` type on TS side as `Pick<SearchQuery, "raw" | "text" | "scope">`
- `hybrid_search` in `hybrid.rs` now passes `query.scope` to `search_db::search` instead of hardcoded `SearchScope::All`
- Vector leg still uses `query.text` for embedding (scope doesn't affect semantic similarity, as planned)
- All call sites updated: `SearchService` passes `{ raw, text, scope }` from the parsed query; `GraphService` constructs `{ raw: query, text: query, scope: "all" }`
- 2 new tests verify scope propagation: scoped query (`title:react`) passes `scope: "title"`, unscoped query passes `scope: "all"`
- All 3235 tests pass, `pnpm check` clean, `cargo check` clean

---

## 4. Explicitly Out of Scope

These items from the original plan are **intentionally excluded** and why:

| Excluded Item | Reason |
|---|---|
| **Unified parser** (`unified_query_parser.ts`) | The two parsers serve different purposes. The flat tokenizer is correct for keystroke-level routing; the recursive descent parser is correct for structured queries. Merging them adds complexity without benefit. |
| **Frontend RRF fusion** (`result_fusion.ts`) | RRF already runs in Rust where it belongs. Porting it to TypeScript means shipping raw per-backend result sets over IPC, then re-merging — strictly worse. |
| **`QueryOrchestrator`** with pluggable backends | Over-abstraction. The routing logic is ~20 lines in `SearchService`. A formal orchestrator with backend adapters and fusion strategies is enterprise middleware for a single-user desktop app. |
| **`QueryAnalyzer`** with word-count heuristics | Brittle. "Short queries → FTS only" is an arbitrary heuristic that will surprise users. The current approach (always try hybrid, fall back to FTS) is simpler and more predictable. |
| **Unified `omnisearch.svelte`** god-component | The omnibar (modal palette), query panel (persistent sidebar), and search graph (canvas) have fundamentally different interaction models. Forcing them into one component creates complexity, not simplicity. |
| **Rust `omnisearch` command** | The existing per-backend commands (`index_search`, `hybrid_search`, `semantic_search`) are well-defined and independently useful. A mega-command that routes internally is just a Rust version of the over-orchestration problem. |
| **Deprecating `query_parser.ts` / `query_solver.ts`** | These are actively used by the Bases query panel and are well-designed. Phase 1 *reuses* them from the omnibar; deprecation would remove working code. |

---

## 5. Future Considerations (Post-Phase 3)

These are natural extensions once the three phases land, but should not be planned in detail now:

1. **View mode toggle on search results.** After Phase 2 makes the pipeline shared, adding a "show as graph" button to omnibar results becomes straightforward — it's just `extract_search_subgraph()` on the existing hits.
2. **Cross-vault structured queries.** Phase 1 enables structured queries in a single vault. Cross-vault support requires `query_solver` to iterate vaults, which is a `run_cross_vault_search` extension.
3. **Vector-only hit surfacing.** The `rrf_merge` filter that drops vector-only hits could be relaxed by constructing synthetic `IndexNoteMeta` from the vector index's key (path) + a DB lookup. This is a deliberate behavior change that warrants its own design discussion.
4. **Autocomplete for structured syntax.** Phase 1 adds static syntax hints. A full autocomplete (suggesting tag names, folder paths, property keys as the user types) would require wiring the omnibar input to live backend queries — doable but a separate effort.

---

## 6. File Change Summary

### New Files (2)

| File | Purpose |
|---|---|
| `tests/search/omnibar_structured_query.test.ts` | Tests for structured query routing in omnibar |
| `tests/search/search_pipeline.test.ts` | Tests for shared search pipeline |

### Modified Files (8)

| File | Change |
|---|---|
| `src/lib/features/search/application/search_service.ts` | Add structured query routing, wire QueryBackends, extract pipeline method |
| `src/lib/features/search/ui/omnibar.svelte` | Add syntax hints for structured query keywords |
| `src/lib/features/search/ports.ts` | Update `hybrid_search` signature to accept `SearchQueryInput` |
| `src/lib/features/search/types/search_service_result.ts` | Add `SearchPipelineResult` type |
| `src/lib/features/search/adapters/search_tauri_adapter.ts` | Pass `SearchQueryInput` to hybrid search |
| `src/lib/features/graph/application/graph_service.ts` | Use shared pipeline, construct `SearchQueryInput` |
| `src-tauri/src/features/search/service.rs` | Update `hybrid_search` command signature |
| `src-tauri/src/features/search/hybrid.rs` | Accept scope in hybrid search |

### Deprecated Files (0)

No files deprecated. All existing code continues to serve its purpose.

---

## 7. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Structured parse attempt adds latency to omnibar | Medium | Low | `looks_structured()` short-circuits on plain text; no parse attempt for 95% of queries |
| `QueryBackends` wiring increases `SearchService` constructor surface | Low | High | Acceptable — these ports are already available in the DI container |
| Changing `hybrid_search` Rust signature is a breaking IPC change | Low | Certain | Both sides (adapter + command) are updated atomically in Phase 3 |
| `GraphService` depending on `SearchService` (Phase 2) creates a tighter coupling | Low | Medium | Acceptable — graph search already conceptually depends on the search pipeline |

---

## 8. Execution Order

```
Phase 1: Structured Queries in Omnibar (3-5 days)
  ├── 1.1 Add looks_structured() + routing logic
  ├── 1.2 Wire QueryBackends into SearchService
  ├── 1.3 Map query results to omnibar items
  ├── 1.4 Add syntax hints to omnibar UI
  └── 1.5 Tests

Phase 2: Shared Search Pipeline (1-2 days)
  ├── 2.1 Extract run_search_pipeline()
  ├── 2.2 Update GraphService to use shared pipeline
  └── 2.3 Tests

Phase 3: Scoped Hybrid Search (1-2 days)
  ├── 3.1 Update Rust hybrid_search signature
  ├── 3.2 Update hybrid.rs to accept scope
  ├── 3.3 Update TypeScript adapter
  ├── 3.4 Update SearchPort interface
  └── 3.5 Tests
```

**Total: ~1-2 weeks** (vs. 6-7 weeks in the original plan), with each phase independently shippable.

---

## 9. Success Criteria

1. User can type `notes with #rust` in omnibar and get results filtered by tag
2. User can type `named /regex/` in omnibar and get regex-matched note titles
3. Graph search produces identical results to before but calls the shared pipeline (no duplicated hybrid search logic)
4. `title:react` in omnibar triggers hybrid search scoped to titles (both FTS and vector legs)
5. All existing omnibar behavior unchanged for plain-text queries
6. No new abstraction layers — total new non-test code is ~250 lines across 0 new source files
