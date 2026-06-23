# Search FTS / Semantic Bug Fixes — Implementation Plan — 2026-06-23

Four correctness/efficiency fixes from the search review
(`carbide/research/2026-06-23_search_fts_semantic_review.md`), ordered by
priority. Internal-only product, 0 users — clean refactors preferred over
backwards-compat shims. All line references verified against source as of
2026-06-23.

## Triage summary

| Priority | ID  | Area                                    | Severity   | Effort | Root-cause confidence |
| -------- | --- | --------------------------------------- | ---------- | ------ | --------------------- |
| 1        | #1  | `looks_structured` false positives      | High       | S      | Confirmed             |
| 2        | #2  | `index_search` hardcoded FTS limit      | Medium-High| S      | Confirmed             |
| 2a       | #4  | Backend over-fetches 50 rows (from #2)  | Low-Med    | —      | Folded into #2        |
| 3        | #3  | Double query embedding in search graph  | Medium     | S–M    | Confirmed             |
| 3a       | #5  | Sequential async ops in search graph    | Low        | XS     | Optional, rides #3    |
| 4        | #6  | Inconsistent BM25 score sign            | Low        | XS     | Confirmed             |

Suggested batching: **#1 first** (highest user-facing impact, isolated to one
function + tests). **#2** next (Rust + TS adapter, touches MCP caller). **#3**
and **#5** ship together (same function, same graph-search path). **#6** last
(trivial, independent).

---

## FIX-1: `looks_structured` hijacks plain-English queries

**Component:** features/search (omnibar structured-query detection)
**Severity:** High
**Files:**
- `src/lib/features/search/application/search_service.ts:55-61` — `STRUCTURED_KEYWORDS`, `STRUCTURED_VALUE_SYNTAX`, `looks_structured`
- `tests/unit/services/omnibar_structured_query.test.ts:156-192` — `looks_structured` test suite

**Root cause:** `STRUCTURED_KEYWORDS` matches bare `in`, `with`, `named`, `not`
as standalone words **anywhere** in the query. When these appear at the **start**
of a query (e.g. `in progress`, `with images`, `named entities`), the parser
succeeds and routes through the query solver — `in` becomes a folder filter,
`named` becomes title-only FTS, `with` becomes content FTS — bypassing
hybrid/semantic search and returning wrong or empty results. Mid-query keywords
(e.g. `react in depth`) also trigger `looks_structured` but **fail to parse** and
fall back to hybrid, so they're safe by accident.

**Fix:** Rewrite `looks_structured` to trigger structured mode only when the
query has a **form prefix** (`notes`/`files`/`folders` at start) **or**
**unambiguous value syntax** (`#tag`, `/regex/`, `[[wikilink]]`, `"quoted
string"`, property operators `=`/`!=`/`>`/`<`/`>=`/`<=`) **or** the two-word
keyword `linked from`. Remove bare `in`/`with`/`named`/`not` keyword detection.

**Fix plan:**

1. In `search_service.ts:55-61`, replace the two regexes and `looks_structured`:

   ```ts
   const STRUCTURED_FORM_PREFIX = /^(?:notes?|files?|folders?)\s/i;
   const STRUCTURED_VALUE_SYNTAX =
     /(?:#\w|\/[^/]*\/|\[\[[^\]]*\]\]|"[^"]*"|(?:!=|>=|<=|=|>|<)(?:\s|$))/;
   const STRUCTURED_LINKED_FROM = /(?:^|\s)linked\s+from\s/i;

   export function looks_structured(query: string): boolean {
     return (
       STRUCTURED_FORM_PREFIX.test(query) ||
       STRUCTURED_VALUE_SYNTAX.test(query) ||
       STRUCTURED_LINKED_FROM.test(query)
     );
   }
   ```

2. No changes to the parser (`query_parser.ts`) or solver (`query_solver.ts`) —
   they already handle the valid structured forms correctly. The fix is purely
   in the detection gate.

3. No changes to `omnibar.svelte` `structured_hint` — it already fires on
   prefix matches, which now correctly correspond to actual structured queries.

**Test matrix** (update `tests/unit/services/omnibar_structured_query.test.ts`):

| Query                  | Expected | Why                                    |
| ---------------------- | -------- | -------------------------------------- |
| `notes named foo`      | `true`   | form prefix                            |
| `files in folder`      | `true`   | form prefix                            |
| `folders named test`   | `true`   | form prefix                            |
| `with #rust`           | `true`   | value syntax `#`                       |
| `named /regex/`        | `true`   | value syntax `/`                       |
| `in "Projects"`        | `true`   | value syntax `"`                       |
| `linked from foo`      | `true`   | `linked from` keyword                  |
| `not with #tag`        | `true`   | value syntax `#`                       |
| `with due_date = 2024` | `true`   | value syntax `=` (property operator)   |
| `#rust`                | `true`   | value syntax `#`                       |
| `/regex/`              | `true`   | value syntax `/`                       |
| `[[wikilink]]`         | `true`   | value syntax `[[`                      |
| `in progress`          | `false`  | no form prefix, no value syntax        |
| `with images`          | `false`  | no form prefix, no value syntax        |
| `named entities`       | `false`  | no form prefix, no value syntax        |
| `not today`            | `false`  | no form prefix, no value syntax        |
| `hello world`          | `false`  | plain text                             |
| `react components`     | `false`  | plain text                             |
| `` (empty)             | `false`  | empty                                  |
| `notification`         | `false`  | no standalone keyword                  |
| `within`               | `false`  | no standalone keyword                  |
| `> theme`              | `false`  | command prefix, `>` not followed by ws |

The existing test cases at `:157-191` cover a subset; add the new negative
cases (`in progress`, `with images`, `named entities`, `not today`) and the
property-operator positive case (`with due_date = 2024`).

**Verification:**
- `pnpm test -- tests/unit/services/omnibar_structured_query.test.ts`
- `pnpm check` (typecheck)
- `pnpm lint` (oxlint)

**Anti-pattern guards:**
- Do NOT add `not` back as a standalone keyword trigger — it's always
  accompanied by value syntax or a form prefix in valid queries.
- Do NOT change the parser or solver — they're correct; only the gate is wrong.
- Do NOT add quoted-string detection that matches unbalanced quotes — use
  `"[^"]*"` (closed quotes only) to avoid false positives on prose like
  `don't` contractions that happen to contain apostrophes (though `'` is not
  `"` so this is not a risk; still, keep the regex tight).

---

## FIX-2: `index_search` ignores client limit; silently caps to 50

**Component:** features/search (Rust FTS command + TS adapter)
**Severity:** Medium-High
**Files:**
- `src-tauri/src/features/search/service.rs:2127-2136` — `index_search` command
- `src/lib/features/search/adapters/search_tauri_adapter.ts:185-200` — `search_notes` adapter
- `src-tauri/src/features/mcp/shared_ops.rs:407` — internal caller

**Root cause:** `index_search` hardcodes `50` as the FTS limit
(`service.rs:2134`). The TS adapter (`search_tauri_adapter.ts:190-193`) never
forwards the `limit` argument — it passes only `{ vaultId, query }` then slices
client-side with `.slice(0, limit)`. The client slice can trim but never grow,
so the query solver's request for 200 results is silently capped at 50. This
also causes #4: even when the omnibar fallback wants 20, the backend fetches
and serializes 50 rows across IPC.

**Fix plan:**

1. **Rust** — `service.rs:2127-2136`: add a `limit: Option<usize>` parameter
   and use `limit.unwrap_or(50)` instead of the hardcoded `50`:

   ```rust
   pub fn index_search(
       app: AppHandle,
       vault_id: String,
       query: SearchQueryInput,
       limit: Option<usize>,
   ) -> Result<Vec<SearchHit>, String> {
       log::debug!("Searching index vault_id={} query={}", vault_id, query.text);
       let max = limit.unwrap_or(50);
       with_read_conn(&app, &vault_id, |conn| {
           search_db::search(conn, &query.text, query.scope, max, None)
       })
   }
   ```

   The `#[tauri::command]` + `#[specta::specta]` attributes stay. No generated
   bindings file exists (the adapter uses generic `tauri_invoke`), so the
   signature change is safe.

2. **TS adapter** — `search_tauri_adapter.ts:190-193`: forward `limit` in the
   IPC payload:

   ```ts
   const hits = await invoke_search<TauriSearchHit[]>("index_search", {
     vaultId: vault_id,
     query,
     limit,
   });
   ```

   The `limit` parameter already exists on `search_notes` (default `50`,
   `ports.ts:68-72`). The adapter just wasn't forwarding it.

3. **MCP caller** — `mcp/shared_ops.rs:407`: pass `Some(limit)` instead of
   relying on the default. The current code already does
   `.take(limit)` on the result; passing `Some(limit)` lets the backend
   short-circuit at the SQL level instead of fetching 50 and truncating:

   ```rust
   search_service::index_search(app.clone(), vault_id.to_string(), query_input, Some(limit))
   ```

4. **#4 is resolved by this change** — the omnibar fallback (`search_notes`
   with `limit=20`, `search_service.ts:264`) now fetches exactly 20 rows from
   SQLite instead of 50. No separate work needed.

**Test plan:**
- Add a test in `tests/unit/services/search_pipeline.test.ts` (or a new
  `tests/unit/adapters/` test) that asserts the adapter passes `limit` to the
  `index_search` IPC payload. Use a mock `tauri_invoke` that captures the
  payload and verifies `limit` is present.
- Existing tests use mock ports and won't break (the `limit` param is optional
  in the port interface).

**Verification:**
- `cd src-tauri && cargo check` (Rust typecheck)
- `pnpm check` (TS typecheck — the adapter change)
- `pnpm test` (Vitest)
- Manual: open omnibar, type a structured `with "common word"` query in a vault
  with >50 matching notes, confirm >50 results return (was capped at 50).

**Anti-pattern guards:**
- Do NOT change the `SearchQueryInput` struct — `limit` is a separate command
  parameter, not part of the query payload. This matches the pattern used by
  `index_suggest` (`service.rs:2140-2144`, which already has `limit: Option<usize>`).
- Do NOT remove the client-side `.slice(0, limit)` in the adapter — keep it as
  a defensive clamp; the backend limit is the primary control now.

---

## FIX-3: Redundant query embedding in the search graph

**Component:** features/search (embedding service) + features/graph (search graph)
**Severity:** Medium
**Files:**
- `src-tauri/src/features/search/embeddings.rs:11-15, 101-106` — `EmbeddingService` struct + `embed_one`
- `src/lib/features/graph/application/graph_service.ts:363-437` — `execute_search_graph`

**Root cause:** `execute_search_graph` triggers two BERT forward passes for the
same query text:
1. `run_search_pipeline` → `hybrid_search` → `model.embed_one(&query.text)` (`hybrid.rs:17`)
2. `semantic_search` → `model.embed_one(&query)` (`service.rs:2536`)

`embed_one` has no cache (`embeddings.rs:101-106` — calls `embed_batch` directly).
The second embedding's sole output is `semantic_boost_paths` — a `Map<path,
distance>` used to nudge neighbor scoring. This map is **not** derivable from
hybrid hits today: `rrf_merge` discards vector distance (`_distance` at
`hybrid.rs:65`), and `HybridSearchHit` carries no distance field (`model.rs:51-54`).

**Fix:** Add a single-entry query-text cache to `EmbeddingService::embed_one`.
Both embedding calls go through the same `EmbeddingService` instance (via
`embedding_state.get_or_init`), and the calls are sequential, so the second
call hits the cache. This eliminates the redundant BERT forward pass without
changing any interface, port, or struct.

**Fix plan:**

1. **Rust** — `embeddings.rs:11-15`: add a cache field to the struct:

   ```rust
   use std::sync::Mutex;

   pub struct EmbeddingService {
       model: BertModel,
       tokenizer: Tokenizer,
       device: Device,
       cache: Mutex<Option<(String, Vec<f32>)>>,
   }
   ```

2. **Rust** — `embeddings.rs:94-98` (`new`): initialize the cache:

   ```rust
   Ok(Self {
       model,
       tokenizer,
       device,
       cache: Mutex::new(None),
   })
   ```

3. **Rust** — `embeddings.rs:101-106` (`embed_one`): check cache before
   computing:

   ```rust
   pub fn embed_one(&self, text: &str) -> Result<Vec<f32>, String> {
       {
           let cache = self.cache.lock().map_err(|e| e.to_string())?;
           if let Some((cached_text, ref cached_vec)) = *cache {
               if cached_text == text {
                   return Ok(cached_vec.clone());
               }
           }
       }
       let mut results = self.embed_batch(&[text], None)?;
       let result = results
           .pop()
           .ok_or_else(|| "no embedding result".to_string())?;
       let mut cache = self.cache.lock().map_err(|e| e.to_string())?;
       *cache = Some((text.to_string(), result.clone()));
       Ok(result)
   }
   ```

   The cache holds exactly one entry (the last query). No eviction logic needed
   — a new `EmbeddingService` is created on model change. The lock is held only
   for the HashMap check/store, not during `embed_batch` (the expensive forward
   pass runs outside the lock).

4. **Do NOT change `hybrid_search`, `HybridSearchHit`, or `rrf_merge`** — the
   cache alone eliminates the redundant computation. Threading distance through
   `rrf_merge` into `HybridSearchHit` would require changing a `#[derive(Type)]`
   struct, regenerating TS bindings, and updating the port interface —
   over-engineering for this fix.

**Optional FIX-5: concurrent async ops** (`graph_service.ts:363-437`):

With the cache in place, `semantic_search` no longer adds a BERT forward pass
to the critical path (it hits the cache). The remaining cost is one IPC
round-trip + one KNN. To shave that, race `semantic_search` concurrently with
`run_search_pipeline`:

```ts
const [pipeline_result, sem_hits_result] = await Promise.all([
  this.search_service.run_search_pipeline(vault_id, query, { limit: 50 }),
  this.search_port.semantic_search(vault_id, query, 20).catch(() => []),
]);
const { hits } = pipeline_result;
```

Then derive `semantic_boost_paths` from `sem_hits_result`. Note: with
concurrent calls, both may miss the cache and embed simultaneously (race). The
cache still helps for any *subsequent* same-query calls. This is acceptable —
the worst case is the current behavior (one redundant embedding), not worse.

**This is optional** — ship #3 (cache) first, measure, then decide if #5 is
worth the concurrency complexity.

**Test plan:**
- Add a Rust unit test in `embeddings.rs` (or a new test module) that calls
  `embed_one` twice with the same text and asserts the second call returns
  the same vector (and ideally that `embed_batch` is called once — though
  without mocking the model, this may require a test-only counter).
- Add a TS test in `tests/unit/services/` that asserts `execute_search_graph`
  calls `semantic_search` and `run_search_pipeline` (existing behavior
  preserved).

**Verification:**
- `cd src-tauri && cargo check`
- `cd src-tauri && cargo test` (embedding cache test)
- `pnpm test` (graph service tests)
- `pnpm check`

**Anti-pattern guards:**
- Do NOT hold the Mutex lock during `embed_batch` — that would serialize all
  embedding calls across threads. Hold it only for the cache read/write.
- Do NOT add a full LRU cache or TTL — a single-entry cache is sufficient for
  the sequential same-query pattern. Over-engineering.
- Do NOT change `HybridSearchHit` to carry distance — unnecessary for this fix.

---

## FIX-6: Inconsistent BM25 score sign in `index_suggest`

**Component:** features/search (Rust suggest command)
**Severity:** Low
**Files:**
- `src-tauri/src/features/search/service.rs:2138-2183` — `index_suggest`

**Root cause:** BM25 scores from FTS5 are negative (more negative = better
match). `index_suggest` only negates scores to positive when FTS returns <5
hits (the fuzzy-merge path). When FTS returns ≥5 hits, it returns early with
raw negative scores. The exposed `score` field flips sign/scale depending on
result count. Currently masked because `merge_wiki_suggestions`
(`search_service.ts:86-153`) relies on array order, not score value — but any
consumer sorting by `score` would misorder.

**Fix plan:**

1. **Rust** — `service.rs:2153-2163`: move the score negation **before** the
   threshold check so it applies unconditionally:

   ```rust
   with_read_conn(&app, &vault_id, |conn| {
       let mut fts_results = search_db::suggest(conn, &query, max)?;
       // BM25 scores are negative (more negative = better match).
       // Normalize to positive (higher = better) unconditionally so
       // consumers get a consistent scale regardless of result count.
       for hit in &mut fts_results {
           hit.score = -hit.score;
       }
       if fts_results.len() >= fuzzy_threshold {
           return Ok(fts_results);
       }
       let fuzzy_results = search_db::fuzzy_suggest(conn, &query, max)?;
       // ... rest unchanged (merge + sort + truncate)
   })
   ```

2. The downstream `merged.sort_by(|a, b| b.score.partial_cmp(&a.score))`
   (`service.rs:2176-2180`) already expects higher = better, so positive
   scores are correct for both the early-return path and the merge path.

**Test plan:**
- Add a Rust integration test that calls `index_suggest` with a query matching
  ≥5 notes and asserts all returned `score` values are positive.
- Add a test with a query matching <5 notes and assert the same (existing
  behavior, now also positive — should already pass).

**Verification:**
- `cd src-tauri && cargo check`
- `cd src-tauri && cargo test`
- `pnpm test`

**Anti-pattern guards:**
- Do NOT change the fuzzy-merge logic or the threshold — only the score
  normalization timing changes.
- Do NOT sort the early-return path — the SQL `ORDER BY rank` already returns
  best-first; negating scores preserves that order (just flips the sign).

---

## Execution order

1. **FIX-1** → verify: `pnpm test`, `pnpm check`, `pnpm lint`
2. **FIX-2** → verify: `cargo check`, `pnpm check`, `pnpm test`
3. **FIX-3** → verify: `cargo check`, `cargo test`, `pnpm test`, `pnpm check`
4. **FIX-6** → verify: `cargo check`, `cargo test`
5. **(Optional) FIX-5** → verify: `pnpm test`, `pnpm check`
6. **Final gate** — run all post-edit checks per AGENTS.md:
   - `pnpm check` — Svelte/TypeScript type checking
   - `pnpm lint` — oxlint linting
   - `pnpm test` — Vitest unit/integration tests
   - `cd src-tauri && cargo check` — Rust type checking
   - `pnpm format` — Prettier (writes formatting)

Each fix is independently committable. Commit after each verified fix per the
git-workflow skill (commit early, commit often).
