# Task: TP-003 — Native loop history replay (fix amnesia)
**Created:** 2026-07-23
**Size:** M
## Review Level: 1 (Plan Only)
**Assessment:** Core-loop behavior change but narrow (request construction + eviction); scripted-fake tests give strong coverage.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 0

## Canonical Task Folder
```
taskplane-tasks/TP-003-history-replay/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission
The native agent backend is amnesiac: `native_agent.rs` (`agent_run_start`, formerly `native_agent_stream_start`) builds `history = vec![user_message(prompt)]` and discards `resume_session_id`. Prior turns — including persisted tool-call/tool-result messages — never reach the model, so multi-turn native agent chats lose all context. Make `AgentRunSpec` carry an explicit, bounded replay history built in TS from `RagSession.messages`, and make the Rust loop prepend it (system prompt first) with oldest-first eviction that never orphans tool messages.

## Dependencies
- **Task:** TP-002 (unified `agent_run_start` command + `AgentRunSpec` must exist first)

## Context to Read First
- `AGENTS.md`, `docs/architecture.md`
- `src-tauri/src/features/ai/native_agent.rs` — `run_native_turn(client, dispatch, session_id, system_prompt, history, ...)`; the command currently does `let history = vec![user_message(prompt)];`
- `src-tauri/src/features/ai/stream.rs` — `AiMessage`, `AiMessageContent`, `AiToolCall` shapes (roles system/user/assistant/tool; assistant may carry `tool_calls`; tool messages carry `tool_call_id`)
- `src/lib/features/rag/ports.ts` — `AgentStreamRequest` (post-TP-002)
- `src/lib/features/rag/application/agent_runner.ts` — `run_turn` builds the request
- `src/lib/features/rag/domain/rag_types.ts` — `RagMessage` (has optional `tool_calls`, `tool_call_id`, `"tool"` role — persistence round-trips these already)
- `tests/unit/services/agent_runner.test.ts`, `src-tauri/tests/native_agent.rs` (scripted-fake `ModelClient` tests)

## File Scope
- `src-tauri/src/features/ai/native_agent.rs`
- `src-tauri/tests/native_agent.rs`
- `src/lib/features/rag/ports.ts`
- `src/lib/features/rag/application/agent_runner.ts`
- `src/lib/features/rag/application/rag_actions.ts` (only if request plumbing requires)
- `src/lib/features/rag/domain/rag_session.ts` (only if message mapping helper belongs there)
- `tests/unit/services/agent_runner.test.ts` and/or new `tests/unit/**/agent_history*.test.ts`

Do NOT touch: `agent_stream.rs`/`harness/*` (TP-004), UI, `rag_service.ts`, MCP tools, `ai_provider_capabilities.ts` (TP-004).

## Steps
### Step 0: Preflight
- [ ] TP-002 merged; worktree contains its commits; gitignored `src/lib/generated/bindings.ts` + `src-tauri/excalidraw-dist/` present (copy from main checkout or `cargo test --manifest-path src-tauri/Cargo.toml specta_export`)
- [ ] Baseline targeted tests green: `cargo test --manifest-path src-tauri/Cargo.toml native_agent`

### Step 1: Rust accepts bounded history
- [ ] `AgentRunSpec` gains `history: Vec<AiMessage>` (serde default empty; specta type updated; `cargo test specta_export`)
- [ ] Request construction: `messages = system_message(system_prompt) + evict(history) + user_message(prompt)`; `run_native_turn` signature unchanged in spirit (it already takes `history`)
- [ ] Eviction: cap history at 40 messages AND 100_000 chars total; evict oldest-first; CRITICAL: never orphan a `tool` message — an assistant message with `tool_calls` and its following `tool` messages are dropped as one unit (orphaned `tool_call_id` breaks OpenAI-compat APIs)
- [ ] Unit tests: eviction order, tool-group atomicity, boundary exactly-at-cap

### Step 2: TS replay builder
- [ ] `AgentStreamRequest` gains `history` (TS mirror of Rust `AiMessage` incl. `tool_calls`/`tool_call_id`)
- [ ] `agent_runner.ts`: build replay from `rag_store.active.messages` — roles map 1:1 (`user`/`assistant`/`tool`); assistant `tool_calls` from message.tool_calls; tool messages carry `tool_call_id` + text content; EXCLUDE the new prompt (Rust appends it); apply the same 40-message cap client-side (Rust cap is the backstop)
- [ ] Harness backend: ignores `history` when `resume_session_id` is set (CLI replays itself); also ignores it in v1 otherwise — document in code comment… no, repo rule: NO comments except non-obvious — the eviction unit-drop IS non-obvious, comment that only

### Step 3: BDD scenario 3 tests
- [ ] Scripted-fake `ModelClient` test (cargo): 3-turn session — turn 2's received messages contain turn-1 user + assistant(tool_calls) + tool result in order, system first
- [ ] Vitest: replay builder maps a RagSession with tool messages correctly; over-cap session evicts oldest-first without orphaned tool messages

### Step 4: Testing & Verification
- [ ] Targeted: `cargo test --manifest-path src-tauri/Cargo.toml native_agent`; `pnpm vitest run tests/unit/services/agent_runner.test.ts`
- [ ] FULL gates (nohup + poll, host kills Bash at 120s; logs to `.tmpfiles/`): `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test --manifest-path src-tauri/Cargo.toml`; then `pnpm format`

### Step 5: Documentation & Delivery
- [ ] Discoveries logged in STATUS.md

## Documentation Requirements
**Must Update:** none
**Check If Affected:** none

## Completion Criteria
- [ ] Multi-turn native agent conversations retain prior context (test-proven)
- [ ] Eviction bounded + tool-group atomic
- [ ] All gates green

## Git Commit Convention
- `feat(TP-003): complete Step N — description`; tests `test(TP-003): …`

## Do NOT
- Change harness resume semantics or the native loop's guards (16-turn cap, 4000-char truncation stay)
- Add settings for the caps (constants; YAGNI until asked)
- Expand scope — tech debt to `taskplane-tasks/CONTEXT.md`
