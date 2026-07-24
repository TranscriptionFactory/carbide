# General — Context

**Last Updated:** 2026-07-23
**Status:** Active
**Next Task ID:** TP-011

---

## Current State

This is the default task area for carbide. Tasks that don't belong
to a specific domain area are created here.

Taskplane is configured and ready for task execution. Use `/orch all` for
parallel batch execution or `/orch <path/to/PROMPT.md>` for a single task.

**Active program: generalized agent framework (TP-002…TP-010).** Unifies the
three AI surfaces (inline AI panel, ChatRAG ask, agent mode) behind one run
abstraction, one AgentEvent contract, and a capability-described backend model
(API providers → native in-process loop; CLI agents → harness adapters:
claude + codex). Full rationale + BDD scenarios + locked user decisions live
in `devlog/2026-07-23_generalized-agent-framework/PLAN.md` (gitignored — not
visible inside worktree lanes; every PROMPT.md is self-contained).

Wave schedule (dependencies encoded in each PROMPT.md):

- W1: TP-002 (contract+plumbing) ∥ TP-005 (parity test)
- W2: TP-003 (history replay) ∥ TP-004 (capability+harness seam)
- W3: TP-006 (codex adapter) ∥ TP-007 (surface policy + safe-mode parity)
  ∥ TP-008 (agent citations)
- W4: TP-009 (agentic inline edit)
- W5: TP-010 (simplify pass)
- Then: manual live-model smoke matrix (claude CLI, codex CLI, ollama native,
  one cloud OpenAI-compat; safe+power+abort each; plus agentic-inline smoke)
  — carried over from the native-loop P5 checklist, needs the user + models.

Locked user decisions (2026-07-23): inline "ask" mode stays as-is; citations
in agent mode IN SCOPE (TP-008); per-tool interactive approval DEFERRED.

## Key Files

| Category     | Path                                                                 |
| ------------ | -------------------------------------------------------------------- |
| Tasks        | `taskplane-tasks/`                                                   |
| Config       | `.pi/taskplane-config.json`                                          |
| Program plan | `devlog/2026-07-23_generalized-agent-framework/PLAN.md` (gitignored) |

## Lane Environment Notes (worktree lanes)

- Gitignored files missing from worktrees — copy from main checkout before
  building: `src/lib/generated/bindings.ts` (or regenerate:
  `cargo test --manifest-path src-tauri/Cargo.toml specta_export`),
  `src-tauri/excalidraw-dist/`
- Host kills Bash at 120s — run long suites via
  `nohup <cmd> > .tmpfiles/<name>.log 2>&1 &` + poll. NEVER write to /tmp.
- Gates: `pnpm check` · `pnpm lint` (layering is the real gate) · `pnpm test`
  · `cargo test --manifest-path src-tauri/Cargo.toml` · then `pnpm format`
- No rebase/reset/push on lanes; commit at step boundaries; verify reflog
  before merging lanes (delegated agents have rewritten history before).

## Technical Debt / Future Work

_Items discovered during task execution are logged here by agents._

- (Carried from native-loop plan) Loop-guard constants (16 turns, 4000-char
  truncation) promotion to settings — only if a user asks.
- Per-tool interactive approval tier ("review") — policy object must not
  preclude it; UI deferred.
- Inline "ask" mode transcript unification with RagSession — deferred.
- (TP-002) `agent_runner.ts` was minimally touched despite the File Scope
  "do NOT touch (TP-003)" note: collapsing the two runners into one required
  `run_turn(provider, prompt, backend)` to accept the backend. Nothing else in
  that file changed (no history/dispatch work). TP-003 owns the rest.
- (TP-002) The new `AgentEvent::Reasoning { delta }` variant now crosses the
  transport (native loop maps `AiStreamEvent::Reasoning`), but `agent_runner.ts`
  does not yet consume `{type:"reasoning"}` — it is dropped. Additive/byte-stable
  contract; existing consumers unchanged. Consuming it is TP-003/consumer work.
- (TP-002) File Scope said DELETE the native adapter; a prior durability step had
  moved it to `archive/native_agent_tauri_adapter.ts`, which reintroduced ~29 new
  type-aware oxlint errors (broken imports typed as `any`/`error`). Resolved by
  deleting the archived copy per the explicit DELETE directive — git history
  retains it.
- (TP-003) History-replay char budget (`HISTORY_MAX_CHARS = 100_000`) counts
  message CONTENT chars only; assistant `tool_calls.arguments` are excluded. Tool
  results (the bulk, truncated at 4000 chars each) are counted, so the ceiling is
  minor. Revisit if arguments payloads grow large enough to matter.
- (TP-008) Agent-mode citations derive only from tools whose INPUT carries a note
  path (`read_note` / `get_note_metadata` / built-in `Read`). `search_notes` result
  paths are NOT surfaced: `tool_end`'s `result_summary` is not captured on
  `RagToolEvent`/the message model, and wiring it would touch `agent_runner.ts`
  (out of scope, AgentEvent contract frozen). Revisit if search-hit citations are
  wanted — needs a message-model carrier for tool results.
- (TP-008) Built-in `Read` citations (and existing `changed_files` from built-in
  Write/Edit) use the raw path from `input_summary`, which for the native harness
  can be absolute; click-to-open expects vault-relative. Shared normalization gap,
  pre-existing on the changed-files path. Out of scope for TP-008.
