# Search Review: FTS / Semantic Search (Omnibar + Search Graph)

**Date**: 2026-06-23
**Scope**: Review-only. No code changed.
**Surface**: Omnibar (`Cmd+K`), Search Graph (`Cmd+Alt+G`), hybrid search engine (Rust).

## Architecture summary (as found)

```
Omnibar input (150ms debounce)
  → SearchService.search_omnibar
      ├─ parse_search_query → domain routing (commands/planned/notes)
      ├─ looks_structured? → parse_query + solve_query  (query language)
      ├─ semantic enabled? → run_search_pipeline → SearchPort.hybrid_search
      │                        └─ Rust: embed_one + FTS5 + HNSW → RRF merge
      └─ fallback → SearchPort.search_notes → Rust index_search (FTS5 only)

Search graph (Cmd+Alt+G)
  → GraphService.execute_search_graph
      ├─ run_search_pipeline (hybrid, limit 50)
      ├─ semantic_search_batch (KNN edges among hits)
      └─ semantic_search (query KNN → neighbor boost map)
      → extract_search_subgraph (hits + 1-hop wiki neighbors)
```

FTS5 schema: `title, name, path, body` (column declaration order). FTS5's built-in `bm25()` takes only **per-column weights** in that order — it exposes no k1/b knobs (internally fixed at k1=1.2, b=0.75; no custom `bm25` is registered anywhere in `src-tauri`). Search weights: `bm25(notes_fts, 10.0, 12.0, 5.0, 1.0)` → title=10.0, **name=12.0 (highest)**, path=5.0, body=1.0 — the filename stem, not the title, is the most-weighted column. Suggest weights: `bm25(notes_fts, 15.0, 20.0, 5.0, 0.0)` → title=15.0, **name=20.0 (highest)**, path=5.0, **body=0.0 (zero-weighted)**, with the MATCH expression restricted to `{title name path}` columns (`db.rs:2759`). Vector index: HNSW (cosine), 384-dim (default model `snowflake-arctic-embed-xs`, not BGE-small — that is one selectable option among several). RRF `K=60`.

---

## Bugs (correctness)

### 1. `looks_structured` hijacks plain-English queries — HIGH

`src/lib/features/search/application/search_service.ts:55-61`

```ts
const STRUCTURED_KEYWORDS =
  /(?:^|\s)(?:notes?|files?|folders?|named|with|in|linked\s+from|not)\s/i;
```

The regex treats standalone `in`, `with`, `named`, `not` **anywhere** in the query as a structured-query trigger. When the keyword is at the **start** of the query, the parser *succeeds* and routes through the query solver, bypassing hybrid/semantic search entirely:

| Query | Parsed as | Effect |
|-------|-----------|--------|
| `in progress` | `in "progress"` → folder filter | Returns notes inside a `progress/` folder, or **empty**. Never a content search. (`query_solver.ts:248-263`) |
| `named entities` | `named "entities"` → **title-scope only** FTS | Loses all body matches. (`query_solver.ts:237-241`) |
| `with images` | `with "images"` → content FTS via solver | Bypasses semantic; closest to intended but still wrong path. |
| `not today` | `not` + parse returns `{ok:false}` → falls back | OK by accident. |

`in` at the **start** of the query is the worst case: a completely normal content query silently becomes a folder filter and returns nothing. The omnibar's `structured_hint` (`omnibar.svelte:191-202`) fires on **prefix** matches (`q.startsWith("in ")` / `startsWith("with ")` / `startsWith("named ")`), so these prefix forms surface a syntax hint — but the result is still wrong or empty. Mid-query keywords (e.g. `react in depth`) trigger `looks_structured` but **fail to parse**: `parse_single_clause` throws `ParseError` on the first non-keyword word (`query_parser.ts:147-153`), `parse()` returns `{ok:false}`, the `if (parse_result.ok)` guard (`search_service.ts:571`) skips structured mode and falls back to hybrid — returning results. The mid-query path is safe by accident; the prefix forms are the real harm.

The test suite gives false confidence — `tests/unit/services/omnibar_structured_query.test.ts:178-191` only asserts `looks_structured("hello world")` and `("react components")` are false. No test covers `in progress` / `with images` / `named entities`.

**Fix direction**: require a form prefix (`notes`/`files`/`folders`) or unambiguous value syntax (`#tag`, `/regex/`, `[[wikilink]]`) to trigger structured mode; don't treat bare `in`/`with`/`named` mid-query as structured.

### 2. `index_search` ignores client limit; silently caps structured queries to 50 — MEDIUM-HIGH

`src-tauri/src/features/search/service.rs:2134` hardcodes the limit:

```rust
pub fn index_search(app, vault_id, query) -> ... {
    with_read_conn(&app, &vault_id, |conn| {
        search_db::search(conn, &query.text, query.scope, 50, None)  // ← hardcoded
    })
}
```

The adapter (`search_tauri_adapter.ts:190-194`) never forwards `limit`:

```ts
const hits = await invoke_search<TauriSearchHit[]>("index_search", {
  vaultId: vault_id, query,   // ← no limit field
});
return hits.slice(0, limit).map(...)  // client slice only trims; can't grow
```

The query solver requests **200** (`query_solver.ts:208,240`) but receives at most 50. So structured `with`/`named` content queries can never return more than 50 results regardless of vault size. The omnibar FTS fallback requests 20 and gets 50 (wasteful, see #4).

Tests don't catch this — `tests/unit/services/search_pipeline.test.ts:162-180` tests the limit on `run_search_pipeline` (hybrid path, which *does* accept a limit) using a **mock** port; the real `index_search` FTS path is never exercised with a limit.

---

## Inefficiencies

### 3. Redundant query embedding in the search graph — MEDIUM

`src/lib/features/graph/application/graph_service.ts:363-437`

`execute_search_graph` computes the query embedding **twice**:
- `run_search_pipeline` → `hybrid_search` → `model.embed_one(&query.text)` (`hybrid.rs:17`)
- `semantic_search` → `model.embed_one(&query)` (`service.rs:2536`)

`embed_one` has no cache (`embeddings.rs:101-106` — calls `embed_batch` directly). The second embedding runs a full BERT forward pass whose sole output is `semantic_boost_paths` — a distance map used to nudge neighbor scoring. This map is **not** derivable from the hybrid hits: `rrf_merge` discards vector distance on contact (`_distance` at `hybrid.rs:65`), and `HybridSearchHit` carries no distance field (`model.rs:51-54`; `TauriHybridSearchHit` at `adapter:82-85`). Doubling the model inference adds latency to every graph search on top of the FTS + 2× KNN.

### 4. Backend always fetches 50 FTS rows — LOW-MEDIUM

Consequence of #2. Even when the omnibar FTS fallback wants 20 results, `index_search` always runs the FTS5 query with `LIMIT 50`, serializes 50 rows across IPC, then the client slices to 20. Wasted SQLite + IPC work on the most common fallback path.

### 5. Sequential async ops in search graph — LOW

`graph_service.ts:363-437`. The three backend calls are fully sequential, but `semantic_search` (depends only on `query`) is independent of `run_search_pipeline` and could race concurrently. On a warm index this shaves one IPC round-trip + one KNN off the critical path.

### 6. Inconsistent BM25 score sign in `index_suggest` — LOW

`src-tauri/src/features/search/service.rs:2155-2163`

```rust
if fts_results.len() >= fuzzy_threshold { return Ok(fts_results); } // scores negative (raw BM25)
for hit in &mut fts_results { hit.score = -hit.score; }             // scores positive
```

When FTS returns ≥5 hits, `score` stays negative (BM25: more negative = better). When <5, it's negated to positive before merging with fuzzy results. The exposed `score` field flips sign/scale depending on result count. Currently masked because `merge_wiki_suggestions` relies on array order rather than score value, but any consumer that sorts by `score` (e.g., the `@`-palette) would misorder.

---

## Design observations (not bugs, but worth noting)

### 7. Post-RRF title boost undermines semantic recall — design tradeoff

`src-tauri/src/features/search/hybrid.rs:95-107`. After RRF fusion, `term_overlap*0.3` and `title_contains_query*0.3` boosts are applied to *all* hits, including vector-only hits fetched from `get_note_meta`. A semantically-similar note with no lexical title overlap is penalized relative to a title-matching note, partially defeating semantic retrieval. Intentional lexical bias, but it does reduce the recall advantage of the vector arm.

### 8. `find_similar_notes` exclude-linked fetch limit — minor

`service.rs:2573`: `fetch_limit = limit + 20`. A note linked to >20 others can exhaust the candidate pool before filling `limit`, returning fewer similar notes than requested.

### 9. Date-range vector over-fetch — acknowledged

`hybrid.rs:24-28`: over-fetches `(limit*20).max(500)` vector hits then filters by mtime. Documented as graceful degradation (FTS covers the gap); not a defect.

---

## Test-coverage gaps

- The FTS limit path (`index_search`) is never tested with a real limit — all service tests use mock ports, so #2 is invisible to the suite.
- `looks_structured` has no test for `in progress` / `with images` / `named entities` — the prefix forms that parse successfully and return wrong/empty results (the actual failure mode in #1). Existing tests only cover negative cases like `hello world` / `react components`.
- No test asserts that the search graph doesn't double-embed the query (#3).

---

## Priority

1. **#1** (structured false positive) — user-facing, returns wrong/empty results for common queries. Highest impact, lowest risk to fix.
2. **#2** (FTS limit) — silent result cap on structured queries; fix is to thread `limit` through `index_search`.
3. **#3** (double embedding) — latency on every graph search; cache `embed_one`, or have `hybrid_search` return the query vector for reuse, or thread distance through `rrf_merge` into `HybridSearchHit` (the boost map is not derivable from current hybrid hits — they carry no distance).
4. **#6** (score sign) — latent; cheap to normalize unconditionally.

---

## Key file references

| Concern | File | Lines |
|---------|------|-------|
| Structured detection regex | `src/lib/features/search/application/search_service.ts` | 55-61 |
| Omnibar search orchestration | `src/lib/features/search/application/search_service.ts` | 547-667 |
| Omnibar debounce + dispatch | `src/lib/features/search/application/omnibar_actions.ts` | 279-319, 499-535 |
| Query parser | `src/lib/features/query/domain/query_parser.ts` | 30-458 |
| Query solver (in/with/named) | `src/lib/features/query/domain/query_solver.ts` | 111-301 |
| FTS match expression | `src-tauri/src/features/search/db.rs` | 2544-2593 |
| FTS search (BM25, hardcoded limit) | `src-tauri/src/features/search/db.rs` | 2658-2727 |
| index_search command (hardcoded 50) | `src-tauri/src/features/search/service.rs` | 2127-2136 |
| index_suggest (score sign) | `src-tauri/src/features/search/service.rs` | 2138-2183 |
| Hybrid search (embed + fuse) | `src-tauri/src/features/search/hybrid.rs` | 9-129 |
| hybrid_search command | `src-tauri/src/features/search/service.rs` | 2744-2778 |
| semantic_search command | `src-tauri/src/features/search/service.rs` | 2525-2553 |
| Search graph pipeline (double embed) | `src/lib/features/graph/application/graph_service.ts` | 363-437 |
| Search subgraph extraction | `src/lib/features/graph/domain/search_subgraph.ts` | 28-300 |
| Omnibar ranking | `src/lib/features/search/domain/omnibar_ranking.ts` | 1-136 |
| HNSW vector index | `src-tauri/src/features/search/hnsw_index.rs` | 21-299 |
| Embedding service (no cache) | `src-tauri/src/features/search/embeddings.rs` | 101-106 |
| Search adapter (no limit forwarding) | `src/lib/features/search/adapters/search_tauri_adapter.ts` | 185-200 |
