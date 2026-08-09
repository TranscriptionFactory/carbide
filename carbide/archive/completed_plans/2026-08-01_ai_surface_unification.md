# AI Surface Unification — One Present Assistant, Three Projections

**Date:** 2026-08-01
**Status:** Revision 3 — all five Appendix A surfaces **adopted** and attached to phases as acceptance UI; open decisions 1–3 closed; implementation plan at `devlog/2026-08-01_assistant-unification/PLAN.md`. No code changed yet.
**Scope:** Carbide's three AI integration points (inline editor menu, bottom-panel AI tab, chat RAG+agent sidebar). Transports are unified; the run lifecycle, session model, context assembly, and review flow are not.
**Sources:** `src/lib/features/ai/`, `src/lib/features/rag/`, `src/lib/features/editor/adapters/ai_menu_plugin.ts`, `src/lib/app/bootstrap/ui/bottom_panel.svelte`, `src/lib/shared/domain/prompt_recipes.ts`, `docs/ai_and_chat.md`, `docs/architecture.md`, `devlog/2026-07-23_generalized-agent-framework/PLAN.md`
**Mockup:** `carbide/designFiles/2026-08-01_ai_surface_mockup.html` — the completed experience, pins keyed to phases below

---

## 1. Executive summary

The AI surface feels disjoint not because there are three integration points — those are the right UX and should stay — but because **two feature modules each own half of one conceptual capability**, and the user experiences three *different AIs* rather than one assistant appearing in three places.

The fix is not a literal daemon process (architecture doc forbids it: all state lives on the frontend, Rust is a thin IPC layer). The correct reading of "daemon" is **presence**: one assistant that is always there, holding continuous identity and history, which surfaces *attach to* and *project*. In Carbide's architecture that is a **service + store + reactor**, not a process.

Revision 2 adds two things the original analysis missed:

1. **The run lifecycle is not yet unified.** Shared transports exist, but above them sit four independent stream-consuming loops, four uncoordinated abort controllers, three provider-resolution implementations, and inconsistently applied error humanization. A **Phase 0 run kernel** now precedes everything — merging session models on top of divergent lifecycle handling is the wrong order.
2. **The prompt-recipe registry is the routing unit.** The registry shipped 2026-07-31 (`a7faa12e`) and its commit closes with the next step verbatim: *"route AI surfaces by recipe policy rather than by dock location."* Context sources, tool policy, and apply behavior hang off the recipe, not the dock.

Concretely: unify the run lifecycle, the session model, context assembly (routed by recipes), and the apply/review flow; restructure `rag` into a pure retrieval engine consumed by the assistant; then add the ambient reactor for proactive suggestions. Seven phases (0–6), sequenced below.

---

## 2. Current state: a 2×3 matrix

Three surfaces, but only **two** backends — the `ai` feature serves both the inline menu and the bottom-panel surfaces, while `rag` owns chat:

| Surface | Feature | State model | Context assembly | Apply/review |
|---|---|---|---|---|
| Inline menu (`Cmd+Shift+I`) | `ai` (via `editor` PM plugin) | **ProseMirror plugin state in `ai_menu_plugin.ts` + a retry closure in `ai_actions.ts` — no `AiStore` involvement, nothing persisted** | ±4000-char cursor window, **written twice** (PM visual path + CodeMirror source path) | Streaming decorations w/ accept/reject (visual); buffered whole-apply (source). **No user-facing stop — the abort controller is a local closure** |
| Bottom-panel AI tab | `ai` | `AiStore.dialog.turns` (`AiConversationTurn[]`), persisted as a flat 100-turn `history.json` via `AiHistoryPersistencePort` | `build_ai_prompt` / `build_ai_document_prompt` + ad-hoc `fetch_vault_context` (similar notes + links) | Hunk-selectable diff (`ai_diff_view.svelte`) |
| Chat sidebar (ask + agent) | `rag` | `RagStore.sessions` (`RagSession[]`, persisted to `<VAULT>/.carbide/rag/`) | Full pipeline: @-mentions, query rewrite, hybrid retrieval (FTS5 + embeddings, RRF), scope filters, citation boost, token budget | Agent tool file-ops + git checkpoint + `changed_files` strip |

> **Correction from v1:** the inline row previously claimed `AiStore.dialog.turns`. Inline never touches `AiStore` — unifying it is *new wiring* (promote-to-session), not a store merge. Also: `ai_edit_dialog*.svelte` is **dead code** — exported from `ai/index.ts`, mounted nowhere. Delete it in Phase 0; do not carry it through the unification.

**Already unified (do not redo):** streaming transport (`AiStreamPort.stream_text`), agent transport (`AgentPort.stream_turn`), provider configs + capability detection (`agent_capability`, `infer_agent_descriptor`), surface policies (`chat_policy` / `inline_edit_policy`), prompt recipe registry (`shared/domain/prompt_recipes.ts`).

**Shared-but-not-uniform (v1 wrongly listed these as unified):**

- **Provider resolution ×3:** probe-based `resolve_provider` / `resolve_auto_ai_backend` in `ai_actions.ts`; naive `providers[0]` for `"auto"` at `rag_actions.ts:129` (chat can silently select an uninstalled provider); a third copy in `rag_mcp_bridge.reactor.svelte.ts`.
- **Error humanization:** `humanize_ai_error` exists, but `AgentRunner` passes raw `event.message` to `fail_streaming` while `AgenticEditRunner` humanizes the same event type.
- **Four stream-consuming loops**, each with its own text/error/done handling: `ai_service.execute_streaming`, `ai_service.stream_inline`, `rag_service.query`, `agent_runner.run_turn`.
- **Four uncoordinated `AbortController` owners** and twin ~70-line adapters (`ai_stream_adapter.ts` / `agent_tauri_adapter.ts`) differing only in command name, channel prefix, and payload shape.

### The fault lines

0. **Run lifecycle fragmentation.** The four loops / four aborts / three resolvers above. Run lifetime is coupled to UI lifetime (closing the inline menu kills the run); stop, retry, and error behavior differ per surface for no product reason.
1. **Two features, one capability.** `ai` and `rag` each have their own store, service, persistence port, and session schema. The wrong-direction entanglement is verified: `AgentPort` is declared in `rag/ports.ts:28` and `ai`'s `agentic_edit_runner.ts:9` imports it from `$lib/features/rag` — the agent transport lives in the retrieval module by historical accident.
2. **Two conversation histories.** An inline edit turn and a chat message are the same concept to the user but live in different schemas and files. No continuity: you cannot start inline and continue in chat.
3. **Three context pipelines.** Every surface answers "what does the model need to see?" independently; the chat's hybrid retrieval is unreachable from the editor surfaces.
4. **Three review models.** Inline accept/reject, panel diff view, agent changed-files — one user intent ("the AI wants to change my note — let me approve it") rendered three ways with no cross-surface record.
5. **No presence.** Provider readiness, streaming state, and assistant identity are per-surface. Each surface looks like a separate tool that happens to share provider settings.
6. **Recipes stop at the dock.** The registry shipped, but the bottom panel has *zero* recipe affordances (despite every `InstructionRecipe` applying to it), `QuestionRecipe`s are not user-overridable, and which recipes appear where is still decided by dock location.

---

## 3. The reframe: daemon = presence, not process

What a daemon gives you in a conventional architecture: a long-lived entity that outlives any single interaction, holds state continuously, and which clients attach to transiently. The frontend-native equivalent, fully compliant with `docs/architecture.md`:

- **One run registry** that owns execution. Closing a surface detaches a view; it does not kill the run.
- **One session store** that outlives any surface interaction. Surfaces are views over it.
- **One service** owning the turn lifecycle (submit → assemble context → stream → propose → apply). Surfaces submit *intents*; the service runs them.
- **One identity in the UI.** Same assistant name/icon/status everywhere; provider readiness and streaming state rendered by one shared presence component. The inline menu is not "a different AI" — it is the same assistant at your cursor. *The presence component is cheap and can ship early, ahead of the deep refactor — it is the first visible payoff.*
- **Hand-offs, not walls.** Every interaction can become a session; "continue in chat" / "open in panel" pass a session id, not a copy of the context.

The proactive flavor is a *later* layer on the same foundation: an ambient reactor observing editor/notes stores and enqueueing suggestions into the session store — see Phase 6. Proactivity with fragmented state would be a mess; with one kernel, it is trivial.

---

## 4. The proposal

### 4.0 Run kernel (new in Rev 2 — Phase 0)

One run registry (an `AssistantService` + run store) owning the full lifecycle:

- **One stream consumer.** The four `for await` loops collapse into one consumer with per-surface event sinks.
- **One cancellation registry** keyed by run id; every surface gets a stop control (inline currently has none).
- **One provider resolver** — the probe-based implementation replaces all three copies, including the MCP bridge's.
- **Humanization at one choke point** — `humanize_ai_error` applied where events enter the store, never in per-surface code.
- **Adapter dedup** — collapse the twin stream adapters into one parameterized transport adapter.
- **Housekeeping** — delete dead `ai_edit_dialog*.svelte`.

Pure refactor, no product decisions, and it fixes three user-visible defects immediately: inline stop, chat's uninstalled-provider selection, raw agent error strings.

### 4.1 Unify the session model

Merge `AiConversationTurn` and `RagSession` into one `AiSession`: ordered messages with roles, optional citations, scope, tool events, proposals (§4.3), reasoning.

- One persistence port — extend `RagPersistencePort` (already the better design); **delete `AiHistoryPersistencePort`** and the flat history file. Storage stays under `<VAULT>/.carbide/rag/` (conceptually: assistant sessions).
- Tag sessions `kind: "inline" | "note" | "chat"` for provenance and filtering.
- Inline keeps its ephemeral *fast path*: an inline run **promotes** into a session on demand ("Continue in chat") or on completion for history — logging is async and never blocks the edit loop. (This is new wiring, not a store merge — see §2 correction.)

### 4.2 Context sources routed by recipes

Define a `ContextSource` interface: each source contributes chunks with a token cost and priority. Sources: `selection`, `cursor_window`, `active_note`, `similar_notes`, `note_links`, `mentions`, `retrieval`, `history`. Generalize the existing `rag_context_assembler` into the single budget-aware packer.

**Rev 2: the routing unit is the recipe, not the surface.** A recipe declares `{prompt, context sources, tool policy, apply behavior}`. Per-surface source sets become *defaults* a recipe may override:

- Inline default = `[selection, cursor_window]`
- Bottom panel default = `[active_note, selection, similar_notes, note_links]`
- Chat default = `[mentions, retrieval, history]` (+ scope)

This picks up the registry commit's stated next step verbatim, and closes fault line 6: the panel gains instruction-recipe affordances, and `QuestionRecipe`s become user-overridable the way instructions already are (`resolve_instructions` generalizes).

This kills the `build_ai_prompt` / `build_ai_inline_prompt` / RAG prompt-builder triplication **without unifying prompt templates** — note-scoped edit prompts and vault-scoped RAG prompts are legitimately different text. Recipes route; they don't merge text.

### 4.3 First-class `Proposal` for apply/review

Model "the assistant wants to mutate notes" as store state: diff hunks + target paths + session provenance, with accept/reject as action-registry entries. The inline decorations, the panel diff view, and agent `changed_files` become three renderings of one proposal queue.

Falls out for free: "review everything this session touched" — agent mode half-builds this with `changed_files`; the proposal queue generalizes it to all surfaces.

### 4.4 Restructure: `rag` becomes a retrieval engine

Keep `rag` as pure retrieval infrastructure — it already serves MCP (`rag_mcp_bridge`) and shares the embedding index with search. Move session/turn ownership, `AgentPort`, and the agent runner into the assistant feature.

Today's `ai → rag` dependency inverts to `assistant → RetrievalPort` — the port declared in the assistant feature's `ports.ts`, implemented by `rag`, wired in the DI root (satisfies layering rule 10). Payoff: the MCP `rag_query` tool then literally runs the same session service as in-app chat — today that is only approximately true, and the bridge's private provider resolver (already absorbed in Phase 0) stops needing to exist.

### 4.5 Routing over chrome, presence in the chrome

Keep the three physical integration points exactly as they are; add hand-offs and identity:

- One shared **presence component** (assistant name/icon, provider readiness, streaming state) rendered in all three surfaces — shippable early (§3).
- Inline menu keeps its fast path; gains **"Continue in chat"** (passes session id) and a stop control (Phase 0).
- Bottom-panel AI tab becomes the chat component scoped to the active note (a scope chip — machinery already exists) **or is deleted**. It is the weakest surface; its two distinctive assets — hunk diff review and the agentic-edit path — are both subsumed by the proposal queue (§4.3). Decision in §7; sequencing makes deletion safe (Proposal lands in Phase 3, panel decision in Phase 5).
- Chat sidebar stays as-is; it is the most complete surface and becomes the canonical full-featured one.

### 4.6 Ambient reactor (proactive phase, later)

An `ai_ambient.reactor.svelte.ts` — the architecture-sanctioned mechanism for store-observation side effects — watches editor/notes stores and enqueues proposals/suggestions into the session store: stale-link notices, summary offers, suggestion-on-idle. Delivers the "daemon feel" (the assistant notices things without being asked) with zero new infrastructure once 4.0–4.4 exist. Explicit user-facing opt-in; trigger policy designed first (§7).

---

## 5. Sequencing

| Phase | Work | Acceptance surface (Appendix A) | Risk | Notes |
|---|---|---|---|---|
| 0 | **Run kernel** in a new `assistant/` slice (created here, per plan review — kernel never moves after landing): one consumer with injected event sinks, cancellation registry, single provider resolver, humanization choke point, adapter dedup, delete dead dialog | Presence component + **status-bar runs popover** | Low | Mostly serial (shared files); fixes 3 user-visible bugs; makes Phase 1 a store-shape change instead of store-shape-plus-lifecycle |
| 1 | Session unification: merge models into the `assistant` slice, delete `AiHistoryPersistencePort` + both legacy hydration reactors, inline promote-to-session | **Session-as-tab** (virtual tab kind, not a document viewer) + kind-filtered session list | Moderate | Highest value. 0 users → no migration code; RAG/ai-store tests are coverage anchors |
| 2 | `ContextSource` + generalized assembler + **recipe-policy routing**; panel recipe affordances; overridable questions | **Omnibar Ask mode** (explicit submit only; Search stays local) | Low-moderate | Existing prompt-builder, recipe, and RAG domain tests anchor behavior |
| 3 | `Proposal` model + unified accept/reject actions; proposals carry base note revision, staleness detected at apply; one checkpoint per apply batch | **Proposal review center** tab | Moderate | Touches all three surfaces' apply paths |
| 4 | Dependency inversion only (slice already exists): `AgentPort`/runner → `assistant`, `rag` → retrieval-only behind `RetrievalPort`; MCP parity | — (parity wave, verified by test) | Moderate | A move, not a rewrite |
| 5 | Bottom panel → scoped-chat projection (**decided**, no longer open) | Panel as "This note" chat | Low | Safe only after Phase 3 |
| 6 | Ambient reactor — deterministic producers only in v1 (link rot, orphans); LLM-produced offers are a later decision | **Margin annotation rail** + toasts | Low | Opt-in, default off |

The presence component ships in Phase 0 with the status bar. Per-phase lanes, gates, and orchestration: `devlog/2026-08-01_assistant-unification/PLAN.md`.

---

## 6. Explicit non-goals

- **No Rust-side daemon / background process.** Contradicts backend invariants (frontend owns all state); the MCP bridge already proves the frontend pipeline can serve external agents.
- **No collapsing the three surfaces into one mega-panel.** Placement is right; continuity is what is broken.
- **No unified prompt templates.** Recipes unify *routing* (context sources, tools, apply behavior); the prompt text for note-scoped edits vs. vault-scoped RAG stays deliberately separate.
- **No proactive behavior before the kernel + session unification.** It would multiply the state-model problem.
- **No speculative multi-assistant/plugin-assistant framework.** One assistant core; plugins already have MCP + sidecar paths. (The recipe registry is the natural future plugin hook — noted, not built.)

---

## 7. Decisions

Closed 2026-08-01 (Rev 3):

1. **Bottom panel** → scoped-chat projection of the canonical chat component; panel-specific ask machinery removed in Phase 5. ✅ decided
2. **Feature naming** → rename to `assistant`, slice created in Phase 0 with the kernel so unified code lands in its final home from the first line (avoids any double-move; refined by plan review). ✅ decided
3. **Inline session visibility** → `⌁` sessions visible in the session list, collapsed into a group by default, auto-pruned after 30 days if never promoted. ✅ decided

Still open:

4. **Ambient triggers beyond deterministic v1** — which LLM-produced observations (contradictions, summary offers, idle suggestions) earn a place, at what cadence. Explicitly out of Phase 6 scope (deterministic producers only); revisit after it ships.

---

## 8. Key file references

- `ai` feature: `state/ai_store.svelte.ts` (`AiStore`, `AiConversationTurn` — merges in P1), `ports.ts` (`AiPort`, `AiStreamPort`, `AiHistoryPersistencePort` — delete in P1), `application/ai_service.ts` (two of the four stream loops), `application/ai_actions.ts` (~1.1K lines; inline orchestration, closure abort at `:782`/`:889`, probe-based resolver, `extract_source_inline_context`), `application/agentic_edit_runner.ts` (`:9` imports `AgentPort` from `rag` — the misplaced dependency), `domain/ai_prompt_builder.ts`, `domain/ai_error_messages.ts` (choke point in P0), `ui/ai_assistant_panel.svelte` + `ui/ai_assistant_content.svelte`, `ui/ai_edit_dialog*.svelte` (**dead — delete in P0**), `ui/ai_diff_view.svelte`
- `rag` feature: `state/rag_store.svelte.ts` (`RagStore`, `RagSession` — the session-model seed), `ports.ts` (`RagPersistencePort` — extend; `AgentPort:28` — moves in P4), `domain/rag_context_assembler.ts` (generalize in P2), `application/rag_service.ts`, `application/rag_actions.ts` (`:129` naive resolver — dies in P0), `application/agent_runner.ts` (unhumanized errors — P0), `reactors: rag_mcp_bridge.reactor.svelte.ts` (third resolver — P0)
- Shared: `shared/domain/prompt_recipes.ts` + `shared/types/prompt_recipe.ts` (routing unit in P2), `ai/domain/agent_run_policy.ts` (`SurfacePolicy` — recipes compose with it)
- Adapters: `ai/adapters/ai_stream_adapter.ts` + `rag/adapters/agent_tauri_adapter.ts` (twins — dedup in P0)
- Inline surface: `src/lib/features/editor/adapters/ai_menu_plugin.ts` (PM plugin state), `src/lib/features/editor/ui/ai_inline_menu.svelte`
- Bottom panel host: `src/lib/app/bootstrap/ui/bottom_panel.svelte` (AI tab — P5 decision)
- Docs: `docs/ai_and_chat.md` (update after P5), `docs/architecture.md` (decision tree + reactor rules; **feature table predates `ai`/`rag` — add the slice(s) when P4 settles naming**)

---

## Appendix A — Additional surfaces (2026-08-01 brainstorm — **all five adopted in Rev 3**)

Mockups: `carbide/designFiles/2026-08-01_ai_assistant_surface_explorations.html`. Five further *projections* of the same kernel/session/proposal stores — each rides an existing Carbide mechanism, none adds AI machinery. Each is now the acceptance surface of its gating phase (see §5); the "considered, not mocked" ideas below remain rejected.

1. **Omnibar Ask mode** (needs P0–P2) — Ask segment in the omnibar; retrieval-backed cited answers from anywhere; esc dissolves (still logs a `⌁` session), `⌘↵` inserts at cursor, `↵` promotes to chat.
2. **Status-bar presence + runs popover** (needs P0) — persistent presence cell; popover lists kernel runs with stop controls, including runs whose originating surface closed. Nearly free once the run registry exists.
3. **Proposal review center** (needs P1+P3) — full-tab queue of all pending proposals across sessions/surfaces/ambient, grouped by provenance, hunk toggles, checkpoint-then-apply. The git-staging mental model for AI edits.
4. **Margin annotations** (needs P3+P6) — ambient findings anchored to the blocks they concern (stale links, contradictions), offer-only, resolving into the proposal queue. Same opt-in as the ambient reactor.
5. **Session as tab** (needs P1) — open any session as a full-width tab; sidebar and tab are two views of one session id. Follow-on idea: sessions wiki-addressable (`[[◈ session]]`) so notes can link to the conversation behind a decision.

**Considered, not mocked:** graph overlay lens (let graph UX settle), wikilink hover summaries (weak consent model, fires constantly), global hotkey/tray capture (true daemon — violates the non-goal), new-note wizard (recipes + omnibar insert already compose it), voice input (capture problem, out of scope).
