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
- (TP-007) `ToolSelector::Only { names }` has no runtime producer yet — chat
  only emits `ReadOnly`/`Full`. Native `allowed_tools` and the harness
  `selector_allow_list` handle it correctly (unit-tested); TP-009 (agentic
  inline edit) is its intended first consumer.
- (TP-007) `AgentStreamRequest` carries `toolset` only, not the full
  `SurfacePolicy`. `SurfacePolicy.prompt_mode`/`sink` are TS surface concerns
  with no Rust consumer yet; TP-009 will plumb them to Rust when inline edit
  needs a different system prompt and a `diff_apply` sink.
- (TP-007) Rust `AgentPermissionMode` was removed (folded into `ToolSelector`).
  The safe/power concept now lives only in TS (`agent_events.ts` + session/UI),
  bridged by `chat_policy()`. TP-006's codex adapter must call the shared
  `harness::selector_allow_list` to inherit the safe-mode parity fix.
- (TP-007) `HarnessAdapter::SUPPORTS_RESUME`/`SUPPORTS_PARTIAL_TEXT` still
  unread by the driver — deferred to TP-006's multi-adapter dispatch.
- (TP-009) Agentic inline edit passes `history: []` to the loop — each inline
  edit is a fresh single-turn transform of the note/selection. The TP-003
  dependency ("inline dialog turns replay too") is intentionally NOT exercised:
  replaying prior edit turns would feed stale note snapshots into the loop and
  muddy the current edit. Revisit only if a user wants multi-turn refinement in
  the inline dialog (would need `AiConversationTurn[] → AiMessage[]` mapping,
  cf. rag's `rag_messages_to_history`).
- (TP-009) `inline_edit_policy()`'s `prompt_mode`/`sink` are TS-only surface
  descriptors — NOT plumbed to Rust (frozen `AgentStreamRequest` untouched). The
  sink is realized by returning text to the existing diff/apply UI; the prompt
  is the reused edit prompt as the loop's user message. If a future surface
  needs the native loop to intercept `edit_note` as a propose-only (no disk
  write) mechanism so a WRITE-capable inline agentic edit is possible, that is
  the point to extend `AgentStreamRequest` additively with prompt_mode/sink and
  branch in `native_agent.rs`. Deliberately out of scope here — the read-only
  toolset + human diff-approval already satisfy the inline permission model.
- (TP-009) Inline agentic output quality depends on the native loop's default
  agent system prompt combined with the edit user-prompt; not exercised by the
  fake-port tests. Carried to the live-model smoke matrix (agentic-inline smoke).
- (TP-006) Codex `SUPPORTS_RESUME = false`: `codex exec resume <id>` is a
  subcommand (different arg shape from claude's `--resume` flag) and can't be
  live-verified without a model, so `resume_session_id` is ignored and every codex
  turn starts fresh (no prior-turn memory in the CLI). Implementing the resume
  subcommand + live smoke is follow-up. The `SUPPORTS_*` consts are set truthfully
  but are still not read by the driver (dispatch is on `AgentRunSpec.adapter`).
- (TP-006) `AgentRunSpec.adapter` is `Option<String>` matched on `Some("codex")`
  (else claude) — stringly-typed dispatch over a 2-value closed set that mirrors the
  TS `AgentCapability.adapter` string. TS stamps it in `agent_tauri_adapter.ts` via
  `agent_capability()` (agent_runner.ts was out of scope / untouched).
- (TP-006) Codex non-MCP tool events (`command_execution`/`file_change`/`web_search`)
  use the raw codex item-type as the AgentEvent `name`; downstream `changed_files`
  and TP-008 citations key on claude names (`Write`/`Edit`/`Read`), so codex file
  changes won't surface as changed-files/citations. Same shared normalization gap
  the TP-008 notes already track; needs a backend-neutral tool-name mapping.
- (TP-006) Codex `Done` stats are zeroed except `num_turns = 1`: `turn.completed`
  gives token `usage`, which doesn't map to `AgentRunStats{duration_ms, num_turns,
  total_cost_usd}`. Revisit if codex exposes duration/cost or the stats shape grows.
- (TP-006) `--ignore-user-config` means codex runs with its default model;
  `provider_config.model` is ignored (claude adapter also ignores model). Add `-m`
  if per-provider model selection is wanted.
- (TP-006) LIVE SMOKE REQUIRED (carried into the program's smoke matrix): no
  successful codex model turn was run (auth/cost/outward-facing). Must verify real
  `agent_message`/`mcp_tool_call`/`command_execution` item shapes and that safe-mode
  `enabled_tools` truly blocks a mutating MCP call end-to-end (OS sandbox does NOT
  cover MCP-over-HTTP calls — the allowlist is the only safe-mode barrier there).
