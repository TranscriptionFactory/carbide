# TP-007 — Status

**State:** Complete (fast gates green). Not merged — orchestrator owns merges.

## Deliverables

- `ToolSelector` (`ReadOnly | Full | Only { names }`) is the agent run
  contract's single source of tool-permission truth. Native `allowed_tools`
  and the harness spawn args both key off it.
- `SurfacePolicy { toolset, prompt_mode, sink }` + `chat_policy(mode)` factory
  in `src/lib/features/ai/domain/agent_run_policy.ts`, re-exported from
  `$lib/features/ai`. Chat: safe → ReadOnly/chat/session, power → Full/chat/session.
- Harness safe mode tightened to explicit read-only MCP names (parity with native).

## Locked semantic change (called out per mandate)

**safe ≡ read-only on BOTH backends** — now FROZEN. Harness safe mode used to
pass `--allowedTools mcp__carbide__*` (a wildcard that granted every MCP tool,
including mutating ones like `create_note`), while native safe mode already
filtered mutating tools out of the catalog. The harness allow-list is now
generated from the catalog's `mutating` bits via a shared helper
(`harness::mcp_allow_list` / `selector_allow_list`) that emits explicit
`mcp__carbide__<name>` entries for every NON-mutating tool. Built-in
Bash/Write/Edit stay disallowed; power mode (`--permission-mode acceptEdits`)
is unchanged.

This tightening is isolated in its own commit:
`fix(TP-007): harness safe mode excludes mutating MCP tools (parity with native)`.
The one sanctioned fixture change is in `src-tauri/tests/agent_stream.rs`
(`safe_mode_allow_list_is_explicit_read_only_not_wildcard`).

## permission_mode vs toolset resolution (deliberate)

Resolved the duplication by **elimination**, not coexistence. `AgentRunSpec`
now carries `toolset: ToolSelector` and the Rust `AgentPermissionMode` enum is
removed. The harness derives its flag posture from the selector
(`ReadOnly`/`Only` → allow-list + disallow built-ins; `Full` → acceptEdits), so
no separate `permission_mode` field is needed for flag style — a single source
of truth, no field that can disagree with the toolset.

The user-facing safe/power concept stays entirely in TS
(`agent_events.ts` `AgentPermissionMode`, session/store/UI). `chat_policy()`
bridges the session mode to a `ToolSelector` at request-construction time.
Rationale: AGENTS.md favors clean refactors over back-compat (0 users), and TS
owning UX permission modes while Rust speaks only concrete tool selection keeps
each layer's vocabulary minimal.

## SUPPORTS_* consts

NOT consumed by the driver (out of scope for TP-007). They remain informational
until TP-006 introduces multi-adapter dispatch.

## Per-tool interactive approval

DEFERRED per user. The policy object does not preclude it (a `review`/`Only`
tier can be added later); no UI or approval flow was built.

## Gates (fast, per-task)

- `pnpm check`: 0 errors
- `pnpm lint`: layering pass; oxlint scoped to touched files clean
- `cargo test` (native_agent, agent_stream, specta_export, mcp_mutating_parity):
  all pass; TP-005 mutating-parity test green
- `pnpm vitest run` (agent_run_policy, agent_runner): 8 pass
- `pnpm format` (prettier, scoped): unchanged
