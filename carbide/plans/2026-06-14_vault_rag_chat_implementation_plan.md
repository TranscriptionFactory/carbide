# Implementation Plan — Vault RAG Chat

**Date:** 2026-06-14
**Status:** Phase 1 complete — Phase 2 complete (streaming, rewriter, multi-turn, folder scope, stale guard, **session persistence + list UI (D6), and tag scope** all shipped) — **Phase 3 complete (D3 block→section retrieval, @mention pinned context, MCP `rag_query`/`rag_status`)**
**Related:** `carbide/feature_opportunity_assay.md` (Tier 1 #1 + Appendix A), `carbide/TODO.md`
**Decision tree:** `docs/architecture.md` (followed religiously — new `rag/` feature module, hexagonal anatomy)

---

## Goal

A conversational chat panel that answers questions by **retrieving across the whole
vault**, reasoning over the retrieved notes as primary evidence, and emitting
**cited, clickable, streamed** responses — fully local-first. The user's question
drives retrieval; every claim cites a specific note; clicking a citation opens that
note.

This is distinct from the shipped single-note AI dialog (`ai/`), which is
document-centric and injects vault context only as supplementary material. RAG Chat
inverts that: retrieval is question-driven and the retrieved content is the evidence.

---

## What already exists (compose, don't build)

Verified against the codebase, not the assay's paraphrase. The retrieval substrate is
complete; the new work is the orchestration + UI layer.

| Capability | Location (verified) | Used for |
|---|---|---|
| Hybrid search (FTS5 + vector + RRF) | `SearchPort.hybrid_search()` `search/ports.ts:115`; Rust `search/hybrid.rs` | Top-N note retrieval for a question |
| Note-level semantic search (free-text → notes) | `SearchPort.semantic_search()` `search/ports.ts:110` | Pure-vector fallback / scoping |
| Similar-note / similar-block KNN | `SearchPort.find_similar_notes()`; Rust `find_similar_blocks()` `search/service.rs` | Context enrichment; basis for block retrieval (D3) |
| Link/backlink snapshot | `SearchPort.get_note_links_snapshot()` `search/ports.ts:81` | Enrich cited-note context with its link graph |
| File cache / metadata | `SearchPort.get_file_cache()` `search/ports.ts:129` | Titles, frontmatter for citations |
| AI streaming (token-by-token) | `AiStreamPort.stream_text(AiStreamRequest)` `ai/ports.ts:17`; types `ai/domain/ai_stream_types.ts` | Streams the answer |
| Provider configs (Claude/Codex/Ollama, CLI) | `AiProviderConfig` `shared/types/ai_provider_config.ts` | Provider/model selection, reused as-is |
| Prompt builder (XML-tag sections) | `ai/domain/ai_prompt_builder.ts` `build_ai_prompt()` | Pattern to adapt for retrieval-first prompts |
| Reactive store convention | `AiStore` `ai/state/ai_store.svelte.ts` | `RagStore` mirrors the `$state` class pattern |
| Action registry / boot wiring | `register_actions()` | `register_rag_actions()` hooks in identically |
| Tab/panel host | `tab/`, `ui/` | Chat opens as dockable tab or sidebar panel |
| MCP tool surface | `mcp/tools/search.rs`, `tools/notes.rs` | Phase 3 `rag_query` reuses `RagService.query()` |

**Embedding backend (verified):** model is **`snowflake-arctic-embed-xs`** (384-dim,
`src-tauri/src/features/search/vector_db.rs:4`), HNSW via `hnsw_rs` cosine
(`hnsw_index.rs`), full vectors persisted in SQLite (`note_embeddings`,
`block_embeddings`). The assay said "BGE-small" — that is stale; corrected here and in
the assay. **Block-level embeddings already exist and are indexed** (`block_index`,
`hnsw_index.rs:73`), but today they are only queried block→block
(`find_similar_blocks`), never text→block. See D3.

**Net new work is the RAG loop + chat UI, plus one small Rust command (D3, optional in P1).**

---

## Framework decision — do NOT adopt LEANN or HGMem

| Framework | What it is | Verdict | Why |
|---|---|---|---|
| [LEANN](https://github.com/StarTrail-org/LEANN) | Storage-optimized ANN index — avoids storing embeddings, recomputes selectively at query time (~97% storage cut) | **Reject** | Solves a problem Carbide doesn't have. Personal-scale vaults store full 384-dim vectors in a few MB of SQLite already. LEANN trades query-time CPU for storage we don't need to save, and it's a Python stack — adopting it means a sidecar or reimplementation, violating "compose / zero new deps." Revisit only at million-vector-on-laptop scale. |
| [HGMem](https://github.com/Encyclomen/HGMem) | Hierarchical graph **agent memory** (evolving long-term conversational memory) | **Reject** | Different problem from retrieval over a corpus. The vault is already the knowledge graph (wikilinks + backlinks + smart links); a parallel graph-memory layer is redundant. Far heavier than the Phase 3 "conversational coherence" need warrants. |

Both fail the `AGENTS.md` test ("avoid over-engineering and speculative
future-proofing… 0 users"). Adopting either would **duplicate** a working, proven
retrieval backend. We build the orchestration layer on existing ports and spend the
saved effort on retrieval quality (D3, D4) instead.

---

## Key design decisions

### D1 — New `rag/` feature module, hexagonal anatomy

Per `docs/architecture.md`: a new feature module, not an extension of `ai/`. The
interaction model, prompt structure, persistence, and UI all differ from the
single-note dialog. Sharing the module would fatten `ai/` and blur two mental models.

```
src/lib/features/rag/
├── index.ts                      # public API + register_rag_actions()
├── ports.ts                      # RagPort (thin — wraps SearchPort + AiStreamPort)
├── state/
│   └── rag_store.svelte.ts       # chat state ($state class, mirrors AiStore)
├── application/
│   ├── rag_service.ts            # core RAG loop (retrieve → assemble → prompt → stream)
│   ├── rag_actions.ts            # action registration
│   └── rag_context_assembler.ts  # token budget, dedup, truncation, citation_map
├── domain/
│   ├── rag_types.ts              # Message, Session, Citation, RagStreamEvent (pure)
│   ├── rag_prompt_builder.ts     # retrieval-first prompt construction (pure)
│   └── rag_query_rewriter.ts     # follow-up → standalone query (D4, pure)
└── ui/
    ├── rag_panel.svelte          # chat panel (tab/sidebar)
    ├── rag_message.svelte        # bubble + citation badges
    └── rag_input.svelte          # input + provider selector + scope filter
```

### D2 — Layering: `rag_service` orchestrates ports, never imports peer features

`RagService` depends on `SearchPort`, `AiStreamPort`, and the vault read surface —
all injected at app-wiring time (`create_app_context.ts`), exactly as other services
are constructed. `rag/` never imports `search/`, `ai/`, or `vault/` internals; only
their ports. `domain/` stays pure (no Svelte, no Tauri) so the prompt builder,
assembler, query rewriter, and citation parser are unit-testable in isolation.

### D3 — Retrieve at block granularity, expand to section for the LLM

The assay's blueprint retrieves the top-15 notes then reads **full note bodies** for
the top 8 (Appendix A STEP 2) — this blows the ~8K-token budget on long notes and
dilutes relevance. Block-level embeddings **already exist and are indexed**; the only
missing piece is a **text→block** query path (today the block index is only queried
block→block via `find_similar_blocks`).

- **P1:** ship note-level retrieval via existing `hybrid_search()` (zero Rust) so the
  loop works end-to-end.
- **P3 (or P1 if time):** add a small Rust command `search_blocks(query, limit)` —
  embed the query (the embed path exists) → search the existing `block_index` → return
  `BlockSearchHit` (the struct exists, `model.rs:20`). Expose as
  `SearchPort.search_blocks()`. The assembler then retrieves blocks, expands each to
  its enclosing section (`note_sections` table has `start_line`/`end_line`), and
  budgets at section granularity — higher precision, tighter tokens.

This is a **modest, deliberate Rust add**, not a from-scratch index — flagged so it is
not mistaken for a freebie.

### D4 — Query rewriting before retrieval (multi-turn coherence)

The assay's "re-retrieve per message" retrieves poorly on follow-ups like "why?" or
"what about the second one?" — the literal text has nothing retrievable.
`rag_query_rewriter.ts` runs a cheap LLM (or heuristic) pass that resolves
pronouns/ellipsis against conversation history into a standalone query **before**
retrieval. Falls back to the raw question if rewriting fails. Pure-domain, testable
with fixed history fixtures.

### D5 — Citation parsing in the orchestration layer, not the model contract

`AiStreamChunk` has only `text | error | done` (verified, `ai_stream_types.ts:15`) —
no citation type, correctly. `RagService` buffers the stream, parses `[N]` markers
against the `citation_map`, and emits the richer `RagStreamEvent`
(`text | citation | done | error`) the UI consumes. `[N]` that don't map to a
retrieved source are dropped/flagged, not rendered as dead links (citation
faithfulness guard).

### D6 — Sessions persisted as JSON under `.carbide/rag/sessions/<uuid>.json`

Human-readable, markdown-native, no SQLite dependency. Mirrors how the assay scoped
it; matches the project's local-first file conventions.

---

## Cross-cutting concerns (defined once)

- **Token budgeting.** `RagContextAssembler` reserves system (~500) + response (~2K),
  spends the rest (~8K default, provider-configurable) on retrieved context. Dedup by
  path, sort by score, truncate proportionally, build `citation_map`. Char/4 estimate
  is fine for a first cut.
- **Streaming guard.** Buffer partial `[N]` markers across chunk boundaries so a
  citation split across two chunks isn't mis-parsed. Stale-response guard (sequence
  token) so a slow turn can't overwrite a newer one — mirror the editor's smart-block
  stale guard.
- **Scope filter.** Folder-prefix / tag filter applied to retrieval (post-filter on
  hits in P1; push into the query for efficiency later). No new infrastructure.
- **Error/empty/loading states.** Panel renders retrieval indicator
  ("searching N notes…"), streaming, empty ("ask anything about your vault" + example
  questions), and error+retry — explicitly, like every other Carbide surface.
- **Security.** Rendered assistant markdown goes through the existing trusted
  ProseMirror/markdown render path (wikilinks, KaTeX, Shiki), never `innerHTML` of
  model output. Citations resolve to real vault paths before becoming clickable.
- **Reuse-bindings (off-the-shelf / in-repo — bind to these, do NOT re-implement).**
  The hard primitives already exist in-process; later phases must bind to them rather
  than grow parallel solutions:
  - *Assistant markdown render* → existing ProseMirror + markdown-it + Shiki + KaTeX +
    wikilink path (same as the Security bullet). A second renderer is XSS surface + drift.
  - *Cross-chunk stream buffering* (D5/P2) → reuse `MarkdownJoiner` (`ai/`,
    `process_chunk`/`flush`) for partial-token joining. Only the `[N]` citation
    cross-chunk buffer is genuinely new; the markdown side sits on `MarkdownJoiner`.
  - *Session IDs* (D6) → built-in `crypto.randomUUID()`; no `uuid` dependency.
  - *Session JSON persistence* (D6) → the existing `.carbide/` file-write pattern
    (how settings/themes persist); no new storage mechanism.
  - *MCP `rag_query`/`rag_status`* (P3) → existing MCP tool surface (`mcp/tools/*`);
    reuse, don't add transport.
  - *Block embed + ANN for `search_blocks`* (D3/P3) → existing `candle` embed +
    `hnsw_rs` `block_index`; it's a new query *path* over an existing index, not a new index.

---

## Phases

### Phase 1 — Core loop (read-only, single-turn) — ✅ DONE

**Goal.** Open chat → ask → get a cited answer → click a citation to open the note.

**Status — shipped on `feat/rag-chat`:**
- Part A (`fd1ca8fc`): pure domain (`rag_types`, `rag_context_assembler`,
  `rag_prompt_builder`, `rag_citations`) + `RagService.query()`; 22 unit tests.
- Part B: `rag_store.svelte.ts` (`$state` class), `register_rag_actions`
  (`rag.open` / `rag.ask` / `rag.open_citation`), `rag_panel` / `rag_input` /
  `rag_message` UI, wired into `create_app_context` as a **sidebar view**
  (`register_sidebar_view({ id: "rag", … })`); 12 unit tests
  (`tests/unit/stores/rag_store.test.ts`, `tests/unit/actions/register_rag_actions.test.ts`).
- Assistant text renders as plain text + clickable `[N]` citation badges and a
  Sources list (never `innerHTML` of model output); unmapped `[N]` stay plain text.
- Empty / loading ("Searching your vault…") / error+retry states all explicit.
- Gate green: `pnpm check` (0 new errors), `pnpm test` (34 rag tests), scoped
  oxlint clean on rag-owned files, `pnpm format`. No Rust touched.

**Deferred from P1 to P2 (intentionally):** token estimator stays char/4; no
streaming (stream accumulated to completion); no multi-turn / persistence /
scope filter; full trusted-markdown render of the answer body (P1 ships
plain-text + badges, which satisfies the security invariant).

**Scope.** Note-level retrieval via existing `hybrid_search()` (zero Rust). No
streaming yet (use a single execute or accumulate the stream to completion), no
multi-turn, no persistence, no scope filter.

**Deliverables.**
- `rag_types.ts`, `ports.ts` (pure).
- `rag_context_assembler.ts` — budget + dedup + `citation_map`.
- `rag_prompt_builder.ts` — retrieval-first system/user prompts (XML-tag sections,
  adapted from `ai_prompt_builder.ts`).
- `rag_service.ts` — `query()`: `hybrid_search` → fetch top-K contexts (file cache +
  links snapshot) → assemble → build prompt → call AI → parse `[N]` → return message
  + citations.
- `rag_store.svelte.ts` — minimal state (messages, is_loading, error, provider_id).
- `rag_actions.ts` + `register_rag_actions()` — `rag.open`, `rag.ask_selection`.
- `rag_panel.svelte`, `rag_input.svelte`, `rag_message.svelte` — minimal.
- Wiring in `create_app_context.ts` (construct `RagService` from ports) + panel host.

**Acceptance (BDD).**
- Given a vault with a note answering question Q, when the user asks Q, the response
  cites that note as `[N]` and the Sources list contains its path.
- Clicking `[N]` / a Source row opens that note in an editor tab.
- Given retrieval returns nothing relevant, the answer states it can't find it in the
  vault (no hallucinated citation).
- A `[N]` with no matching source is not rendered as a clickable link (D5).
- **Unit tests** (pure domain): assembler budget/truncation/dedup; prompt builder
  output shape; citation parser incl. split-across-chunk and unmapped-index cases.
- **Quality gate:** `pnpm check && pnpm test && (cd src-tauri && cargo check)` green;
  scoped oxlint on touched files clean (`pnpm lint` OOMs whole-repo in this env —
  known infra issue, scope to touched files).

### Phase 2 — Conversation + streaming + persistence — 2 sessions

**Goal.** Full multi-turn chat with streaming, history, and session management.

**Status — session 1 shipped on `feat/rag-chat`:**
- ✅ **Streaming** (`005a4320`): `RagService.query()` is an
  `AsyncGenerator<RagStreamEvent>`; new pure `RagStreamParser` reuses
  `MarkdownJoiner` and buffers partial `[N]` markers across chunks (D5);
  `rag_message.svelte` shows a blinking cursor while streaming. The in-flight
  assistant message grows incrementally in `rag_store`.
- ✅ **Query rewriter D4** (`f35b5442`): pure heuristic `rag_query_rewriter.ts`
  resolves bare/pronoun follow-ups against the prior question into a standalone
  retrieval query; cited-note score boost (×1.25) for topic continuity. Prompt
  still answers the original question.
- ✅ **Multi-turn history** (`44cdbf45`): `build_rag_prompt` (still pure) injects
  recent turns as a budgeted `<conversation>` section (char/4, newest-first),
  stripping stale `[N]` markers.
- ✅ **Folder-prefix scope** (`50072e15`): pure `rag_scope.ts`; service
  post-filters hits by folder prefix; scope input wired store → input.
- ✅ **Stale-response guard + new-chat** (`de373f8f`): per-turn revision token
  bails streaming writes/finalization when superseded; `rag.new_chat` clears +
  resets the op + bumps the revision; panel "New chat" button.
- ✅ Gate green: `pnpm check` (0 new errors — 17 pre-existing unchanged),
  `pnpm test` (full suite 4193 green; 57 rag tests), scoped oxlint clean,
  `pnpm format`. No Rust touched. code-simplifier pass applied (payload-coercion
  dedup).

**Session 2 — shipped on `feat/rag-chat`:**
- ✅ **Session persistence + list UI (D6)** — `RagPersistencePort` +
  tauri adapter persisting a `.carbide/rag/index.json` manifest
  (summaries) plus per-session `.carbide/rag/sessions/<uuid>.json` records;
  enumerated via the manifest because `list_vault_files_by_extension`
  excludes `.carbide/`. `RagStore` refactored to own `sessions[]` +
  `active_id` with derived `messages`/`summaries`; session
  new/switch/rename/delete bump the shared `revision` stale-guard.
  Save-on-turn-complete (+ rename/delete) through `RagService`; a vault-change
  reactor (`load_rag_sessions`) hydrates on boot/switch. Persistence is
  **fail-soft** (browse-mode `.carbide/` write rejection is caught + logged,
  chat keeps working in-memory). Panel gains a history list (switch/inline
  rename/delete). Provider/scope persisted per session.
- ✅ **Tag scope** — `RagScope` is now `{ folder?, tag? }`; pure
  `normalize_tag_scope`; `RagService` post-filters hits via
  `TagPort.get_notes_for_tag`. **Bound to `TagPort`, not the `reference`
  feature's `extract_frontmatter`** — the tag index is Rust-backed, covers
  both frontmatter `tags:` and inline `#tags`, and is already a port, so it
  satisfies D2 (rag depends on ports, not peer internals) without
  re-implementing tag extraction or missing inline tags. Tag input added to
  `rag_input.svelte`.
- ✅ Gate green: `pnpm check` (0 new errors — 17 pre-existing unchanged),
  `pnpm test` (full suite 4215 green; 79 rag tests), scoped oxlint clean on
  touched files, `pnpm format`. No Rust touched (manifest approach avoids it).
  code-simplifier pass applied (`to_session_summary` cross-layer dedup).

**Deliverables.**
- Streaming via `AiStreamPort.stream_text()`; `RagService.query()` becomes an
  `AsyncGenerator<RagStreamEvent>`; inline `[N]` parsing with cross-chunk buffering
  (D5); typing indicator + blinking cursor in `rag_message.svelte`.
- `rag_query_rewriter.ts` (D4) — standalone-query rewriting before retrieval; cited-
  note score boost for topic continuity.
- Multi-turn history injection (budgeted) into the prompt.
- Session persistence `.carbide/rag/sessions/<uuid>.json` (D6); session list UI
  (new/rename/delete/switch).
- Scope filter (folder prefix, tag) in `rag_input.svelte`.
- Stale-response guard; empty-state example questions.

**Acceptance (BDD).**
- A follow-up "why?" retrieves on the rewritten standalone query, not the literal
  word (assert the rewriter output on a fixed 2-turn fixture).
- Streaming renders text incrementally; a citation split across two stream chunks
  renders once, correctly.
- Closing and reopening the app restores prior sessions and their messages.
- Switching provider mid-session uses the new provider on the next turn only.
- A folder/tag scope restricts retrieved sources to that scope.
- **Quality gate:** as P1, plus a streaming-citation integration test.

### Phase 3 — Power features + external access — ✅ DONE

**Goal.** Block-level retrieval, MCP exposure, advanced context.

**Status — shipped on `feat/rag-chat`:**
- ✅ **D3 block→section retrieval** — Rust `search_blocks(query, limit)` embeds the
  query, searches the existing `block_index`, and joins `note_sections`/`notes` into
  `BlockSectionHit { note, heading, start_line, end_line, distance }` (a new query
  *path*, not a new index). Exposed as `SearchPort.search_blocks()`. `RagService.query()`
  now retrieves at section granularity (pure `extract_section` mirrors the Rust line
  slicing) and budgets per section; whole-note `hybrid_search` remains the fallback when
  block retrieval returns nothing (short notes / empty block index). Block score =
  `1/(1+distance)`. Rust unit test: `db::get_section`; pure tests: `extract_section`;
  service test: a long note's answering section reaches the model within budget.
- ✅ **@mention pinned context** — pure `parse_mentions` (strips `@`, dedupes) feeds a
  forced-context path: pinned notes resolve via `SearchPort.suggest_wiki_links`, enter
  assembly with a max sentinel score so they lead the budget and take the first citation
  indices, then retrieved sections fill the rest. Retrieved hits dedupe against pinned
  paths. Tests: `parse_mentions` + a service test asserting an @mentioned note is in
  context and cited regardless of retrieval score.
- ✅ **MCP `rag_query` + `rag_status`** — **`rag_query` reuses the real frontend
  `RagService.query()`** (no parallel retrieval logic) via an **FE event-bridge**: the
  Rust MCP handler emits `rag://mcp-query`, a boot reactor runs `RagService.query()` and
  returns the cited answer through the `rag_query_respond` command; the handler blocks on
  a channel with a 180s timeout and a webview-window guard. **Decision (see below):** the
  MCP server also runs headless (`carbide mcp` stdio) where no webview exists, so
  `rag_query` requires the desktop app to be running and returns a clear error headless —
  chosen over a Rust reimplementation (which the "no parallel logic" rule forbids).
  `rag_status` is pure Rust (embedding model version, embedded/total counts, indexing
  flag, bridge availability). Tests: FE `collect_rag_query_response` == in-app collection
  for the same `query()`; Rust `format_rag_response` formatting.
- ⏸️ **Saved prompt templates** — deferred (optional in the original scope; not required
  by any acceptance criterion). Revisit if there's demand.
- ✅ Gate green: `pnpm check` (0 new errors — 17 pre-existing unchanged), `pnpm test`
  (full suite 4228; +13 rag-related), `cd src-tauri && cargo check` (0 errors), scoped
  oxlint clean on touched files, `pnpm format`.

**Architecture decision (MCP ↔ RagService).** The MCP server is pure Rust (axum HTTP +
`carbide mcp` stdio); `RagService.query()` is frontend TS by design (D2 keeps the
retrieval/assembly/citation orchestration in pure, unit-testable TS domain). "Reuse
`RagService.query()`, no parallel logic" therefore cannot be honored by a headless Rust
reimplementation. Resolved with the **FE event-bridge**: identical quality for the common
case (app running, which is also where the HTTP server lives); headless stdio degrades
with a clear error. Revisit only if headless `rag_query` becomes a hard requirement —
then the orchestration would move to Rust as the single source of truth (a larger
refactor that would partially undo D2).

**Deliverables.**
- **D3 block retrieval:** Rust `search_blocks(query, limit)` (embed query → search
  existing `block_index` → `BlockSearchHit`); `SearchPort.search_blocks()`; assembler
  expands block hits to enclosing sections via `note_sections`.
- MCP `rag_query` tool → reuses `RagService.query()` path (external agents get the
  same retrieval quality); MCP `rag_status` (model availability, index health).
- `@mention` in input to pin specific notes as forced context (bypass retrieval for
  those).
- Saved prompt templates ("summarize folder", "find contradictions", "extract action
  items").

**Acceptance (BDD).**
- A question whose answer lives in one section of a long note cites that section's
  note and stays within budget (block retrieval, not whole-note dump).
- `rag_query` over MCP returns the same answer + citations as the in-app path for the
  same question.
- An `@mention`-pinned note appears in context regardless of retrieval score.
- **Quality gate:** as P2, plus Rust unit test for `search_blocks` and an MCP tool
  integration test.

---

## What does NOT change

- Embedding model, HNSW index, RRF fusion — unchanged (the correct backend).
- No new npm packages, no new Cargo crates (Phase 1–2). Phase 3 adds **one** Rust
  command reusing existing index + embed paths — no new dependency.
- No changes to the existing `ai/` single-note dialog.

---

## Open decisions (resolve before the relevant phase)

1. **Panel host** — dockable tab vs persistent right sidebar vs both. Lean: sidebar
   panel (like search), promotable to a tab. *(P1)*
2. **Reranking** — RRF top-15 → top-K with no reranker leaves precision on the table.
   Deliberately deferred; evaluate after P2 with real retrieval-quality data. **When it
   lands, this is buy-not-build:** a reranker is a *pretrained cross-encoder*
   (bge-reranker / jina-reranker class), not a hand-rolled scorer. Load it through the
   **`candle` inference path already in-tree** (the arctic embedding model already runs on
   `candle` + HF `tokenizers`), or via a focused crate like `fastembed-rs` if we accept an
   ONNX runtime. Do **not** write a custom scorer; do **not** use a cloud rerank API
   (Cohere/Jina) — that breaks local-first. *(post-P2)*
3. **Query-rewrite cost** — LLM rewrite adds a round-trip per follow-up. Heuristic
   (pronoun/ellipsis detection) first, LLM rewrite only when needed? *(P2, D4)*
4. **Token estimator** — char/4 vs a real tokenizer. Char/4 for P1; revisit if budget
   over/under-runs hurt answer quality. *(P1)*
