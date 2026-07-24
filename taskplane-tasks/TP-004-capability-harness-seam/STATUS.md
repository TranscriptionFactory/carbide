# TP-004 — Status

**State:** Complete (both steps committed on `wave-b/tp004`). NOT merged — orchestrator handles merge + full-suite integration gates.

## Commits

- Step 1 — `feat(TP-004): complete Step 1 — extract claude harness behind HarnessAdapter trait`
- Step 2 — `feat(TP-004): complete Step 2 — data-driven agent capability descriptors`

## What landed

### Step 1: HarnessAdapter seam (Rust, zero-deviation)

- New `src-tauri/src/features/ai/harness/mod.rs`:
  - `trait HarnessEventParser: Send` — `parse_line(&mut self, &str) -> Vec<AgentEvent>`, `saw_result(&self) -> bool` (object-safe; boxed).
  - `trait HarnessAdapter` — consts `SUPPORTS_RESUME`, `SUPPORTS_PARTIAL_TEXT`; `spawn_args(&self, prompt, mcp_config_path, permission_mode, resume_session_id) -> Vec<String>`; `new_parser(&self) -> Box<dyn HarnessEventParser>`.
- New `src-tauri/src/features/ai/harness/claude_adapter.rs`: `AgentEventParser`, `build_agent_args`, helpers moved **verbatim**; `struct ClaudeAdapter` impls the trait (`SUPPORTS_RESUME = true`, `SUPPORTS_PARTIAL_TEXT = true`).
- `agent_stream.rs` is now the generic driver: `agent_run_start` builds args via `ClaudeAdapter::spawn_args` and threads `adapter.new_parser()` into `run_agent_cli`, which now takes `Box<dyn HarnessEventParser>` and calls `parser.saw_result()`.
- **Zero-deviation gate HELD:** every pre-existing arg/parser fixture test passes with assertions unchanged; only the test imports were repointed to `harness::claude_adapter`.
- No claude flag / parser behavior / safe-power semantics changed.

### Step 2: capability descriptors (TS)

- `AiProviderConfig` gains optional `agent?: { kind: "claude_code" | "codex_cli" | "openai_compat" | "text_cli" }`; descriptors baked into all `BUILTIN_PROVIDER_PRESETS`.
- `agent_capability(config)` replaces `agent_backend()`:
  - `claude_code -> { backend: "harness", adapter: "claude" }`, `openai_compat -> { backend: "native" }`, `codex_cli`/`text_cli -> null`.
  - Descriptor-absent configs fall back to `infer_agent_descriptor` (preset-id lookup, else `api -> openai_compat` / `cli -> text_cli`) — no `id === "claude"` anywhere.
  - `codex_cli` intentionally resolves to `null` until TP-006 registers the codex adapter (toggle stays disabled, not broken).
- Migration (`ai_settings_migration.ts`): stamps descriptors onto saved transport-format providers that lack them (reuses `infer_agent_descriptor`); legacy flat-key branch refactored to a command-override map to drop `preset.id === "claude"`.
- Call sites updated: `ai_actions.ts`, `rag_actions.ts`, `rag_panel.svelte`, `index.ts` re-export.
- Provider settings UI (`settings_dialog.svelte`): custom (non-preset) providers get an "Agent" capability dropdown bound to `config.agent.kind`.

## Migration notes (for downstream)

- Fresh presets already carry descriptors; migration only fires when saved
  transport-format providers are missing `agent`. A fully-current config
  (all providers have `agent`) still returns `null` (no-op).
- Custom providers created before this change stamp to `openai_compat` (api) or
  `text_cli` (cli) — matching the pre-existing behavior (api → native, other cli → unsupported).

## Gates (R1 fast, this task)

- `pnpm check`: **0 errors, 0 warnings**.
- `pnpm lint`: layering pass **green**; type-aware oxlint is the pre-existing never-green baseline — no NEW errors in touched source files (only the migration test adds `no-non-null-assertion` entries consistent with that file's existing `result!.` idiom).
- `cargo test … agent`: **all pass**, incl. every moved arg/parser fixture test (zero-deviation).
- Targeted vitest (capability + migration + toggle + 2 action suites): **40/40 pass**.
- `pnpm format`: applied to touched files only (reformatted `rag_panel.svelte`; no repo-wide churn).

## Deferred / tech-debt

Logged in `taskplane-tasks/CONTEXT.md` (Technical Debt / Future Work): omitted
`mcp_config_args` seam (deferred to TP-006), unread capability consts, `adapter`
id not yet plumbed into `AgentRunSpec`, and the `rag_mode_toggle` → `rag_panel`
call-site relocation.
