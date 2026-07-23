# Task: TP-006 — Codex CLI harness adapter

**Created:** 2026-07-23
**Size:** L

## Review Level: 2 (Plan and Code)

**Assessment:** First second-cli adapter proving the HarnessAdapter seam; touches MCP bearer-token delivery (ephemeral config); CLI flag drift risk mitigated by verify-against-binary discipline.
**Score:** 4/8 — Blast radius: 1, Pattern novelty: 2, Security: 1 (MCP token in generated config), Reversibility: 0

## Canonical Task Folder

```
taskplane-tasks/TP-006-codex-adapter/
├── PROMPT.md
├── STATUS.md
├── .reviews/
└── .DONE
```

## Mission

Add a second `HarnessAdapter` implementation for the Codex CLI (`codex`), proving the seam is real. Codex runs its own agent loop; Carbide supplies the vault tools via MCP and normalizes Codex's JSONL event stream into `AgentEvent`. Same safety contract as the claude adapter: safe mode = only Carbide MCP read tools auto-approved + no shell/file writes; power = auto-accept edits with vault cwd. NEVER mutate the user's `~/.codex/config.toml` — config injection must be ephemeral (command-line `-c key=value` overrides or a generated config in a temp location), mirroring the claude adapter's `--mcp-config` + `--strict-mcp-config` principle.

## Dependencies

- **Task:** TP-004 (`HarnessAdapter` trait + claude reference impl must exist)

## Context to Read First

- `AGENTS.md`, `docs/architecture.md`
- `src-tauri/src/features/ai/harness/mod.rs` — the trait (post-TP-004)
- `src-tauri/src/features/ai/harness/claude_adapter.rs` — reference impl (arg styles, parser shape, capability consts)
- `src-tauri/src/features/ai/agent_stream.rs` — generic harness driver (post-TP-004): how adapters are selected from `AgentRunSpec`/provider config
- `src-tauri/src/features/mcp/setup.rs` + `src-tauri/src/features/mcp/http.rs` — ephemeral config writer, port/token source
- `src/lib/features/ai/domain/ai_provider_capabilities.ts` — `codex_cli` currently resolves to null-with-hint (TP-004); make it resolve to harness w/ adapter id `"codex"`

## File Scope

- `src-tauri/src/features/ai/harness/codex_adapter.rs` (NEW)
- `src-tauri/src/features/ai/harness/mod.rs` (registration only)
- `src-tauri/src/features/ai/agent_stream.rs` (adapter selection only)
- `src-tauri/tests/agent_stream.rs` or new `src-tauri/tests/codex_adapter.rs`
- `src/lib/features/ai/domain/ai_provider_capabilities.ts` (resolve codex_cli → harness)
- `src/lib/shared/types/ai_provider_config.ts` (only if a codex preset is added)
- `tests/unit/**` capability tests

Do NOT touch: `native_agent.rs`, claude adapter logic, UI components, `agent_runner.ts`, MCP tools.

## Steps

### Step 0: Preflight — verify against the REAL binary (zero-trust on flags)

- [ ] `which codex && codex --version`; record exact version in STATUS.md. If absent: fixtures-only implementation, mark live smoke as REQUIRED-FOLLOWUP in STATUS.md, and make every flag assumption explicit in tests
- [ ] `codex exec --help` (or `codex --help`): determine non-interactive exec mode, JSON/event output flag, MCP config mechanism (`-c` overrides vs config file), session resume flag, permission/auto-approve flags. Record findings + chosen flags in STATUS.md with the help-text evidence
- [ ] TP-004 merged; gitignored `src/lib/generated/bindings.ts` + `src-tauri/excalidraw-dist/` present

### Step 1: Adapter impl

- [ ] `codex_adapter.rs` implementing `HarnessAdapter`: spawn args per permission mode; MCP delivery via ephemeral config ONLY (assert in tests: no path under user HOME config is written; temp files cleaned up)
- [ ] Parser: Codex JSONL events → `AgentEvent` (init/text/tool_start/tool_end/done/error), incl. tool name + input summary (~200 chars, matching claude contract) and ok flag on tool_end
- [ ] Capability consts: set `SUPPORTS_RESUME`/`SUPPORTS_PARTIAL_TEXT` from Step 0 evidence (if resume unsupported: `false` — runner already handles fresh turns; TP-003 history replay covers context)
- [ ] Driver: select adapter by spec/config adapter id (`"claude" | "codex"`)

### Step 2: TS resolution

- [ ] `codex_cli` descriptor resolves to `{ backend: "harness", adapter: "codex" }`; toggle enabled
- [ ] Codex provider preset (if none exists, add one mirroring the claude preset shape, command `codex`, install_url https://github.com/openai/codex)

### Step 3: BDD scenario 6 tests

- [ ] Arg construction per permission mode asserted exactly
- [ ] JSONL fixtures → AgentEvent parity with claude fixtures for all six variants
- [ ] Ephemeral-config test: user config untouched; temp artifacts removed
- [ ] `cargo test specta_export` if any specta-visible type changed

### Step 4: Testing & Verification

- [ ] Targeted cargo tests green
- [ ] FULL gates (nohup + poll → `.tmpfiles/`): `pnpm check`, `pnpm lint`, `pnpm test`, `cargo test --manifest-path src-tauri/Cargo.toml`; `pnpm format`

### Step 5: Documentation & Delivery

- [ ] STATUS.md: codex version, verified flags + help-text evidence, deviations, live-smoke follow-ups

## Documentation Requirements

**Must Update:** none
**Check If Affected:** provider/agent docs under `docs/` if present

## Completion Criteria

- [ ] Two harness adapters behind the trait; codex selectable via descriptor
- [ ] Fixtures + arg tests green; ephemeral config proven
- [ ] All gates green

## Git Commit Convention

- `feat(TP-006): complete Step N — description`; fixtures `test(TP-006): …`

## Do NOT

- Touch user config files; weaken safe mode; change the claude adapter
- Add Anthropic-native or other non-OpenAI wire formats
- Expand scope — tech debt to `taskplane-tasks/CONTEXT.md`
