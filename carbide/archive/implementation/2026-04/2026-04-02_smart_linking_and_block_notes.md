# Smart Linking & Block-Level Notes Design

**Date:** 2026-04-02
**Updated:** 2026-04-05 (infrastructure review — corrected current state, revised scope, feasibility revisions)
**Status:** Proposal (Revised)
**Related Features:** `links`, `search`, `metadata`, `editor`, `bases`, `markdown_lsp`

---

## Infrastructure Review (2026-04-05)

A review of the existing codebase revealed that several subsystems assumed to be incomplete are actually fully functional. This section captures the findings and their impact on the design.

### What Already Works

| Subsystem                       | Status                                                                                 | Key Files                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `note_sections` table           | **Populated** — `extract_markdown_structure()` runs on every `upsert_note_simple()`    | `src-tauri/src/features/search/db.rs:311`                     |
| `note_headings` table           | **Populated** — headings with slugs, levels, line numbers                              | `src-tauri/src/features/search/db.rs:423`                     |
| `note_code_blocks` table        | **Populated** — language, line, length                                                 | `src-tauri/src/features/search/db.rs:436`                     |
| Note-level embeddings           | **Fully functional** — Snowflake Arctic Embed XS (384-dim), batch indexing, KNN search | `src-tauri/src/features/search/embeddings.rs`, `vector_db.rs` |
| Semantic similarity suggestions | **Fully functional** — `find_similar_notes()` powers the Suggested Links panel         | `src-tauri/src/features/search/service.rs:1576`               |
| Hybrid search (FTS + vector)    | **Fully functional** — RRF merging, title-match bonus                                  | `src-tauri/src/features/search/hybrid.rs`                     |
| Wiki-link autocomplete          | **Fully functional** — FTS + fuzzy fallback + planned link suggestions                 | `src/lib/features/search/application/search_service.ts:318`   |
| Outlinks / backlinks tables     | **Populated** — `get_outlinks()`, `get_backlinks()`, outlink counts                    | `src-tauri/src/features/search/db.rs:2373,3605`               |
| LSP `documentSymbol`            | **Working** — hierarchical heading outline from IWES/Marksman                          | `src-tauri/src/features/markdown_lsp/service.rs:999`          |
| LSP `workspace/symbol`          | **Working** — cross-vault heading/symbol search                                        | `src-tauri/src/features/markdown_lsp/service.rs:722`          |
| LSP `references`                | **Working** — find all notes linking to a target (backlinks)                           | `src-tauri/src/features/markdown_lsp/service.rs:612`          |
| LSP `completion` (wiki-links)   | **Working** — `[[` trigger, heading anchors via `[[note#heading]]`                     | `src-tauri/src/features/markdown_lsp/service.rs`              |
| LSP `rename`                    | **Working** — rename note/heading, updates all references                              | `src-tauri/src/features/markdown_lsp/service.rs:754`          |
| LSP diagnostics                 | **Working** — broken link detection                                                    | via IWES/Marksman                                             |
| IWES code actions               | **Working** — extract section, inline, sort, create link                               | `src-tauri/resources/iwe-default-config.toml`                 |

### LSP Health (2026-04-05)

The LSP infrastructure is architecturally solid but was recently stabilized after a series of real-world bugs:

- **CPU loop** from unhandled `workspace/inlayHint/refresh` requests (fixed `b808346a`, 2026-04-03)
- **Retry storm** where reactive `$effect` re-triggered broken binary starts infinitely (fixed `e1ed2285`, 2026-04-05)
- **Zombie processes** from not stopping old client before starting new (fixed `7b2eb6bc`)
- **macOS quarantine/codesign** preventing LSP binary from running (fixed `b378c85b`)

The restartable client (3-retry exponential backoff, IWES→Marksman fallback) works correctly now. These fixes are days old — a soak period is advisable before building new features that depend heavily on LSP reliability.

### Known Limitations

1. **KNN search is brute-force O(n).** `knn_search` in `vector_db.rs` loads all embeddings into memory and computes dot product linearly. This is acceptable for note-level embeddings (hundreds to low thousands), but block embeddings will produce 5-20x more rows. For MVP, brute-force is fine up to ~10k sections. Beyond that, consider sqlite-vec or pre-filtering by vault/folder. Don't over-engineer upfront, but acknowledge the ceiling.

2. **Hybrid search silently drops vector-only hits.** `hybrid.rs` uses a `filter_map` that discards vector-only results lacking FTS metadata. Smart link rules must call `knn_search` / `find_similar_notes()` directly, never hybrid search.

3. **Links feature has no Rust backend or dedicated port.** The `links/` feature is entirely frontend TypeScript. `LinksService` reuses `SearchPort` and `MarkdownLspPort` — there is no `LinksPort`. Smart link rule execution should be exposed through `SearchPort` (new methods), not a separate port, following the existing pattern.

### Impact on Design

1. **`block_index.rs` and `note_blocks` table are unnecessary.** `note_sections` + `note_headings` + `note_code_blocks` already cover the block model. A thin query layer over the existing tables replaces the proposed unified table.
2. **Tier 1 metadata rules are trivial SQL queries** against tables that already exist and are populated. No "rule engine" needed — just write the queries behind toggles.
3. **Tier 2 `semantic_similarity` is already implemented** as `find_similar_notes()`. The Suggested Links panel already shows this.
4. **LSP provides heading-level link resolution at runtime** via `documentSymbol` and `workspace/symbol`. Custom heading extraction for link autocomplete is redundant — the LSP handles `[[note#heading]]` completion.
5. **The real gap is block-level embeddings.** Note-level embeddings exist; section/heading-level embeddings do not. This is the primary new capability to build.

---

## Overview

This document covers two related features:

1. **Smart Linking** — implicit note discovery through metadata rules and semantic similarity
2. **Block-Level Notes** — AST-aware block granularity for link precision and draggable content units

Both features build on existing infrastructure: the SQLite-backed search index, embedding pipeline, mdast parsing, the bases query system, and the markdown LSP (IWES/Marksman).

---

## Feature 1: Smart Linking

### Problem

Currently, linking is entirely explicit — users must manually create `[[wiki-links]]` or use the link suggestion dialog. Notes that are topically related, created in the same context, or semantically similar remain undiscovered unless a human happens to remember and link them.

### Solution

A configurable rule-based system that surfaces implicit connections between notes. Rules are toggleable, similar to how bases queries are constructed. Links discovered by smart-linking are surfaced as "suggested links" (same UX as current `SuggestedLink` type) but with provenance indicating which rule(s) triggered the suggestion. Implicit composition emerges naturally from weighted score aggregation — notes that match multiple independent rules rank higher without requiring an explicit AND engine.

### Rule Taxonomy

Rules are organized into two tiers:

#### Tier 1: Metadata Co-occurrence

Single-signal rules that are cheap to compute and have broad recall. **All backing tables are already populated during indexing — these are straightforward SQL queries.**

| Rule               | Signal                                                  | Implementation                                        | Exists?    |
| ------------------ | ------------------------------------------------------- | ----------------------------------------------------- | ---------- |
| `same_day`         | Both notes created/modified on the same calendar day    | Query `notes` table by `date(mtime_ms)`               | Query only |
| `same_folder`      | Notes in the same directory                             | Query `notes` table by `path` prefix                  | Query only |
| `shared_property`  | Same property key-value pair (e.g., `project: carbide`) | Query `note_properties` table                         | Query only |
| `shared_tag`       | One or more overlapping tags                            | Query `note_inline_tags` table                        | Query only |
| `citation_network` | Notes citing the same reference                         | Query `notes.linked_source_id` or `reference` feature | Query only |

#### Tier 2: Semantic Similarity

Content-based rules that use the existing embedding pipeline:

| Rule                  | Signal                             | Implementation                                  | Exists?                                                                |
| --------------------- | ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `semantic_similarity` | Cosine similarity above threshold  | `knn_search` on `note_embeddings` table         | **Yes** — `find_similar_notes()` already powers Suggested Links        |
| `title_overlap`       | Significant term overlap in titles | Tokenize + Jaccard similarity on `title` column | Query only                                                             |
| `shared_outlinks`     | Both notes link to the same target | Query `outlinks` table for shared `target_path` | **Partially** — `outlinks` table populated; shared-target query is new |

#### ~~Tier 3: Hierarchical / Composite~~ — Deferred

Explicit composite rules (AND of Tier 1 + Tier 2) are **deferred**. Weighted score aggregation across independent rules already provides implicit composition — notes matching `same_day` AND `semantic_similarity` will naturally score highest when both rules are enabled. Build explicit AND-composition only if real usage shows the implicit approach is insufficient.

The one exception is `block_level_semantic` which depends on block embeddings (Feature 2) and is tracked in Feature 2's phases.

### Architecture

#### Data Model

```typescript
type SmartLinkRule = {
  id: string; // e.g., "same_day", "semantic_similarity"
  name: string; // Human-readable
  enabled: boolean; // Toggle
  weight: number; // 0-1, influences ranking
  config: Record<string, unknown>; // Rule-specific params (thresholds, etc.)
};

type SmartLinkRuleGroup = {
  id: string; // e.g., "metadata", "semantic"
  name: string;
  rules: SmartLinkRule[];
  enabled: boolean; // Master toggle for group
};

type SmartLinkSuggestion = {
  source: NoteMeta;
  target: NoteMeta;
  score: number; // Weighted composite score
  rules: { rule_id: string; raw_score: number }[]; // Provenance
};
```

#### Storage

- Rules read/written by Rust via Tauri commands (`smart_links_load_rules` / `smart_links_save_rules`), persisted as JSON in `.carbide/smart-links/rules.json` per vault (same pattern as bases views). Default rules created on first access. TS service calls port methods, never touches filesystem.
- Suggestions are computed on-demand, not persisted (ephemeral like current link suggestions)
- For block-level rules (Feature 2), block embeddings stored in new `block_embeddings` table

#### Execution Model

```
┌─────────────────────────────────────────────────┐
│  SmartLinkService.compute_suggestions(note)      │
│                                                  │
│  1. Load enabled rules from vault config         │
│  2. For each enabled rule group (parallel):      │
│     ├─ Metadata rules → SQL queries              │
│     └─ Semantic rules → KNN vector search        │
│  3. Merge results, deduplicate by target         │
│  4. Score: sum(rule.weight * raw_score)          │
│  5. Sort, truncate, return SmartLinkSuggestion[] │
└─────────────────────────────────────────────────┘
```

**Important:** Smart link rules must call `knn_search` / `find_similar_notes()` directly for semantic rules. Do not route through hybrid search — it silently drops vector-only hits that lack FTS metadata.

#### Integration Points

- **Links feature**: Extend `LinksService` to call smart link Tauri commands via `SearchPort` and merge results into `SuggestedLink[]`. Existing `load_suggested_links()` becomes a union of explicit wiki-link suggestions + smart-link suggestions.
- **Search feature**: Reuse `find_similar_notes()` for the `semantic_similarity` rule. No new embedding infrastructure needed for note-level rules.
- **Bases feature**: Rule configuration UI reuses bases query patterns (filter builder, property picker).
- **LSP feature**: LSP `references` can validate/enrich backlink-based rules. LSP `workspace/symbol` can power heading-aware suggestions.

#### Rust/TS Split

- **Rust** (`src-tauri/src/features/smart_links/`): Rule execution engine, SQL queries, KNN search orchestration, config persistence (`smart_links_load_rules`, `smart_links_save_rules`, `smart_links_compute_suggestions`)
- **TypeScript** (`src/lib/features/smart_links/`): Store, service, actions, UI for rule configuration
- **Port interface**: Extend `SearchPort` with `compute_smart_link_suggestions(vault_id, note_path) → SmartLinkSuggestion[]`, `load_smart_link_rules(vault_id) → SmartLinkRuleGroup[]`, `save_smart_link_rules(vault_id, rules) → void`. This follows the existing pattern where `LinksService` delegates to `SearchPort` rather than having a dedicated `LinksPort`.

#### SuggestedLink Type Extension

Extend the existing `SuggestedLink` type to carry provenance:

```typescript
export type SuggestedLink = {
  note: NoteMeta;
  similarity: number;
  rules?: { rule_id: string; raw_score: number }[]; // Provenance (optional for backward compat)
};
```

Existing semantic-only suggestions get `rules: [{ rule_id: "semantic_similarity", raw_score: similarity }]`. UI shows provenance chips when `rules` is present.

#### Configuration UI

Rule configuration lives in vault settings, organized by group:

```
Smart Linking
├── Metadata Rules
│   ├── [x] Same day creation/modification
│   ├── [ ] Same folder
│   ├── [x] Shared properties
│   └── [x] Shared tags
└── Semantic Rules
    ├── [x] Semantic similarity (threshold: 0.75)
    ├── [ ] Title overlap
    └── [ ] Shared outlinks
```

### Implementation Phases (Revised)

**Phase 1: Metadata Rules** — low effort, high value

- Rule infrastructure (types, store, config persistence via Rust Tauri commands)
- Implement `same_day`, `shared_tag`, `shared_property` as SQL queries against existing tables
- Extend `SearchPort` with smart link methods
- Integrate with `LinksService.load_suggested_links()`
- Extend `SuggestedLink` type with optional provenance
- No new indexing or tables needed

**Phase 2: Semantic Rules** — mostly wiring

- Wire `semantic_similarity` rule to existing `find_similar_notes()` (call directly, not through hybrid search)
- Add `title_overlap` and `shared_outlinks` queries
- Scoring/merging logic to combine with Tier 1 results via weighted aggregation

---

## Feature 2: Block-Level Notes

### Problem

Links currently resolve to entire notes. When a user links to `[[meeting-notes#action-items]]`, the `#action-items` anchor is acknowledged but not semantically indexed — there's no way to discover that a specific heading/block is related to another note's content. Additionally, the editor has no concept of draggable, reorganizable content units.

### Current State Assessment (Corrected 2026-04-05)

**What already exists and is populated:**

- `note_sections` table: `(path, heading_id, level, title, start_line, end_line, word_count)` — **populated on every note index** via `extract_markdown_structure()` in `db.rs:311`
- `note_headings` table: `(note_path, level, text, line)` — **populated**, with slug generation and occurrence deduplication (`db.rs:423`)
- `note_code_blocks` table: `(path, line, language, length)` — **populated** (`db.rs:436`)
- `note_sections` sync: `sync_sections()` — **populated**, spans between headings with word counts (`db.rs:449`)
- `note_links` table with `section_heading` and `target_anchor` columns — schema exists (population status TBD)
- mdast parsing infrastructure (`parse_to_mdast()`) — **fully functional**
- ProseMirror editor with AST-aware round-trip — **fully functional**
- LSP `documentSymbol` — **fully functional**, provides hierarchical heading outline at runtime
- LSP `workspace/symbol` — **fully functional**, cross-vault heading search
- LSP `completion` for `[[note#heading]]` — **functional**, heading anchors in wiki-link autocomplete
- IWES code actions (extract section, inline, create link) — **functional**

**What's actually missing:**

- ~~Block/section extraction during indexing~~ → **Already done.** `upsert_note_simple()` calls `extract_markdown_structure()`
- Block-level embeddings (current embeddings are note-level only) → **Genuine gap**
- Block-level semantic similarity search → **Genuine gap** (depends on block embeddings)
- Draggable block UI in the editor → **Genuine gap** (ProseMirror nodes exist but no drag handles)

### Solution (Revised)

The original design proposed a new `block_index.rs` module and `note_blocks` table. **This is unnecessary.** The existing `note_sections` + `note_headings` + `note_code_blocks` tables already provide the block model. The LSP provides runtime heading discovery and link resolution.

The revised approach:

1. **No new block extraction code** — `extract_markdown_structure()` already does this
2. **No `note_blocks` table** — query existing tables with a thin unifying layer if needed
3. **Add `block_embeddings` table** — this is the genuine new capability
4. **Extend embedding pipeline** to embed sections (keyed by `path + heading_id`)
5. **Draggable blocks in editor** — ProseMirror plugin (no DB changes)
6. **Leverage LSP** for heading-level link autocomplete (already works for `[[note#heading]]`)

**Key design decision: Blocks are NOT stored as separate database records.** They are derived from the markdown AST during indexing and stored as index metadata (sections, headings, code blocks). The editor's ProseMirror model already represents content as block-level nodes (paragraphs, headings, list items, code blocks). We expose this structure for linking and dragging without duplicating content.

### Block Model

The existing tables already provide the block model:

```sql
-- Already populated:
note_sections(path, heading_id, level, title, start_line, end_line, word_count)
note_headings(note_path, level, text, line)
note_code_blocks(path, line, language, length)

-- New (block embeddings only):
CREATE TABLE block_embeddings (
  path TEXT NOT NULL,
  heading_id TEXT NOT NULL,
  embedding BLOB NOT NULL,
  PRIMARY KEY (path, heading_id),
  FOREIGN KEY (path) REFERENCES notes(path)
);
```

A TypeScript query type can unify the view if the UI needs a single block list:

```typescript
type BlockType = "heading" | "code_block" | "section";

type NoteBlock = {
  note_path: NotePath;
  block_id: string; // heading_id from note_sections, or `code-{line}` for code blocks
  type: BlockType;
  level?: number;
  title: string;
  start_line: number;
  end_line: number;
  word_count: number;
};
```

### ~~Indexing Changes~~ → Embedding Pipeline Extension

#### ~~New module: `block_index.rs`~~ → Not needed

`extract_markdown_structure()` in `db.rs:311` already handles:

- Heading extraction with slug generation
- Section span computation (start_line to next heading)
- Code block extraction with language detection
- Word count per section

#### Schema Addition (Only `block_embeddings`)

```sql
CREATE TABLE block_embeddings (
  path TEXT NOT NULL,
  heading_id TEXT NOT NULL,
  embedding BLOB NOT NULL,
  PRIMARY KEY (path, heading_id),
  FOREIGN KEY (path) REFERENCES notes(path)
);
```

#### Embedding Pipeline Extension

- For sections above a configurable minimum size (default: 20 words OR >10 lines), generate embeddings. Use `word_count` from `note_sections` (already computed) and section span (`end_line - start_line`). The OR-gate captures short-text sections with long code blocks underneath that have low word count but high semantic content.
- Key by `(path, heading_id)` from `note_sections` table
- Store in `block_embeddings` table
- Reuse existing Snowflake Arctic Embed XS model — no new model needed
- Add `block_knn_search()` to `vector_db.rs` alongside existing `knn_search()`

#### Scaling Note

`block_knn_search()` will use the same brute-force linear scan as `knn_search()`. Block embeddings produce 5-20x more rows than note embeddings. For MVP this is fine up to ~10k sections. If vaults grow beyond that, consider sqlite-vec or pre-filtering by vault/folder before scanning. Do not over-engineer upfront.

### Block-Level Smart Linking

With block-level embeddings, smart-linking gains section-level precision:

```typescript
type BlockLevelSmartLinkRule = {
  id: "block_semantic_similarity";
  // Finds sections in OTHER notes that are semantically similar to sections in the current note
  // Returns: { source_section, target_section, similarity }
};
```

This enables:

- "This section in Note A is related to that heading in Note B"
- Link suggestions at the section level, not just note level

### Editor Integration

#### Draggable Blocks

ProseMirror's document model is already tree-structured with block-level nodes. Implementation:

1. **Block detection plugin**: Track block boundaries in the ProseMirror state
2. **Drag handle UI**: Render a grip icon in the gutter on hover for eligible blocks (headings, list items, paragraphs > N words)
3. **Drag-and-drop**: Use ProseMirror's `drop` plugin or custom drag implementation
4. **No database changes**: Reordering updates the markdown content, which triggers re-indexing as usual

#### Block-Level Link Insertion

The LSP already handles `[[note#heading]]` completion via the `[` trigger character. Additional improvements:

1. Autocomplete shows both notes and sections within notes (LSP provides this)
2. Selecting a section inserts `[[note#heading-slug|display text]]`
3. Link validation via LSP diagnostics (broken link detection already works)

### Implementation Phases (Revised)

**Phase 3: Block Embeddings** — the genuine new capability

- Add `block_embeddings` table to schema
- Extend embedding pipeline to iterate `note_sections` and embed sections above size threshold (20 words OR >10 lines, configurable)
- Add `block_knn_search()` API to `vector_db.rs`
- Backfill runs during normal vault indexing

**Phase 4: Editor Block Features**

- ProseMirror block detection plugin
- Drag handle UI and drag-and-drop
- (Link autocomplete already works via LSP — enhance with section preview if needed)

**Phase 5: Graph Visualization** — separate workstream

- Smart links as a visual layer (dashed edges with rule provenance on hover)
- Requires changes to Rust graph builder, TS graph types (`VaultGraphSnapshot`, `GraphNeighborhoodSnapshot`), and D3/rendering layer
- Block-level (section) edges in graph visualization
- This is non-trivial and touches the `graph` feature's internals — scoped as its own phase

---

## Cross-Feature Dependencies

```
smart_links ──depends_on──> search (embeddings, KNN — call directly, not through hybrid search)
smart_links ──depends_on──> metadata (properties, tags)
smart_links ──depends_on──> links (suggestion integration via LinksService)
smart_links ──exposes_via─> search (SearchPort extension — no dedicated SmartLinksPort)
smart_links ──can_use────> markdown_lsp (references, workspace symbols)

block_notes ──depends_on──> editor (ProseMirror, mdast)
block_notes ──depends_on──> search (embeddings — block_embeddings table)
block_notes ──enables─────> smart_links (block-level rules)
block_notes ──already_has─> search (note_sections, note_headings, note_code_blocks)
block_notes ──already_has─> markdown_lsp (heading resolution, link validation)

graph_viz   ──depends_on──> smart_links (edge data)
graph_viz   ──depends_on──> graph (rendering, types, builder)
graph_viz   ──depends_on──> block_notes (section-level edges)
```

---

## Open Questions

1. ~~**mdast parsing in Rust**: Do we implement a lightweight Rust mdast parser, or call the TypeScript parser via IPC?~~ → **Resolved.** `extract_markdown_structure()` already parses markdown headings and code blocks in Rust. No new parser needed.

2. ~~**Block embedding granularity**: What's the minimum section size for embedding? Very short sections (single words) produce noisy embeddings. Proposed threshold: 20 words or 100 characters.~~ → **Resolved.** Use `word_count` from `note_sections` (already computed) and section span. Threshold: 20 words OR >10 lines (configurable). The OR-gate captures code-heavy sections with low word counts.

3. **Smart link freshness**: Should suggestions be cached or computed on every note open? Proposed: compute on note open, cache for the session, invalidate on note save.

4. **Block drag persistence**: Since blocks aren't stored separately, drag-and-drop rewrites the markdown file. This is fine for single-note reordering, but what about cross-note block moves? (Out of scope for MVP — note as future consideration.)

5. ~~**LSP integration**: The markdown LSPs (Marksman) may already provide some block/heading awareness. Investigate whether Marksman's document symbols API can replace custom block extraction for headings.~~ → **Resolved.** IWES/Marksman `documentSymbol` and `workspace/symbol` provide heading hierarchy at runtime. LSP `completion` handles `[[note#heading]]` autocomplete. LSP `references` provides backlinks. LSP diagnostics detect broken links. No custom extraction needed for these use cases.

6. **LSP stability**: Recent fixes (CPU loop, retry storm, zombie processes) are days old as of 2026-04-05. Allow a soak period before building features that depend heavily on LSP reliability for smart-linking workflows.

---

## Implementation Summary

| Phase | Scope                                                                                                            | Effort  |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------- |
| **1** | Metadata rules (SQL queries) + rule config persistence + `LinksService` integration + `SuggestedLink` provenance | ~3 days |
| **2** | Wire `semantic_similarity` to existing `find_similar_notes()` + scoring/merge                                    | ~2 days |
| **3** | `block_embeddings` table + embedding pipeline extension + `block_knn_search()`                                   | ~5 days |
| **4** | Editor drag handles (ProseMirror plugin)                                                                         | ~4 days |
| **5** | Graph visualization layer (new edge type, rendering — separate workstream)                                       | ~4 days |

---

## Migration / Backfill

- ~~Block indexing runs during normal vault indexing~~ → Block indexing **already runs** during vault indexing (`note_sections`, `note_headings`, `note_code_blocks` are populated by `upsert_note_simple()`)
- Block **embeddings** will be backfilled on next vault open (same pattern as note embedding backfill)
- Smart link rules are opt-in — default config enables only `same_day` and `shared_tag` to avoid noise

---

## Testing Strategy

- ~~**Block extraction**: Deterministic tests on markdown fixtures~~ → Already covered by existing indexing tests (sections/headings/code blocks are populated)
- **Block embeddings**: Verify embedding generation for sections above size threshold (both word count and line count gates), verify `block_knn_search()` returns correct neighbors
- **Smart link rules**: Unit tests per rule with controlled note metadata (SQL query tests)
- **Score aggregation**: Integration tests verifying weighted merge across rules, deduplication by target, ranking correctness
- **SuggestedLink provenance**: Verify provenance data flows through to UI, backward compat with provenance-less suggestions
- **Drag-and-drop**: E2E tests for block reordering and content preservation
