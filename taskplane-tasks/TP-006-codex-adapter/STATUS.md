# TP-006 — Codex CLI harness adapter — STATUS

**Branch:** wave-d/tp006 (off integration)
**Codex version:** `codex-cli 0.144.3` (`which codex` → node global shim → native `x86_64-unknown-linux-musl` binary)

## Preflight — flags verified against the REAL binary

All flags below were confirmed by running `codex --help`, `codex exec --help`,
`codex mcp add --help`, and by executing the exact arg vector against the binary
(it reaches `thread.started`/`turn.started` then fails at auth 401 — proving the
argv parses). No flag was assumed.

### Non-interactive exec + JSON events

- `codex exec` — "Run Codex non-interactively".
- `--json` — exec help: "Print events to stdout as JSONL". This is the event stream.
- `--skip-git-repo-check` — exec help: "Allow running Codex outside a Git repository"
  (vaults are not always git repos).

### MCP delivery — EPHEMERAL, never touches `~/.codex/config.toml`

- `-c, --config <key=value>` — exec help: "Override a configuration value that would
  otherwise be loaded from `~/.codex/config.toml`. Use a dotted path … value parsed as
  TOML." Command-line only; writes nothing.
- `--ignore-user-config` — exec help: "Do not load `$CODEX_HOME/config.toml`; auth still
  uses `CODEX_HOME`." This is our analog of claude's `--strict-mcp-config`: the user's
  MCP servers/settings are NOT inherited; only our injected `carbide` server is present.
  Auth (login) is preserved.
- HTTP MCP config shape confirmed by `codex mcp add carbide --url … --bearer-token-env-var …`
  writing (to a TEMP `CODEX_HOME`, never the user's):
  ```toml
  [mcp_servers.carbide]
  url = "http://127.0.0.1:3457/mcp"
  bearer_token_env_var = "CARBIDE_MCP_TOKEN"
  ```
  `codex mcp get` reported `transport: streamable_http` — HTTP MCP is native in 0.144.3
  (no `experimental_use_rmcp_client` feature flag needed; grep of the binary found none).
- Injection verified purely via `-c` against a fresh empty `CODEX_HOME`:
  `codex mcp list -c 'mcp_servers.carbide.url="…"' -c 'mcp_servers.carbide.bearer_token_env_var="CARBIDE_MCP_TOKEN"' -c 'mcp_servers.carbide.enabled_tools=["read_note","search_notes"]'`
  → listed the carbide server with `enabled_tools: read_note, search_notes`.
- **Bearer token is delivered via the `CARBIDE_MCP_TOKEN` env var (set on the child
  process), NOT via argv** — codex reads it through `bearer_token_env_var`. The secret
  never appears in `ps`/argv.

### Safe vs power (routed through `harness::selector_allow_list`)

- `-s, --sandbox <read-only|workspace-write|danger-full-access>` — exec help confirmed.
- **Safe** (`ToolSelector::ReadOnly`/`Only` → `selector_allow_list` returns `Some`):
  `--sandbox read-only` (codex's own shell/FS are read-only) **plus**
  `-c mcp_servers.carbide.enabled_tools=[<non-mutating tool names>]`. The tool allowlist
  is REQUIRED: MCP calls travel over HTTP to carbide and bypass the OS sandbox, so
  read-only sandbox alone would NOT stop a mutating MCP call. The allowlist is derived by
  calling `selector_allow_list` and stripping the `mcp__carbide__` prefix (per-server
  `enabled_tools` uses bare tool names). Safe-mode logic is NOT reimplemented — it inherits
  the TP-007 non-mutating parity fix.
- **Power** (`ToolSelector::Full` → `selector_allow_list` returns `None`):
  `--sandbox workspace-write` (writes within the vault cwd auto-accepted; escalations
  outside the workspace auto-denied). No `--dangerously-bypass-*` (that removes all
  sandboxing — not used). All carbide tools available (no `enabled_tools` filter).

### Prompt / cwd

- Prompt passed as the trailing positional after `--` (`… -- "<prompt>"`) so a prompt
  starting with `-` can't be misparsed. `--` end-of-options verified accepted.
- cwd is set to the vault by the driver (`Command::current_dir`), which codex uses as its
  working root — no `-C/--cd` needed.

### Session resume — NOT supported (`SUPPORTS_RESUME = false`)

- Codex resume is a subcommand (`codex exec resume <id> [PROMPT]`), a different arg shape
  from claude's `--resume <id>` flag, and cannot be live-verified without a model.
  Per the PROMPT ("if resume unsupported: false — runner already handles fresh turns"),
  the adapter sets `SUPPORTS_RESUME = false` and ignores `resume_session_id`.
  Implementing the resume subcommand is logged as follow-up.

### Partial text — NOT streamed (`SUPPORTS_PARTIAL_TEXT = false`)

- `codex exec --json` emits complete thread items (`item.completed` with full
  `agent_message.text`), not token deltas. Text is emitted per completed message.

## Event schema (captured from the real binary)

Envelope confirmed by a live `codex exec --json` run (failed at auth, but the event
frames are real) and by string-extracting the native binary:

- `{"type":"thread.started","thread_id":"…"}` → `AgentEvent::Init { session_id }`
- `{"type":"turn.started"}` → ignored
- `{"type":"turn.completed","usage":{…}}` → `Done` (stats: num_turns=1, others 0 —
  codex's usage tokens don't map to `AgentRunStats{duration_ms,num_turns,total_cost_usd}`)
- `{"type":"turn.failed","error":{"message":"…"}}` / `thread.failed` → `Error`
- `{"type":"item.started","item":{…}}` → `ToolStart` for tool items
- `{"type":"item.completed","item":{…}}` → `Text`/`Reasoning`/`ToolEnd` by `item.type`
- top-level `{"type":"error","message":"Reconnecting…"}` → IGNORED (transient reconnect
  noise; treating it as terminal would abort the turn — the runner ends on the first
  `error`). Terminal failure is `turn.failed` only.

Item types (confirmed present in the binary): `agent_message`, `reasoning`,
`command_execution`, `file_change`, `mcp_tool_call`, `web_search`, `error`. Fields used:
`agent_message.text`, `reasoning.text`, `mcp_tool_call.invocation.{tool,arguments}`,
`command_execution.{command,exit_code}`, `*.status` (`completed|failed|in_progress`).

## Deviations / notes

- Trait method changed from `spawn_args(…mcp_config_path…) -> Vec<String>` to
  `build_invocation(…endpoint: &McpEndpoint…) -> Result<AgentInvocation{args,env}>` — codex
  needs `(port, token)` + an env var, not a JSON config path. Claude's `build_agent_args`
  arg LOGIC is unchanged (verbatim); its adapter just wraps it and writes its JSON config
  inside `build_invocation`. This is the per-CLI MCP-config mechanism TP-004 deferred.
- Dispatch: `AgentRunSpec` gained `adapter: Option<String>` (serde default). The harness
  driver selects codex on `Some("codex")`, else claude. TS sets it from
  `agent_capability(provider_config).adapter` in `agent_tauri_adapter.ts`.

## Live smoke — REQUIRED FOLLOW-UP

The event schema and args are verified against the binary, but no successful model turn
was run (no auth / would cost money / outward-facing). Live smoke needed:
codex safe + power + abort, verifying real `agent_message`/`mcp_tool_call`/`command_execution`
item shapes and that safe-mode `enabled_tools` truly blocks mutating MCP calls end-to-end.

## `~/.codex/config.toml`

NEVER read, written, or modified. All probing used throwaway `CODEX_HOME` dirs under
`.tmpfiles/` (mktemp). Runtime injection is argv `-c` + env var only.
