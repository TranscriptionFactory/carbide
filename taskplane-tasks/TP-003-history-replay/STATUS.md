# TP-003 — Status

**State:** Implemented; fast gates green. Not merged (orchestrator merges).

## What shipped

Native agent loop now replays bounded prior-turn history instead of starting
each turn amnesiac.

- `AgentRunSpec` gained `history: Vec<AiMessage>` (`#[serde(default)]`, specta
  type regenerated).
- `spawn_native_turn` builds `history = evict_history(spec.history)` then
  appends the current `user_message(prompt)`; the loop still prepends the
  system message, so the model sees `system + evicted-replay + prompt`.
- TS `AgentStreamRequest` gained `history`; `agent_runner.run_turn` builds it
  from `session.messages` (excluding the trailing just-added prompt) via the new
  `domain/agent_history.ts` mapper; the tauri adapter forwards it.

## Frozen design — history replay + eviction

- **Replay source (TS):** `rag_messages_to_history(session.messages.slice(0, -1))`.
  Roles map 1:1 (`user`/`assistant`/`tool`); assistant `tool_calls` and tool
  `tool_call_id` carried through; content is the message text.
- **Eviction (authoritative in Rust, backstop):** keep newest-first while within
  BOTH caps — `HISTORY_MAX_MESSAGES = 40` and `HISTORY_MAX_CHARS = 100_000` — then
  drop any leading orphaned `tool` messages. An assistant `tool_calls` message
  and its following `tool` results are one atomic unit: the cap can never keep a
  tool result whose originating call was evicted (orphaned `tool_call_id` breaks
  OpenAI-compat APIs).
- **TS client cap:** same 40-message cap + orphan-tool-prefix trim; Rust is the
  authoritative backstop (also enforces the char cap).
- **Char budget counts message CONTENT chars only** (tool_call `arguments`
  excluded). Tool results — the bulk, already truncated at 4000 chars each — are
  counted. Known minor ceiling; logged in CONTEXT.md.
- Intra-loop growth is unchanged: eviction runs once on the initial replay, not
  between iterations (the 16-turn / 4000-char loop guards still bound a turn).

## Cross-task coordination (for merge)

- **Touched `agent_stream.rs`** (Do-NOT / TP-004 file): added ONE additive
  `#[serde(default)] pub history: Vec<AiMessage>` field to `AgentRunSpec` plus its
  import. Unavoidable — the struct lives there. Smallest possible change; flag for
  TP-004 merge.
- **Touched `agent_tauri_adapter.ts`** (not in File Scope, not in Do-NOT): added
  `history: input.history` to the forwarded spec object. Required plumbing.
- **Did NOT touch `rag_actions.ts`** (TP-004's parallel file).

## Out of PROMPT scope (observed, left for the lead to route)

- `agent_runner.ts` still does not consume `AgentEvent { type: "reasoning" }`
  (already logged in CONTEXT.md as TP-002 carryover). The TP-003 PROMPT is
  history-replay only, so not implemented here.
- `run_turn`'s minimal `backend` param needs no change for history replay.

## Gates

- `cargo test ... -- specta_export native_agent`: 15 passed (6 new).
- `pnpm vitest run` (agent_history + agent_runner): 9 passed (3 new).
- `pnpm check`: 0 errors. Layering lint: passed. `oxlint` (changed files): clean.
- `pnpm format`: TS files already formatted. `rustfmt`/`cargo fmt` unavailable in
  the lane env; Rust compiles + tests pass (formatting is not a task gate).
