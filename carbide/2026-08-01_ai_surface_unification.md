# AI Surface Unification — One Present Assistant, Three Projections

**Date:** 2026-08-01
**Status:** Analysis complete; proposal, no code changed
**Scope:** Carbide's three AI integration points (inline editor menu, bottom-panel AI tab / edit dialog, chat RAG+agent sidebar). Backends are already mostly unified (provider configs, streaming transport, error humanization, capability detection). This document diagnoses the remaining disjointness and proposes a "daemon-as-presence" unification.
**Sources:** `src/lib/features/ai/`, `src/lib/features/rag/`, `src/lib/features/editor/adapters/ai_menu_plugin.ts`, `src/lib/app/bootstrap/ui/bottom_panel.svelte`, `docs/ai_and_chat.md`, `docs/architecture.md`

---

## 1. Executive summary

The AI surface feels disjoint not because there are three integration points — those are the right UX and should stay — but because **two feature modules each own half of one conceptual capability**, and the user experiences three *different AIs* rather than one assistant appearing in three places.

The fix is not a literal daemon process (architecture doc forbids it: all state lives on the frontend, Rust is a thin IPC layer — the same instinct was already rejected for vault sync). The correct reading of "daemon" here is **presence**: one assistant that is always there, holding continuous identity and history, which surfaces *attach to* and *project*. In Carbide's architecture that is a **service + store + reactor**, not a process.

Concretely: unify the session model, the context-assembly pipeline, and the apply/review flow; restructure `rag` into a pure retrieval engine consumed by the assistant; then — since the proactive flavor is also wanted — add an ambient reactor for suggestions. Six phases, sequenced below.

---

## 2. Current state: a 2×3 matrix

Three surfaces, but only **two** backends — the `ai` feature serves both the inline menu and the bottom-panel/dialog surfaces, while `rag` owns chat:

| Surface | Feature | State model | Context assembly | Apply/review |
|---|---|---|---|---|
| Inline menu (`Cmd+Shift+I`) | `ai` (via `editor` PM plugin) | `AiStore.dialog.turns` (`AiConversationTurn[]`), ephemeral per-invocation | `build_ai_inline_prompt` + ±4000-char cursor window (`ai_actions.ts`, `MAX_INLINE_CONTEXT`) | Streaming suggestion, accept/reject in-menu |
| Bottom-panel AI tab + edit dialog | `ai` | Same `AiStore`, persisted via `AiHistoryPersistencePort` (separate history file) | `build_ai_prompt` / `build_ai_document_prompt` + ad-hoc `fetch_vault_context` (similar notes + links) | Diff view (`ai_diff_view.svelte`), accept/reject |
| Chat sidebar (ask + agent modes) | `rag` | `RagStore.sessions` (`RagSession[]`, persisted to `<VAULT>/.carbide/rag/`) | Full pipeline: @-mentions, query rewrite, hybrid retrieval (FTS5 + embeddings, RRF), scope filters, citation boost, token budget | Agent tool file-ops + git checkpoint + `changed_files` list |

Already unified (do not redo): provider configs + auto-resolution (`ai_backend_selection`), streaming transport (`AiStreamPort.stream_text`), agent transport (`AgentPort.stream_turn`), error humanization, provider capability detection.

### The fault lines

1. **Two features, one capability.** `ai` and `rag` each have their own store, service, persistence port, and session schema. The wrong-direction entanglement is already visible: `AgenticEditRunner` (in `ai`) imports `AgentPort` from `rag` — because "agent" arbitrarily lives in the retrieval module.
2. **Two conversation histories.** An inline edit turn and a chat message are the same concept to the user but live in different stores, schemas, and files. No continuity: you cannot start inline and continue in chat; the bottom-panel turns and chat sessions are separate worlds.
3. **Three context pipelines.** Every surface answers "what does the model need to see?" independently. No shared abstraction, diverging behavior (e.g. only chat has @-mentions and scope; only the panel has similar-notes context).
4. **Three review models.** Inline accept/reject, dialog diff view, agent changed-files — the same user intent ("the AI wants to change my note — let me approve it") rendered three ways with no cross-surface record.
5. **No presence.** Provider readiness, streaming state, and assistant identity are per-surface. Each surface looks and behaves like a separate tool that happens to share provider settings.

---

## 3. The reframe: daemon = presence, not process

What a daemon gives you in a conventional architecture: a long-lived entity that outlives any single interaction, holds state continuously, and which clients attach to transiently. The frontend-native equivalent, fully compliant with `docs/architecture.md`:

- **One session store** that outlives any surface interaction. Closing the inline menu does not end anything — the assistant's state persists; surfaces are views.
- **One service** owning the turn lifecycle (submit → assemble context → stream → propose → apply). Surfaces submit *intents*; the service runs them.
- **One identity in the UI.** Same assistant name/icon/status everywhere; provider readiness and streaming state rendered uniformly wherever the assistant appears. The inline menu is not "a different AI" — it is the same assistant at your cursor.
- **Hand-offs, not walls.** Every interaction is recorded as a session; "continue in chat" / "open in panel" pass a session id, not a copy of the context.

The proactive flavor (also wanted) is a *later* layer on the same foundation: an ambient reactor observing editor/notes stores and enqueueing suggestions into the session store — see Phase 6. Proactivity with three siloed state models would be a mess; with one, it is trivial.

---

## 4. The proposal

### 4.1 Unify the session model (core)

Merge `AiConversationTurn` and `RagSession` into one `AiSession`: ordered messages with roles, optional citations, optional scope, optional tool events, optional proposals (see 4.3), optional reasoning.

- One persistence port — extend `RagPersistencePort` (already the better design); **delete `AiHistoryPersistencePort`** and its separate history file. One storage location (`<VAULT>/.carbide/rag/` can stay; rename conceptually to assistant sessions).
- Tag sessions `kind: "inline" | "note" | "chat"` for provenance and filtering in the session list.
- Every AI interaction becomes a recorded, resumable session. Inline keeps its ephemeral *fast path* UX — session creation is already what `RagStore` does on first message; logging is async and never blocks the edit loop.

### 4.2 Context sources, not prompt builders

Define a `ContextSource` interface: each source contributes chunks with a token cost and priority. Sources: `selection`, `cursor_window`, `active_note`, `similar_notes`, `note_links`, `mentions`, `retrieval`, `history`. Generalize the existing `rag_context_assembler` into the single budget-aware packer.

Surface definitions become *declarations of source sets*:

- Inline = `[selection, cursor_window]`
- Bottom panel = `[active_note, selection, similar_notes, note_links]`
- Chat = `[mentions, retrieval, scope, history]`

This kills the `build_ai_prompt` / `build_ai_inline_prompt` / `rag_prompt_builder` triplication **without unifying prompt templates** — note-scoped edit prompts and vault-scoped RAG prompts are legitimately different text and should stay separate.

### 4.3 First-class `Proposal` for apply/review

Model "the assistant wants to mutate notes" as store state: diff hunks + target paths + session provenance, with accept/reject as action-registry entries. The inline menu, the diff dialog, and agent `changed_files` become three renderings of one proposal queue.

Falls out for free: "review everything this session touched" — agent mode already half-builds this with `changed_files`; the proposal queue generalizes it to all surfaces.

### 4.4 Restructure: `rag` becomes a retrieval engine

Keep `rag` as pure retrieval infrastructure — it already serves MCP (`rag_mcp_bridge`) and shares the embedding index with search. Move session/turn ownership, `AgentPort`, and the agent runner into `ai` (or rename the feature `assistant`).

Today's `ai → rag` dependency inverts to `ai → RetrievalPort`, which `rag` implements. Payoff: the MCP `rag_query` tool then literally runs the same session service as in-app chat — today that is only approximately true.

### 4.5 Routing over chrome

Keep the three physical integration points exactly as they are; add hand-offs:

- Inline menu keeps its fast path; gains "Continue in chat" (passes session id).
- Bottom-panel AI tab becomes the chat component scoped to the active note (a scope chip — machinery already exists) **or is deleted**. It is the weakest of the three surfaces and mostly duplicates the sidebar once scope chips exist. Decision needed (§7).
- Chat sidebar stays as-is; it is already the most complete surface and becomes the canonical full-featured one.

### 4.6 Ambient reactor (proactive phase, later)

An `ai_ambient.reactor.svelte.ts` — the architecture-sanctioned mechanism for store-observation side effects — watches editor/notes stores and enqueues proposals/suggestions into the session store: stale-link notices, summary offers, suggestion-on-idle. This delivers the "daemon feel" (the assistant notices things without being asked) with zero new infrastructure once 4.1–4.4 exist.

---

## 5. Sequencing

| Phase | Work | Risk | Notes |
|---|---|---|---|
| 1 | Session unification: merge models, delete `AiHistoryPersistencePort` | Moderate | Highest value. 0 users → migration is trivial; existing RAG/ai-store tests are coverage anchors |
| 2 | `ContextSource` + generalized assembler; port the three builders one at a time | Low-moderate | Existing prompt-builder and RAG domain tests anchor behavior |
| 3 | `Proposal` model + unified accept/reject actions | Moderate | Touches all three surfaces' apply paths |
| 4 | Feature restructure: `AgentPort`/sessions → `ai`, `rag` → retrieval-only | Moderate | Do *after* 1–3 so it is a move, not a rewrite |
| 5 | Bottom-panel tab decision: scoped-chat projection or cut | Low | Depends on §7 decision |
| 6 | Ambient reactor (proactive suggestions) | Low | Only after 1–4; requires nothing new conceptually |

---

## 6. Explicit non-goals

- **No Rust-side daemon / background process.** Contradicts backend invariants (`docs/architecture.md`: frontend owns all state); the MCP bridge already proves the frontend pipeline can serve external agents.
- **No collapsing the three surfaces into one mega-panel.** Placement is right; continuity is what is broken.
- **No unified prompt templates.** Unify the plumbing that feeds them (context sources), not the text.
- **No proactive behavior before session unification.** It would triple the state-model problem.
- **No speculative multi-assistant/plugin-assistant framework.** One assistant core; plugins already have MCP + sidecar paths.

---

## 7. Open decisions

1. **Bottom-panel AI tab: first-class or transitional?** If transitional, Phases 1–3 treat the sidebar chat as the canonical surface and the panel as a scoped projection — simplifies the target design considerably. (Current lean: merge into scoped chat, cut the tab.)
2. **Feature naming:** keep `ai` as the owning feature, or rename to `assistant` now that it subsumes sessions + agent? Renaming is cheap at 0 users and reads better against `rag`-as-retrieval.
3. **Inline session visibility:** should `kind: "inline"` sessions appear in the chat sidebar's session list by default, or be filtered to a per-note view? (Lean: visible, filterable — presence means one continuous history.)
4. **Ambient reactor triggers:** which observations earn suggestions (idle time, link rot, note staleness) and at what cadence — needs a small policy design before Phase 6, plus an explicit user-facing opt-in.

---

## 8. Key file references

- `ai` feature: `state/ai_store.svelte.ts` (`AiStore`, `AiConversationTurn`), `ports.ts` (`AiPort`, `AiStreamPort`, `AiHistoryPersistencePort` — to delete), `application/ai_service.ts`, `application/ai_actions.ts` (~1.1K lines, inline orchestration + `extract_source_inline_context`), `application/agentic_edit_runner.ts` (imports `AgentPort` from `rag` — the misplaced dependency), `domain/ai_prompt_builder.ts`, `ui/ai_assistant_panel.svelte`, `ui/ai_edit_dialog*.svelte`, `ui/ai_diff_view.svelte`
- `rag` feature: `state/rag_store.svelte.ts` (`RagStore`, `RagSession`), `ports.ts` (`RagPersistencePort`, `AgentPort`), `domain/rag_context_assembler.ts` (generalize into the shared assembler), `application/rag_service.ts`, `application/agent_runner.ts`, `application/rag_mcp_bridge.ts`, `ui/rag_panel.svelte`
- Inline surface: `src/lib/features/editor/adapters/ai_menu_plugin.ts`, `src/lib/features/editor/ui/ai_inline_menu.svelte`, `src/lib/features/editor/extensions/ai_inline_extension.ts`
- Bottom panel host: `src/lib/app/bootstrap/ui/bottom_panel.svelte` (AI tab)
- Docs: `docs/ai_and_chat.md` (user-facing, describes the three parts — update after Phase 5), `docs/architecture.md` (decision tree + reactor rules all phases must follow)
