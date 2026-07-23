# Task: TP-005 — Rust↔TS mutating-tool parity test
**Created:** 2026-07-23
**Size:** S
## Review Level: 1 (Plan Only)
**Assessment:** Test-only task, but introduces a new cross-language consistency-test pattern that protects a frozen safety invariant (safe mode never mutates the vault).
**Score:** 1/8 — Blast radius: 0, Pattern novelty: 1, Security: 0, Reversibility: 0 (L1 chosen deliberately over L0)

## Canonical Task Folder
```
taskplane-tasks/TP-005-mutating-parity/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission
`ToolDefinition.mutating` (Rust, source of truth for native safe-mode filtering) and `MUTATING_MCP_TOOLS` (TS, `agent_file_ops.ts`, drives changed-file tracking) are dual sources of truth with no cross-check. Add a cargo integration test that fails if they disagree. vitest CANNOT do this (no Tauri runtime in vitest) — the check must live Rust-side, reading the TS source file, following the precedent of `src-tauri/tests/mcp_schema_consistency.rs` (which reads tool definitions and asserts invariants).

## Dependencies
- **None** (test-only, new file, zero overlap with other tasks)

## Context to Read First
- `src-tauri/tests/mcp_schema_consistency.rs` — precedent: builds `McpRouter`, calls `tool_definitions_public()`, asserts catalog invariants
- `src-tauri/src/features/mcp/router.rs` — `tool_definitions_public()`
- `src-tauri/src/features/mcp/types.rs` — `ToolDefinition { name, mutating, .. }`
- `src/lib/features/rag/domain/agent_file_ops.ts` — `MUTATING_MCP_TOOLS` set (note: `MUTATING_BUILTIN_TOOLS` = claude built-in names like Write/Edit — OUT of comparison scope, they are harness-side names, not MCP catalog)

## File Scope
- `src-tauri/tests/mcp_mutating_parity.rs` (NEW, only file)

## Steps
### Step 0: Preflight
- [ ] Baseline: `cargo test --manifest-path src-tauri/Cargo.toml mcp_schema_consistency` passes

### Step 1: Parity test
- [ ] Test reads `src/lib/features/rag/domain/agent_file_ops.ts` (path relative to `src-tauri/`: `../src/lib/features/rag/domain/agent_file_ops.ts`; use `CARGO_MANIFEST_DIR`)
- [ ] Extract `MUTATING_MCP_TOOLS` string entries (simple line-based parse of the `new Set([...])` block — no regex crate needed if the existing test style avoids it; match existing test-file conventions)
- [ ] Compute Rust set: `tool_definitions_public().filter(mutating).map(name)`
- [ ] Assert set equality; on failure print BOTH diffs (in-Rust-not-TS, in-TS-not-Rust) with a message telling the developer to update both sides
- [ ] Verify the test FAILS when it should: temporarily add a bogus entry to one side locally, see the failure, revert (do not commit the bogus state)

### Step 2: Testing & Verification
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml mcp_mutating_parity` green
- [ ] FULL gates (nohup + poll → `.tmpfiles/`): `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test --manifest-path src-tauri/Cargo.toml`; `pnpm format`

### Step 3: Documentation & Delivery
- [ ] STATUS.md notes the pattern for future dual-source-of-truth checks

## Documentation Requirements
**Must Update:** none
**Check If Affected:** none

## Completion Criteria
- [ ] Parity test green and proven to fail on divergence
- [ ] All gates green

## Git Commit Convention
- `test(TP-005): add Rust↔TS mutating-tool parity check`

## Do NOT
- Change either mutating set (if they already diverge, STOP and record in STATUS.md — do not silently fix)
- Expand scope
