# Task: TP-004 — Capability descriptors + HarnessAdapter extraction

**Created:** 2026-07-23
**Size:** L

## Review Level: 2 (Plan and Code)

**Assessment:** Replaces identity-keyed backend selection with data-driven descriptors incl. a settings migration, AND extracts the claude harness behind a trait with a zero-deviation gate.
**Score:** 4/8 — Blast radius: 2, Pattern novelty: 1, Security: 0, Reversibility: 1 (settings migration)

## Canonical Task Folder

```
taskplane-tasks/TP-004-capability-harness-seam/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission

Two coupled changes. (1) Rust: extract the claude-CLI harness logic out of `agent_stream.rs` behind a new `HarnessAdapter` trait so a second CLI adapter (Codex, TP-006) can plug in — the claude implementation moves VERBATIM, gated by its existing tests passing unmodified. (2) TS: replace identity-keyed `agent_backend()` (`config.id === "claude"` → harness) with a data-driven `agent` capability descriptor on `AiProviderConfig`, with legacy inference as fallback and a settings migration that stamps descriptors onto presets.

## Dependencies

- **Task:** TP-002 (unified run command/registry must exist; harness driver routes through it)

## Context to Read First

- `AGENTS.md`, `docs/architecture.md`
- `src-tauri/src/features/ai/agent_stream.rs` — `AgentEventParser` (NDJSON, claude stream-json schema: `system`/`stream_event`/`assistant`/`user`/`result`), spawn-arg construction (`-p`, `--output-format stream-json`, `--verbose`, `--include-partial-messages`, `--strict-mcp-config`, `--mcp-config`, `--allowedTools`/`--disallowedTools` or `--permission-mode acceptEdits`, `--resume`), abort registry (post-TP-002 unified)
- `src-tauri/src/features/mcp/setup.rs` — ephemeral mcp-config writer (writes `~/.carbide/agent-mcp-config.json`)
- `src/lib/features/ai/domain/ai_provider_capabilities.ts` — current `agent_backend()`
- `src/lib/shared/types/ai_provider_config.ts` — provider config + presets
- `src/lib/features/ai/domain/ai_settings_migration.ts` — migration pattern
- Call sites of `agent_backend`: `src/lib/features/rag/application/rag_actions.ts`, handoff action `ai.open_vault_in_agent` (in `src/lib/features/ai/application/ai_actions.ts`), `src/lib/features/rag/ui/rag_mode_toggle.svelte` (disabled-tooltip logic)

## File Scope

- `src-tauri/src/features/ai/agent_stream.rs` (becomes generic harness driver)
- `src-tauri/src/features/ai/harness/mod.rs`, `src-tauri/src/features/ai/harness/claude_adapter.rs` (NEW)
- `src-tauri/src/features/ai/mod.rs`
- `src-tauri/tests/agent_stream.rs` (move/keep assertions unchanged)
- `src/lib/shared/types/ai_provider_config.ts`
- `src/lib/features/ai/domain/ai_provider_capabilities.ts`
- `src/lib/features/ai/domain/ai_settings_migration.ts`
- `src/lib/features/ai/application/ai_actions.ts` (call-site updates only)
- `src/lib/features/rag/application/rag_actions.ts` (call-site updates only)
- `src/lib/features/rag/ui/rag_mode_toggle.svelte` (capability check only)
- Provider settings UI file that edits custom providers (find it; dropdown addition only)
- `tests/unit/**` capability/migration tests

Do NOT touch: `native_agent.rs` (TP-003), MCP tools, `agent_runner.ts`, other svelte components.

## Steps

### Step 0: Preflight

- [ ] TP-002 merged; gitignored `src/lib/generated/bindings.ts` + `src-tauri/excalidraw-dist/` present
- [ ] Baseline targeted green: `cargo test --manifest-path src-tauri/Cargo.toml agent_stream`

### Step 1: HarnessAdapter trait + claude extraction (zero-deviation)

- [ ] New `harness/mod.rs`: `pub trait HarnessAdapter` — `spawn_args(prompt, permission_mode, resume_session_id) -> Vec<String>`, `mcp_config_args(port, token) -> Vec<String>` (mechanism differs per CLI), `event_parser() -> impl HarnessEventParser` (or boxed), capability consts `SUPPORTS_RESUME: bool`, `SUPPORTS_PARTIAL_TEXT: bool`
- [ ] `claude_adapter.rs`: move `AgentEventParser` + arg construction VERBATIM from `agent_stream.rs`; `SUPPORTS_RESUME = true`, `SUPPORTS_PARTIAL_TEXT = true`
- [ ] `agent_stream.rs` keeps only the driver: ensure MCP server → write ephemeral config via adapter → spawn via adapter args → parse via adapter parser → emit AgentEvent (logic unchanged, parameterized)
- [ ] ZERO-DEVIATION GATE: every pre-existing arg-construction and parser-fixture test must pass with assertions UNCHANGED (move them with the code)

### Step 2: Capability descriptor (TS)

- [ ] `AiProviderConfig` gains optional `agent?: { kind: "claude_code" | "codex_cli" | "openai_compat" | "text_cli" }`
- [ ] `agent_capability(config)` replaces `agent_backend()`: descriptor present → map (`claude_code`/`codex_cli` → harness w/ adapter id, `openai_compat` → native, `text_cli` → null); descriptor absent → legacy inference (`id === "claude"` → claude_code; `transport.kind === "api"` → openai_compat; else text_cli) so old configs keep working. `codex_cli` resolves to null-with-hint until TP-006 registers the adapter (do not break the toggle: treat as unsupported)
- [ ] Migration in `ai_settings_migration.ts`: stamp descriptors onto saved presets (claude → claude_code; API presets → openai_compat; others → text_cli); migration test like existing ones
- [ ] Update all call sites; provider settings UI gains an "Agent capability" dropdown for custom providers

### Step 3: Testing & Verification

- [ ] Targeted: `cargo test --manifest-path src-tauri/Cargo.toml agent`; `pnpm vitest run tests/unit` capability + migration tests
- [ ] FULL gates (nohup + poll → `.tmpfiles/`): `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test --manifest-path src-tauri/Cargo.toml`; `pnpm format`

### Step 4: Documentation & Delivery

- [ ] Discoveries + migration notes in STATUS.md

## Documentation Requirements

**Must Update:** none
**Check If Affected:** provider settings docs snippet if one exists under `docs/`

## Completion Criteria

- [ ] `id === "claude"` appears NOWHERE in `src/` (grep proves)
- [ ] Zero-deviation gate held; capability resolution data-driven with legacy fallback
- [ ] All gates green

## Git Commit Convention

- `feat(TP-004): complete Step N — description`; extraction commit separate from descriptor commit

## Do NOT

- Change ANY claude flag, parser behavior, or safe/power semantics during extraction (semantic changes are TP-007)
- Implement the codex adapter (TP-006)
- Expand scope — tech debt to `taskplane-tasks/CONTEXT.md`
