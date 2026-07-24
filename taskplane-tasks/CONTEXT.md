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
- (TP-004) The PROMPT's `HarnessAdapter::mcp_config_args(port, token) -> Vec<String>`
  was NOT added. Claude's MCP args (`--strict-mcp-config --mcp-config <path>`) live
  inside `build_agent_args`, which had to stay VERBATIM for the zero-deviation gate;
  and `prepare_mcp_config` is shared with out-of-scope `agent_handoff.rs`. Adding an
  unused method would be dead code. TP-006 should introduce the per-CLI MCP-config
  mechanism (likely a fallible `write_mcp_config(port, token) -> Result<String>` on
  the trait, routing both `agent_stream` and `agent_handoff` through the adapter).
- (TP-004) `HarnessAdapter` carries associated consts `SUPPORTS_RESUME` /
  `SUPPORTS_PARTIAL_TEXT` (→ not object-safe, so the driver instantiates the concrete
  `ClaudeAdapter`; dispatch to a second adapter is TP-006's job). The consts are not
  yet read by the driver — informational until TP-006/TP-007 consume them.
- (TP-004) The TS `AgentCapability.adapter` id ("claude") is informational only; the
  Rust `AgentRunSpec` still carries just `backend: Harness|Native`. TP-006 must plumb
  the adapter id into `AgentRunSpec` to dispatch claude vs codex within the harness.
- (TP-004) `ai_settings_migration.test.ts` uses the file's pervasive `result!.` idiom;
  the new stamping test rows add more `no-non-null-assertion` type-aware-oxlint entries
  consistent with the existing (never-green) baseline in that file. No layering-gate
  impact.
- (TP-004) PROMPT File Scope named `rag_mode_toggle.svelte` as the capability-check
  call site, but post-TP-002 the actual `agent_backend` call sites are in
  `rag_panel.svelte` (derives `agent_supported`, passes it as a prop). Updated
  `rag_panel.svelte` instead; `rag_mode_toggle.svelte` (boolean prop only) untouched.
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
