# TP-010 — Status

**State:** complete (pending team-lead merge)
**Branch:** wave-e/tp010

## Preflight blocker (resolved)

Base tip `0127f847` was vitest-RED (6 failures / 5599 pass) despite the
"all gates green" handoff — a gate-methodology bug (piped `tee` masked
vitest's non-zero exit; see ORCHESTRATION_LOG). check / lint(layering) /
cargo were genuinely green. All 6 were program fallout; team-lead
authorized TP-010 to fix them:

- **infer_agent_descriptor / provider_supports_streaming** read
  `config.transport.kind` unguarded → a persisted/malformed provider with
  no transport threw `reading 'kind'` inside `migrate_ai_settings`, failing
  vault open (vault_service pin tests ×2). Fixed with `config.transport?.`
  guards (trust-boundary hardening; behavior unchanged for well-formed
  configs). `fix(TP-010)`.
- **Stale consumer tests ×4** asserting the pre-freeze contract, realigned
  to the frozen post-TP-006/007 contract (`test(TP-010)`):
  - `register_ai_open_vault_in_agent` + `rag_mode_toggle` used `codex` as the
    "no-agent / backend-less" example; TP-006 made codex agent-capable —
    swapped to the `ollama` text_cli preset.
  - `register_rag_agent_actions` ×2 asserted the removed `permission_mode`
    field; TP-007 replaced it with `toolset:{kind:"read_only"}`.

## Simplifications applied

1. **Harness adapter dispatch de-dup** (`agent_stream.rs`) — the codex/claude
   match arms repeated an identical `build_invocation(...) + new_parser()`
   call, differing only in adapter type (trait not object-safe → no
   `Box<dyn>`). Extracted a generic `build_harness_invocation<A: HarnessAdapter>`
   helper; the match now only selects the adapter. Dispatch semantics
   unchanged. `refactor(TP-010)`.
2. **Real-catalog safe-mode parity test** (`mcp_mutating_parity.rs`) — added
   `safe_mode_read_only_parity_harness_vs_native`, which builds the read-only
   set from the REAL tool catalog two ways (harness `selector_allow_list`,
   native `allowed_tools`) and asserts equality. Closes the real-flag
   coverage gap the TP-007 review flagged (existing selector tests use only a
   synthetic 3-tool catalog). `test(TP-010)`.

## Candidates deliberately REJECTED / DEFERRED

- **Extract a shared `is_read_only(tool)` predicate** (harness `mcp_allow_list`
  vs native `allowed_tools`) — REJECTED. Wrapping `!tool.mutating` in a named
  fn shared across two modules adds import coupling for a one-liner; the new
  real-catalog parity test guards the safe≡read-only invariant far better
  than a shared negation would.
- **Empty allow-list guard in `build_agent_args`** (`if !allowed.is_empty()`) —
  DEFERRED. Adds a branch for a case unreachable with the real catalog, and
  even if reached the emitted args are harmless (`--allowedTools` followed by
  `--disallowedTools` parses fine). Behavior change to the frozen spawn-arg
  posture; not a simplification.
- **Explicit error on unknown adapter id** (`agent_stream.rs` dispatch) —
  DEFERRED. `adapter` is a closed 2-value set mirrored from TS
  (`claude`/`codex`); an unknown id is unreachable. Erroring on it is
  speculative hardening + a behavior change, not a simplification. Kept the
  frozen `Some("codex") => codex, _ => claude` semantics.
- **Backend-neutral codex tool-name mapping** (surface codex file_change as
  changed_files/citations) — DEFERRED. A feature addition (behavior change),
  too large for a simplification pass. Already tracked in the TP-006/TP-008
  CONTEXT notes.
- **De-dup `AgentCheckpointGit`** (defined in both `agent_runner.ts` and
  `agentic_edit_runner.ts`) — REJECTED. A 3-line structural DI type; sharing
  it across the ai/rag feature boundary adds coupling for no real gain. Both
  are local constructor contracts.

## Gates (full, on wave-e/tp010 tip)

- `pnpm check`: 0 errors
- `pnpm lint`: layering pass; oxlint --type-aware = baseline (never-green), no
  new program-scope errors
- `cargo test`: 789 + 7 pass, 0 fail; `mcp_mutating_parity` +
  `safe_mode_read_only_parity_harness_vs_native` + `specta_export` ok
- `pnpm test`: full suite green
- `pnpm format`: applied

## Frozen artifacts — unchanged

AgentEvent serde contract; safe ≡ read-only parity (`mcp_mutating_parity`
stays green); harness spawn-arg posture; history replay + eviction.
