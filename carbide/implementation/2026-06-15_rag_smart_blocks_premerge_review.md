# Pre-merge Review: Vault RAG Chat + Smart Blocks

**Date:** 2026-06-15
**Branch:** `feat/rag-chat`
**Scope:** Pre-merge bug hunt across the Vault RAG Chat and Smart Blocks features before merging to `main`.
**Related plans:** [`plans/2026-06-14_vault_rag_chat_implementation_plan.md`](../plans/2026-06-14_vault_rag_chat_implementation_plan.md), [`plans/2026-06-13_smart_blocks_implementation_plan.md`](../plans/2026-06-13_smart_blocks_implementation_plan.md)

Three independent bug-hunt passes (RAG service+domain, RAG state+persistence, Smart Blocks) were run against the source and each finding confirmed against the actual code. Five defects were fixed; the remainder are recorded below as loose ends.

---

## Fixed (committed)

- `62e46b5b` — fix(smart_blocks): close tasks-block XSS and reactivity gap
- `8a967352` — fix(rag): correct stream cleanup, persistence safety, query rewrite

| Severity | Issue | Resolution |
|----------|-------|------------|
| Critical (security) | Stored XSS: tasks-block parse errors echo raw note-body lines (`Unknown clause: <img onerror=…>`) rendered via `innerHTML`, executing in the Tauri webview. | Rebuilt `tasks_smart_block` on `create_reactive_block`; errors render via `textContent`. |
| Bug | Tasks block had no vault-change reactivity and no stale-result guard (divergent from every other handler). | Same rebuild — gains FS subscription + `is_current()` guard. |
| Bug | RAG `fail_streaming` only removed *empty* placeholders, leaving a half-written assistant bubble on mid-stream error (UI vs persisted divergence). | Drop the in-flight streaming message regardless of content. |
| Bug (leak) | `ai_stream_adapter` only called `unlisten()` on the start-error path → one leaked Tauri listener per completed stream. | Unlisten on stream termination (`done`/`error`). |
| Defect (security) | Path traversal: session id interpolated into a file path with no validation. | Validate id against `^[A-Za-z0-9_-]+$` before building the path. |
| Defect | Query-rewrite false positive: a standalone wh-question after an unrelated turn was merged into a topic-polluted query. | Leading wh-words only mark a follow-up when short/elliptical (≤3 words); conjunctions and referent pronouns unchanged. |

---

## Loose ends (deferred — need a decision or a larger change)

Priority order. None is a silent-corruption bug; each was left out of the fix batch because it needs a design decision or a cross-cutting/cross-stack change.

### 1. Superseded streams don't abort the backend (D)
- **Where:** `ai_stream_adapter.ts` (`request_id` generated internally, never surfaced) + `rag_actions.ts` streaming loop + `rag_service.ts:215`.
- **Trigger:** Send a question, then start a new chat / switch session mid-stream. The consumer `return`s out of the `for await`, but the llama-server/CLI keeps generating to completion. Wasted compute. (Listener is still cleaned up on natural completion after the `unlisten` fix, so no permanent leak.)
- **Root gap:** `RagService.query` has no access to `request_id`, so it cannot call `AiStreamPort.abort()`.
- **Fix:** Surface `request_id` through `stream_text` (e.g. return it alongside the iterable, or expose an `AbortSignal`), and have the service call `abort()` in a `finally`/on-supersede.
- **Severity:** defect (resource waste, not correctness). Recommended before merge if compute cost matters.

### 2. Scope filtering starves recall (claim 4)
- **Where:** `rag_service.ts:319-341` (`apply_scope`), `rag_service.ts:284` (`hybrid_search` called with hardcoded `scope: "all"`), `ports.ts` (`search_blocks` takes no scope).
- **Trigger:** Narrow folder/tag scope filters *after* the top-15 global retrieval. If none of the top-15 fall in scope, the user gets "couldn't find anything" even though relevant scoped notes exist past rank 15.
- **Fix:** Push folder/tag scope into the search query (extend `SearchQueryInput`/`search_blocks`), or raise `retrieve_limit` substantially when a scope is active.
- **Severity:** defect. Plan-acknowledged tradeoff — needs a deliberate decision.

### 3. Response token budget unenforced (claim 1)
- **Where:** `ai_stream_types.ts` (`AiStreamRequest` has no `max_tokens`), `rag_service.ts:215`, Rust `stream.rs:build_chat_request_body`.
- **Trigger:** The assembler reserves ~2.5K tokens for the response but nothing caps generation; a verbose model can blow past it, risking context-window overflow on tight providers.
- **Fix:** Add optional `max_tokens` to `AiStreamRequest`, derive from the reserve, thread through the adapter → Rust `build_chat_request_body` (`"max_tokens"`) and CLI arg templating.
- **Severity:** defect. Cross-stack (TS + Rust), touches the shared AI module used by AI chat too.

### 4. Phantom citations inside code blocks (F)
- **Where:** `rag_stream_parser.ts:25` runs `match_citation_markers` over all emitted text, including code routed through `MarkdownJoiner`.
- **Trigger:** Model emits a code sample containing `items[1]`; if source #1 exists, a spurious citation to it appears in the UI.
- **Fix:** Track code-block state in the parser (the joiner already knows `in_code_block`) and skip citation matching inside fenced/inline code. Fiddly because a single emit can mix prose and code.
- **Severity:** defect, narrow trigger.

### 5. Smart-block context snapshotted once at mount (smart #3)
- **Where:** `prosemirror_adapter.ts:~300` (`make_context` captures `note_path`/`vault_id` once), `code_block_view_plugin.ts` `update()` only re-creates on language change.
- **Trigger:** A `backlinks` block on an unsaved note renders "Save note to see backlinks"; after the note is saved/renamed, FS events fire but `run()` re-reads the *stale* snapshot, so it never recovers. Same class on host-note rename.
- **Fix:** Make `note_path`/`vault_id` getters on the context object, or push the new path into the live instance on `update()`.
- **Severity:** defect, low–medium (rename of the open note / unsaved-note backlinks).

### 6. Minor / latent
- **Mention regex corrupts emails** (`rag_mentions.ts:1,13`): `@([A-Za-z0-9/_.-]+)` turns `"email me at a@b.com"` into `"…ab.com"` in the cleaned query. Fix: require a leading boundary, disallow punctuation-only mentions.
- **Truncation may split a surrogate pair** (`rag_context_assembler.ts:86`): `slice(0, keep)` can emit a lone surrogate into the prompt. Fix: snap `keep` to a safe boundary.
- **Recency-sort non-determinism** (`rag_store.svelte.ts:36-40`, `rag_persistence_tauri_adapter.ts:44-46`): equal `updated_at` can reorder between in-memory and reloaded state. Fix: add an `id` tiebreaker.
- **Non-atomic save** (`rag_persistence_tauri_adapter.ts:62-70`): session file + index are two writes; a failed second write strands an orphan/invisible session, and `save_session` swallows the error. Fix: surface the failure (and/or backend transaction).
- **Citation-before-text drop** (`rag_actions.ts:90-93`, `rag_store.svelte.ts:199`): `start_streaming` is lazy on the first `text` event; a citation arriving before any text would be dropped. Not currently triggerable (parser emits text first) but fragile. Fix: defensively start the stream in the citation branch.
- **MCP bridge in-flight handle** (`rag_mcp_bridge.reactor.svelte.ts:76-94`): teardown sets `cancelled` but doesn't await/abort an in-flight `handle()`. Low impact.

---

## Verified NOT bugs (do not re-investigate)

- Citation numbering is 1-based and consistent across assembler / citation map / parser; dedup correct.
- Cross-chunk `[N]` marker buffering via `MarkdownJoiner` (unclosed-`[` buffer) is correct and tested.
- `extract_section` bounds (inclusive end, clamped, `start>end` → `""`) correct.
- `Promise.all` retrieval: only `search_blocks` is `.catch`-wrapped; `hybrid_search` rejection propagates to the outer try → clean `error` event.
- Stale-revision guard correctly discards stale UI updates (no `await` between guard and mutation). The only gap is teardown (loose end #1), not state correctness.
- Session persistence: upsert replaces (no dup), first-load missing index → `[]`, corrupt JSON → null/tolerated.
- Svelte 5 `$state`: all mutations reassign; streaming append creates new objects/arrays. Reactive.
- `create_reactive_block` stale-guard (per-run token, `destroy()` invalidates in-flight) and IntersectionObserver teardown (disconnect on first intersection + on destroy) are correct; no post-destroy DOM mutation, no double-mount, no leaked timers.
- `query_smart_block` error duck-typing and `base_smart_block` BasesStore coupling are style smells, not bugs.
