# Task: TP-002 — Agent run contract + plumbing convergence

**Created:** 2026-07-23
**Size:** L

## Review Level: 2 (Plan and Code)

**Assessment:** Multi-service refactor of a frozen cross-language event contract; silent-regression risk is high even though mechanics are a move/merge.
**Score:** 3/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 0 (bumped to L2 deliberately: AgentEvent is the frozen contract between Rust and TS)

## Canonical Task Folder

```
taskplane-tasks/TP-002-agent-run-contract/
├── PROMPT.md   ← This file (immutable above --- divider)
├── STATUS.md   ← Execution state (worker updates this)
├── .reviews/   ← Reviewer output (created by the orchestrator runtime)
└── .DONE       ← Created when complete
```

## Mission

Collapse the duplicated agent-run plumbing into ONE command pair, ONE event channel, ONE abort registry, and ONE TS adapter — without changing any runtime behavior of either backend. Today there are two near-identical stacks: harness (`agent_stream_start`, `agent-stream-event:{id}`, `AgentStreamState`, `agent_tauri_adapter.ts`) and native (`native_agent_stream_start`, `native-agent-stream-event:{id}`, `NativeAgentState`, `native_agent_tauri_adapter.ts`). Also extend `AgentEvent` ADDITIVELY: new `reasoning` variant (the native loop currently drops transport-level reasoning) and optional `result_summary` on `tool_end`.

## Dependencies

- **None**

## Context to Read First

- `AGENTS.md` (repo rules), `docs/architecture.md` (decision tree — read FIRST)
- `src-tauri/src/features/ai/agent_stream.rs` — `AgentEvent` enum (serde internally tagged `type`, snake_case variants), `AgentStreamState`, command surface
- `src-tauri/src/features/ai/native_agent.rs` — `NativeAgentState`, command surface, `run_native_turn` event mapping (note: `AiStreamEvent::Reasoning` currently unhandled = dropped)
- `src/lib/features/rag/types/agent_events.ts` — TS mirror of AgentEvent
- `src/lib/features/rag/adapters/agent_tauri_adapter.ts` and `native_agent_tauri_adapter.ts` — the two ~70-line adapters that differ only in command/channel strings
- `src/lib/features/rag/ports.ts` — `AgentPort`, `AgentStreamRequest`
- `src/lib/features/rag/application/rag_actions.ts` — DI: `agent_runners = { harness, native }`

## File Scope

- `src-tauri/src/features/ai/agent_stream.rs`
- `src-tauri/src/features/ai/native_agent.rs`
- `src-tauri/src/features/ai/mod.rs`
- `src-tauri/src/features/ai/stream.rs` (only if registry merge requires)
- `src-tauri/tests/agent_stream.rs`, `src-tauri/tests/native_agent.rs` (update command names)
- `src/lib/features/rag/ports.ts`
- `src/lib/features/rag/types/agent_events.ts`
- `src/lib/features/rag/adapters/agent_tauri_adapter.ts`
- `src/lib/features/rag/adapters/native_agent_tauri_adapter.ts` (DELETE)
- `src/lib/features/rag/application/rag_actions.ts`
- `tests/unit/**` adapter/action tests referencing the old commands/channels

Do NOT touch: `rag_service.ts`, any `*.svelte` UI, `agent_runner.ts` (TP-003), `src/lib/features/ai/domain/*` (TP-004), MCP tools.

## Steps

### Step 0: Preflight

- [ ] Worktree has gitignored files copied from main checkout: `src/lib/generated/bindings.ts`, `src-tauri/excalidraw-dist/` (or regenerate bindings: `cargo test --manifest-path src-tauri/Cargo.toml specta_export`)
- [ ] Baseline gates green before edits (nohup + poll for long runs — this host kills Bash at 120s): `nohup pnpm test > .tmpfiles/tp002-base-vitest.log 2>&1 &` and `nohup cargo test --manifest-path src-tauri/Cargo.toml > .tmpfiles/tp002-base-cargo.log 2>&1 &`

### Step 1: Rust unified command + registry

- [ ] Define `AgentRunBackend` enum (`"harness" | "native"`, snake_case serde) and `AgentRunSpec` struct: `{ provider_config, prompt, vault_path, permission_mode, resume_session_id?, backend }` — specta-typed
- [ ] New commands `agent_run_start(request_id, spec)` / `agent_run_abort(request_id)`; single channel `agent-run-event:{request_id}`; ONE registry struct replacing `AgentStreamState` + `NativeAgentState`; route to the EXISTING harness spawn logic and `run_native_turn` unchanged
- [ ] `AgentEvent`: add `#[serde(rename = "reasoning")] Reasoning { delta: String }` and `result_summary: Option<String>` on `ToolEnd` (`#[serde(default, skip_serializing_if = "Option::is_none")]`). NO other variant changes — existing variants byte-stable
- [ ] Native loop: map `AiStreamEvent::Reasoning { text }` → `AgentEvent::Reasoning { delta: text }`; populate `result_summary: None` everywhere for now
- [ ] Delete old commands/registries/channels (clean break — repo rule: internal API breaks OK, 0 users)
- [ ] `cargo test specta_export` to regenerate bindings.ts

### Step 2: TS single adapter + port

- [ ] `agent_events.ts`: add `{ type: "reasoning"; delta: string }`; `result_summary?: string | null` on tool_end
- [ ] `AgentStreamRequest` gains `backend: "harness" | "native"`
- [ ] Rewrite `agent_tauri_adapter.ts` as THE adapter (channel `agent-run-event:`), delete `native_agent_tauri_adapter.ts`
- [ ] `rag_actions.ts`: single `agent_port` + single `AgentRunner`; `agent_backend(provider)` result passed as `request.backend` (keep `agent_backend()` as-is — TP-004 replaces it)
- [ ] Update affected unit tests

### Step 3: Testing & Verification

- [ ] Targeted: `cargo test --manifest-path src-tauri/Cargo.toml agent` and `pnpm vitest run tests/unit/services/agent_runner.test.ts` (and adapter tests)
- [ ] `grep -rn "native-agent-stream-event\|native_agent_stream_start" src/ src-tauri/src/` → ZERO hits outside history/comments
- [ ] FULL gates (nohup pattern): `pnpm check` 0 errors, `pnpm lint` (layering pass), `pnpm test` all green, `cargo test` all green, then `pnpm format`
- [ ] Fix all failures

### Step 4: Documentation & Delivery

- [ ] Discoveries logged in STATUS.md (esp. any place that hardcoded the old channel names)

## Documentation Requirements

**Must Update:** none (internal refactor; AGENTS.md untouched)
**Check If Affected:** none

## Completion Criteria

- [ ] One command pair / one channel / one registry / one adapter; old ones gone
- [ ] AgentEvent extension additive; existing consumers render unchanged
- [ ] All gates green; `pnpm format` applied

## Git Commit Convention

- Step boundaries: `feat(TP-002): complete Step N — description`
- Contract change isolated: first commit contains ONLY the AgentEvent additive extension + TS mirror + bindings regen (`feat(TP-002): extend AgentEvent contract (additive)`), mechanics in later commits

## Do NOT

- Change harness spawn args, parsers, or the native loop's dispatch/guard logic (extraction refactors are TP-004)
- Touch `agent_backend()` semantics
- Expand scope — log tech debt in `taskplane-tasks/CONTEXT.md` instead
- Rebase/reset/push; write to /tmp (use `.tmpfiles/`)
