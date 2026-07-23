# Task: TP-007 — Surface policies + tool selector (safe-mode parity fix)
**Created:** 2026-07-23
**Size:** M
## Review Level: 2 (Plan and Code)
**Assessment:** Introduces the policy object the whole framework keys on AND deliberately changes harness safe-mode semantics (wildcard → explicit allow-list) — a real permission-tightening that must be test-asserted, not slipped in.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 1 (permission semantics), Reversibility: 0

## Canonical Task Folder
```
taskplane-tasks/TP-007-surface-policy/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission
Introduce `SurfacePolicy`/`ToolSelector` — the per-surface configuration that lets chat, inline edit, and future surfaces share one agent framework — and fold permission modes into it. While doing so, FIX a verified cross-backend safety drift: harness safe mode currently passes `--allowedTools "mcp__carbide__*"` (wildcard = ALL 25 MCP tools, INCLUDING mutating ones like `create_note`), while native safe mode filters mutating tools out of the catalog. After this task, safe ≡ read-only on BOTH backends: the harness allow-list is generated from catalog mutating bits (explicit `mcp__carbide__<tool>` names), not a wildcard.

## Dependencies
- **Task:** TP-003 (history replay touched `native_agent.rs` — serialize)
- **Task:** TP-004 (harness adapter owns spawn args now; allow-list generation lives in the claude adapter)

## Context to Read First
- `AGENTS.md`, `docs/architecture.md`
- `src-tauri/src/features/ai/native_agent.rs` — `allowed_tools(catalog, mode)` (filters `ToolDefinition.mutating` for safe)
- `src-tauri/src/features/ai/harness/claude_adapter.rs` — current safe args (`--allowedTools "mcp__carbide__*"`, disallow Bash/Write/Edit built-ins) vs power (`--permission-mode acceptEdits`)
- `src-tauri/src/features/mcp/router.rs` — `tool_definitions_public()`
- `src/lib/features/rag/ports.ts` — `AgentStreamRequest` (post-TP-002/003)
- `src/lib/features/rag/application/agent_runner.ts` — request construction
- `src/lib/features/ai/domain/ai_provider_capabilities.ts` — capability (post-TP-004)

## File Scope
- `src/lib/features/ai/domain/agent_run_policy.ts` (NEW)
- `src-tauri/src/features/ai/native_agent.rs` (`allowed_tools` selector)
- `src-tauri/src/features/ai/harness/claude_adapter.rs` (allow-list generation)
- `src-tauri/src/features/ai/harness/mod.rs` (trait signature if selector must flow)
- `src-tauri/tests/native_agent.rs`, `src-tauri/tests/agent_stream.rs` (fixture updates — see Step 3)
- `src/lib/features/rag/ports.ts`, `src/lib/features/rag/application/agent_runner.ts` (policy plumbing)
- `tests/unit/**` policy tests

Do NOT touch: UI components, `rag_service.ts`, MCP tool definitions, `agent_file_ops.ts` (TP-008), codex adapter (TP-006 — if merged, apply the same allow-list generation there too; if not merged, leave a STATUS.md note for its author… no — codex safe mode must inherit the fix via the shared helper, so put allow-list generation in `harness/mod.rs` as a shared fn both adapters call).

## Steps
### Step 0: Preflight
- [ ] TP-003 + TP-004 merged; gitignored `src/lib/generated/bindings.ts` + `src-tauri/excalidraw-dist/` present
- [ ] Baselines green: `cargo test --manifest-path src-tauri/Cargo.toml native_agent` and `... agent_stream`

### Step 1: ToolSelector (Rust)
- [ ] `ToolSelector` enum (specta): `ReadOnly | Full | Only(Vec<String>)`
- [ ] `native_agent.rs`: `allowed_tools(catalog, selector)` — ReadOnly ≡ filter !mutating, Full ≡ all, Only ≡ name filter; `AgentRunSpec` carries `toolset` (permission mode folds in: chat safe → ReadOnly, power → Full); keep `permission_mode` field if the harness adapter still needs it for flag style — resolve the duplication deliberately and record the choice in STATUS.md
- [ ] Shared harness helper (`harness/mod.rs`): `mcp_allow_list(catalog) -> Vec<String>` = explicit `mcp__carbide__<name>` for every NON-mutating tool

### Step 2: Harness safe-mode parity fix
- [ ] claude adapter safe mode: `--allowedTools` receives the EXPLICIT read-only MCP names (no wildcard); built-in Bash/Write/Edit stay disallowed; power mode unchanged
- [ ] Update TP-004-era arg fixtures: this is a DELIBERATE semantic change — before/after assertions in the test names/bodies must make the tightening obvious

### Step 3: SurfacePolicy (TS) + plumbing
- [ ] `agent_run_policy.ts`: `SurfacePolicy { toolset: ToolSelector; prompt_mode: "chat" | "inline_edit"; sink: "session" | "diff_apply" }`; `chat_policy(permission_mode)` factory (safe → ReadOnly/session, power → Full/session)
- [ ] `AgentStreamRequest` carries the policy (or toolset); `agent_runner` passes `chat_policy(session.permission_mode)` — no behavior change for chat beyond the safe-mode tightening
- [ ] `cargo test specta_export`

### Step 4: BDD scenario 7 tests
- [ ] Cargo: selector filtering per variant; safe ≡ ReadOnly denies `create_note` on BOTH backends (native: absent from request tools + hallucinated call refused; harness: absent from allowedTools args)
- [ ] Parity assertion: harness safe args contain NO `mcp__carbide__*` wildcard, DO contain read tools, do NOT contain mutating tools
- [ ] Vitest: `chat_policy` mapping

### Step 5: Testing & Verification
- [ ] FULL gates (nohup + poll → `.tmpfiles/`): `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test --manifest-path src-tauri/Cargo.toml`; `pnpm format`

### Step 6: Documentation & Delivery
- [ ] STATUS.md: the semantic change called out + permission_mode/toolset resolution rationale

## Documentation Requirements
**Must Update:** none
**Check If Affected:** any `docs/` mention of agent safe mode semantics

## Completion Criteria
- [ ] safe ≡ read-only on both backends, test-proven
- [ ] Policy object exists and drives request construction
- [ ] All gates green

## Git Commit Convention
- `feat(TP-007): complete Step N — description`; the safe-mode tightening gets its OWN commit: `fix(TP-007): harness safe mode excludes mutating MCP tools (parity with native)`

## Do NOT
- Add per-tool interactive approval UI (explicitly deferred by user)
- Change MCP tool definitions or the mutating bits (TP-005's parity test guards them)
- Expand scope — tech debt to `taskplane-tasks/CONTEXT.md`
