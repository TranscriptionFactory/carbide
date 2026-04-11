# Unified Implementation Roadmap (Refresh)

**Date:** 2026-04-11
**Status:** Active — supersedes `2026-04-05_unified_implementation_roadmap.md`
**Companion:** `2026-04-05_conversation_work_units.md` (completed units remain there for history)
**Progress:** 44 / 56 units complete (34 original + A1.1, A2.1, A2.2, A2.3, A3.1, A3.2, A3.3, B1.1, B1.2, B2.1); 12 remaining

---

## Completed Work Summary

| Orig Step | Description | Date Range | Key Commits |
|---|---|---|---|
| 1 | MCP Stdio Server + Tier 1 Tools | 2026-04-05 | `fc6decde`–`23335416` |
| 2 | Headings Tauri Command | 2026-04-05 | `87c9c9d1` |
| 3 | Metadata Foundations (type inference, frontmatter writer, property enum) | 2026-04-05 | `f3203b48`–`1c6ba082` |
| 4 | Backend Enrichment (ctime_ms, note_links population) | 2026-04-05 | `917c541e`–`92d11f26` |
| 5 | Smart Linking Phase 1 (metadata rules, config, UI) | 2026-04-05 | `e7d91629`–`6a917bbe` |
| 6 | Smart Linking Phase 2 (semantic rules, scoring) | 2026-04-05 | `4ba5ba3f`–`9b53fecd` |
| 7 | HTTP Server + CLI Binary | 2026-04-05 | `5d150d0e`–`efdef9e2` |
| 8 | Auto-Setup + Shell Integration | 2026-04-05 | `622ce574`–`322c365a` |
| 9 | Composite getFileCache | 2026-04-05 | `ce1461da` |
| 11 | Block Embeddings + Block KNN | 2026-04-06 | `bfbd9e11` + `c3cfeb29` (HNSW) |
| 12 | Extended MCP/CLI Tools (on branch, not main) | 2026-04-06 | `27247865`–`6bc50243` |
| 13 | Editor Drag Handles | 2026-04-06 | `b94e52cf`–`f15b2221` |
| A1.1 | Editor Width Token Refactor | 2026-04-11 | `14788ee2` |
| A2.1 | RPC hardening (timeouts, rate limiting, error budget) | 2026-04-11 | `72daa535` |
| A2.2 | Richer settings schema (textarea, min/max, placeholder) | 2026-04-11 | `b5328d64` |

**Out-of-band work merged to main:** MCP streamable HTTP transport, CLI sidecar install, CLI glow rendering, block embedding HNSW optimization, drag handle refinements, STT removal, tool status cards.

---

## Branch Strategy

### Stale branches (DO NOT rebase or merge)

| Branch | Commits vs main | Disposition |
|---|---|---|
| `feat/plugin-hardening` | 6 commits (merge-base `bba85e1e`) | Hand-port useful work → archive |
| `feat/extended-tools` | 26 commits (child of plugin-hardening) | Hand-port useful work → archive |

### Hand-port triage

| Commits | Content | Action |
|---|---|---|
| `1f04cd0b` (10.1) | Activation events + lazy loading | **Port `vault_contains` only if decided (see Decisions)** |
| `0b4817a3` (10.2) | Lifecycle hooks, RPC timeouts, rate limiting, error budget | **Hand-port safety logic only** (timeouts, rate limiting, consecutive-error budget) |
| `b8edde58` (10.3) | textarea type, min/max, placeholder in settings | **Hand-port in full** (do not cherry-pick) |
| `27247865` (12.1) | MCP Tier 2 tools | **Hand-port** |
| `63b8bcb9` (12.2) | MCP Tier 3 tools + plugin MCP bridge | **Hand-port** |
| `3d0179b1` (12.3) | CLI git + reference commands | **Hand-port** |
| `48f0017c` (12.4) | CLI bases, tasks, dev commands | **Hand-port** |
| `6bc50243` (12.5) | Slash command contribution point | **Hand-port** |
| `3d061841`, `f7aedc3c` | Block embeddings + similarity rule | **DROP** — already on main |
| `968750c9` | Autostart workaround | **DROP** — stale, stdio removed |
| `0874184f`, 4× checkpoint, 6× chore | Cargo lock, WIP, bookmarks | **DROP** |

---

## Remaining Work

### Phase A: Standalone Fixes (no deps on unmerged work, parallel-safe)

#### Step A1: Editor Width Token Refactor

**Source:** `carbide/plans/editor-width-token-refactor.md`
**Branch:** `fix/editor-width-tokens`
**Session type:** CSS/Svelte
**Depends on:** nothing

Expose `--source-editor-max-width` as CSS var in CodeMirror; standardize `--editor-max-width` in remaining themes; fix zen mode hardcoded width.

**Status:** DONE — completed 2026-04-11 (`14788ee2`, branch `fix/editor-width-tokens`)

**Current state verified 2026-04-11:**
- `--editor-max-width` defined globally in `editor.css` as `min(85ch, 90%)`
- `--source-editor-max-width` does NOT exist anywhere
- Source editor hardcodes `maxWidth: "48rem"` in `source_editor_theme.ts:21`
- Zen mode hardcodes `72ch` in `workspace_layout.svelte:1066`
- theater/spotlight themes hardcode max-width instead of using the token
- monolith (`72ch`), command-deck (`95ch`), zen-deck (`100ch` as `--zen-max-width`) already use tokens

---

#### Step A2: Plugin Hardening — Safety Hand-Port

**Source:** `carbide/2026-04-10_plugin_hardening_safe_selective_merge_plan.md`
**Branch:** `feat/plugin-hardening-safe`
**Session type:** TypeScript + Svelte
**Depends on:** nothing

**Status:** DONE — A2.1 (`72daa535`), A2.2 (`b5328d64`), A2.3 (`3bbc49e8`) completed 2026-04-11.

**Current state verified 2026-04-11:**
- `PluginErrorTracker` has burst-based thresholds (5 errors in 15s → auto-disable, 2 in 5s → warn) but NO consecutive-error budget and NO `record_success()`
- No RPC timeout wrapper exists
- No RPC rate limiter exists
- `src/lib/features/plugin/domain/` directory does NOT exist (must be created)
- `src/lib/components/ui/textarea/` does NOT exist (must be created)
- `PluginSettingSchema.type` supports `"string" | "number" | "boolean" | "select"` — no `"textarea"`
- No `min`, `max`, `placeholder` fields on `PluginSettingSchema`
- CSP on sandboxed iframe: `connect-src none` (must remain)

**Do NOT port:** lifecycle protocol rewrite, `on_file_type`, `on_startup_finished`, `SettingChangedCallback`

---

#### Step A3: Plugin AI + Network RPC

**Source:** New work — `carbide/2026-04-10_unified_roadmap_refresh_prompt.md` Phase A item 3
**Branch:** `feat/plugin-ai-network-rpc`
**Session type:** TypeScript + Rust
**Depends on:** nothing (existing `AiService` and `reqwest` are on main)

**Status:** DONE — A3.1 (`df367450`), A3.2 (`c2966610`), A3.3 (`ba2ceef6`) completed 2026-04-11.

**Current state verified 2026-04-11:**
- Plugin RPC handler dispatches 9 namespaces: vault, editor, commands, ui, settings, events, search, diagnostics, metadata
- No `ai.*` or `network.*` namespace exists — unknown namespace throws error
- `AiService.execute()` takes `{ provider_config, prompt, context, mode, timeout_seconds }`, returns `{ success, output, error }`
- `ai_execute_cli` Tauri command exists (only CLI transport implemented; API transport stubbed as unimplemented)
- `pipeline::execute_pipeline()` handles subprocess spawning with timeouts (default 300s), stdin piping, ANSI stripping
- Existing `reqwest` client used in HTTP server and CLI — available for `network.fetch`
- Sandboxed iframe CSP is `connect-src none` — plugins CANNOT make network requests directly (by design; `network.fetch` goes through host-side proxy)

---

**Review gate A:** Plugin tests pass, existing lifecycle SDK behavior intact, editor width tokens work, AI and network RPC respond correctly with permission checks. `pnpm check && pnpm lint && pnpm test && cargo check` green.

---

### Phase B: Extended Tools Hand-Port (depends on Phase A for plugin infra)

#### Step B1: MCP Tier 2/3 Tools + Plugin MCP Bridge

**Source:** Hand-port from `27247865`, `63b8bcb9`
**Branch:** `feat/mcp-extended-tools`
**Session type:** Rust + TypeScript
**Depends on:** Phase A complete (plugin infra stable), main's MCP HTTP transport + shared_ops

- Tier 2: backlinks, outlinks, properties, references tool handlers
- Tier 3: git_status, git_log, rename_note tool handlers
- Plugin MCP bridge: `mcp.*` RPC namespace (list_tools, call_tool, register_tool)

---

#### Step B2: CLI Extended Commands

**Source:** Hand-port from `3d0179b1`, `48f0017c`
**Branch:** `feat/cli-extended-commands`
**Session type:** Rust
**Depends on:** main's CLI sidecar

- git + reference CLI subcommands + backend routes
- bases, tasks, dev CLI subcommands + backend routes

---

#### Step B3: Slash Command Contribution Point

**Source:** Hand-port from `6bc50243`
**Branch:** `feat/plugin-slash-commands`
**Session type:** TypeScript + Svelte
**Depends on:** Step B1 (plugin MCP bridge)

- Plugin-contributed slash commands via manifest `contributes.slash_commands`
- ProseMirror `/` menu integration

---

**Review gate B:** All MCP tools respond correctly, CLI subcommands work, slash commands from plugins render. `pnpm check && pnpm lint && pnpm test && cargo check` green.

---

### Phase C: Metadata Events (independent of Phase B)

#### Step C1: Metadata Change Events + Plugin Bridge

**Source:** `carbide/2026-04-05_plan_metadata_api_surface.md` Phase C1
**Branch:** `feat/metadata-events`
**Session type:** Rust + TypeScript
**Depends on:** Steps 4, 9 (on main — ctime, note_links, getFileCache all merged)

**Current state verified 2026-04-11:** No metadata event emission exists in `db.rs`. No `emit_all` or event dispatch on upsert/rename/delete.

- `db.rs` must emit typed change events when metadata is updated (upsert, rename, delete)
- Plugin bridge must forward these to subscribed plugins via `events.on("metadata-changed", cb)`
- Phase C2 (`listTags` alias as `metadata.listTags()`) remains low priority — defer

---

**Review gate C:** Metadata change events fire correctly, plugin bridge delivers them to subscribed plugins. `pnpm check && pnpm lint && pnpm test && cargo check` green.

---

### Phase D: New Feature Work (depends on Phases A–C)

#### Step D1: Graph Visualization

**Source:** `carbide/2026-04-02_smart_linking_and_block_notes.md` Phase 5
**Branch:** `feat/graph-smart-links`
**Session type:** Rust + TypeScript + Svelte/D3
**Depends on:** Steps 5–6 (smart links — on main), Step 11 (block embeddings — on main)

- Smart link edges in graph data model (new edge type in Rust graph builder)
- TS graph types extension with provenance metadata
- Rendering: dashed edges, hover provenance, section-level edges

---

#### Step D2: Power Features

**Source:** `carbide/mcp_native_gaps_plan.md` Phase 7 + `carbide/2026-04-05_plan_metadata_api_surface.md` 3d-3e
**Branch:** per-feature branches
**Session type:** Mixed
**Depends on:** all prior

- Bulk property rename/delete (Tauri command + frontmatter writer + UI + git checkpoint)
- Nested property flattening (dot notation `author.name`)
- Plugin SDK package (`@carbide/plugin-types`, `create-carbide-plugin`)
- CLI TUI mode (ratatui/rustyline)

---

**Review gate D:** Graph renders correctly with smart link edges. Bulk property ops work end-to-end. `pnpm check && pnpm lint && pnpm test && cargo check` green.

---

### Phase E: Cleanup

#### Step E1: Archive Stale Branches

**Depends on:** All hand-port work verified on main

```
git branch -m feat/plugin-hardening archive/feat/plugin-hardening
git branch -m feat/extended-tools archive/feat/extended-tools
git push origin archive/feat/plugin-hardening archive/feat/extended-tools
git push origin --delete feat/plugin-hardening feat/extended-tools
```

---

## Dependency Graph

```
Phase A (parallel — no interdependencies)
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  A1 (editor width tokens)     [CSS/Svelte, ~1hr]        │
│                                                          │
│  A2 (plugin hardening)        [TS, ~4hrs]                │
│     ├─ A2.1 RPC hardening (timeouts, rate limit, errs)   │
│     ├─ A2.2 Richer settings schema                       │
│     └─ A2.3 Docs + vault_contains decision               │
│                                                          │
│  A3 (plugin AI + network RPC) [TS+Rust, ~6hrs]           │
│     ├─ A3.1 network.fetch RPC (Rust reqwest proxy)       │
│     ├─ A3.2 ai.execute RPC (bridge to AiService)         │
│     └─ A3.3 SDK surface + docs                           │
│                                                          │
└──────────────────── Review Gate A ───────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
Phase B (sequential)   Phase C          Phase E
┌─────────────────┐  ┌──────────┐     (after all
│ B1 MCP Tier 2/3 │  │ C1 Meta  │      hand-ports)
│ + MCP bridge    │  │ events + │
│      │          │  │ plugin   │
│      ▼          │  │ bridge   │
│ B2 CLI extended │  └──────────┘
│      │          │
│      ▼          │
│ B3 Slash cmds   │
│ (needs B1)      │
└────────┬────────┘
         │
         ▼
    Review Gate B ◄─── Review Gate C
         │
         ▼
Phase D
┌─────────────────┐
│ D1 Graph viz    │
│      │          │
│      ▼          │
│ D2 Power feats  │
└────────┬────────┘
         │
         ▼
    Review Gate D
         │
         ▼
Phase E: Archive branches
```

**Parallelization notes:**
- A1, A2, A3 are fully independent — can run concurrently
- B and C are independent of each other — can run concurrently after A
- B1 → B2 → B3 are sequential (B3 depends on B1's MCP bridge)
- D1 and D2 are sequential (D2 depends on all prior)

---

## Conversation-Sized Work Units

### Phase A Units

#### A1: Editor Width Token Refactor

- [x] **A1.1** Standardize `--editor-max-width` + expose `--source-editor-max-width` — **CSS/Svelte session**
  - `activeForm`: "Refactoring editor width tokens"
  - Files: `src/styles/editor.css`, `src/styles/theme-theater.css`, `src/styles/theme-spotlight.css`, `src/styles/theme-zen-deck.css`, `src/lib/features/editor/ui/source_editor_theme.ts`, `src/lib/app/bootstrap/ui/workspace_layout.svelte`
  - Add `--source-editor-max-width: 48rem` default to `:root` in `editor.css`
  - Change `source_editor_theme.ts` `.cm-content` maxWidth to `var(--source-editor-max-width, 48rem)`
  - Replace hardcoded max-widths in theater (`120ch`) and spotlight (`80ch`) with `var(--editor-max-width)` + theme-level default
  - Rename zen-deck `--zen-max-width` to `--editor-max-width`
  - Fix zen mode in `workspace_layout.svelte` to use `var(--editor-max-width)` instead of hardcoded `72ch`
  - Tests: visual verification only (no unit tests — pure CSS)
  - _Completed 2026-04-11 `14788ee2`. Added `--source-editor-max-width: 48rem` to `:root` in editor.css. Theater and spotlight both had 80ch hardcoded (plan said 120ch for theater but code was 80ch) — replaced with `var(--editor-max-width)` and added theme-level `--editor-max-width` defaults. Renamed zen-deck `--zen-max-width` to `--editor-max-width`. Source editor uses `var(--source-editor-max-width, 48rem)`. Zen mode in workspace_layout.svelte uses `var(--editor-max-width, 72ch)` fallback. All themes visually identical — tokens enable user override via `token_overrides`._

---

#### A2: Plugin Hardening — Safety Hand-Port

- [x] **A2.1** RPC hardening — timeouts + rate limiting + error budget — **TypeScript session**
  - `activeForm`: "Implementing RPC timeouts and rate limiting"
  - Create `src/lib/features/plugin/domain/` directory
  - Create `src/lib/features/plugin/domain/rpc_timeout.ts`: `RpcTimeoutError`, `get_rpc_timeout(method)` (5s default, 30s for FS), `with_timeout(promise, method, timeout_ms?)`
  - Create `src/lib/features/plugin/domain/rate_limiter.ts`: `PluginRateLimiter` — sliding window, 100 calls/min per plugin
  - Strengthen `plugin_error_tracker.ts`: add `consecutive_errors` map, `record_success(plugin_id)`, auto-disable threshold (10 consecutive)
  - Update `plugin_service.ts` `handle_rpc()`: rate-limit check → timeout wrapper → record_success on non-error
  - Add `rate_limiter.clear_all()` in `PluginService.clear_active_vault()`
  - Tests: `tests/unit/domain/rpc_timeout.test.ts`, `tests/unit/domain/rate_limiter.test.ts`, `tests/unit/services/plugin_service_hardening.test.ts`, update `tests/unit/services/plugin_error_tracker.test.ts`
  - _Completed 2026-04-11 `72daa535`. Created `domain/rpc_timeout.ts` (RpcTimeoutError, get_rpc_timeout, with_timeout) and `domain/rate_limiter.ts` (PluginRateLimiter with sliding window). Extended PluginErrorTracker with consecutive_errors map, record_success(), get_consecutive_errors(), and 10-consecutive auto-disable threshold. Updated handle_rpc() flow: rate-limit check → timeout wrapper → record_success on non-error. Rate limiter resets on unload_plugin() and clear_active_vault(). 4 test files covering all behaviors. Pre-existing lint (build_command_context layering) and check (linked_source_utils types) failures unchanged._

- [x] **A2.2** Richer settings schema — **Svelte/UI session**
  - `activeForm`: "Adding textarea and placeholder support to plugin settings"
  - Extend `PluginSettingSchema` in `ports.ts`: `type: "textarea"`, `min?: number`, `max?: number`, `placeholder?: string`
  - Create `src/lib/components/ui/textarea/textarea.svelte` + `index.ts` (shadcn-style)
  - Update `plugin_settings_dialog.svelte`: render textarea, clamp numeric to min/max, pass placeholders
  - Tests: `tests/unit/features/plugin/ui/plugin_settings_dialog.test.ts`
  - _Completed 2026-04-11 `b5328d64`. Hand-ported from b8edde58. Extended PluginSettingSchema with textarea type, placeholder, min, max. Created shadcn-style Textarea component. Updated plugin_settings_dialog with textarea rendering (full-width layout), min/max clamping via clamp_number(), and placeholder passthrough on string/number/textarea inputs. Updated plugin_rpc_handler read_setting_type to accept "textarea" and read_setting_schema to parse placeholder/min/max. Added textarea test stub. 4 new tests. Pre-existing tauri-pty resolution failure in test collection unchanged._

- [x] **A2.3** Documentation + vault_contains decision — **Docs session**
  - `activeForm`: "Updating plugin hardening docs"
  - Update `docs/plugin_howto.md` — mention RPC timeout behavior, rate limiting, richer settings fields
  - Decide on `vault_contains` (see Decisions section)
  - _Completed 2026-04-11 `3bbc49e8`. Updated plugin_howto.md: added RPC timeout docs (5s default, 30s for vault ops), rate limiting docs (100 calls/min sliding window), expanded error auto-disable to cover both burst-based and consecutive-error budget. Added textarea/min/max/placeholder to manifest example and settings tip. Decided to defer vault_contains — no concrete plugin needs it. A2 step fully complete._

---

#### A3: Plugin AI + Network RPC

- [x] **A3.1** `network.fetch` RPC namespace — **Rust + TypeScript session**
  - `activeForm`: "Implementing network.fetch RPC for plugins"
  - Rust: new `plugin_http_fetch` Tauri command in `src-tauri/src/features/plugin/` (or extend `mcp/cli_routes.rs`)
    - Uses existing `reqwest` client
    - SSRF protection: block localhost/private IPs (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fe80::/10`) before request fires
    - Request size limit (1MB body), response size limit (10MB)
    - Per-plugin rate limiting (reuse `PluginRateLimiter` from A2.1)
  - TypeScript: new `PluginRpcNetworkBackend` interface in `plugin_rpc_handler.ts`
    - `network.fetch` case in dispatch — requires `network:fetch` permission
    - Manifest `allowed_origins` allowlist checked before forwarding to Rust
  - SDK: `carbide.network.fetch(url, opts)` in `carbide_plugin_api.js`
  - Tests: SSRF blocking, allowlist enforcement, rate limiting, success path
  - _Completed 2026-04-11 `df367450`. Created `http_fetch.rs` with SSRF guard (blocks private IPs, localhost, .local/.internal, DNS rebinding via resolve_and_check). Added PluginRpcNetworkBackend to RPC handler with network.fetch dispatch, origin allowlist enforcement from manifest allowed_origins, and network:fetch permission check. Added allowed_origins to PluginManifest in both Rust and TS. Created plugin_network_tauri_adapter.ts. SDK surface: carbide.network.fetch(url, opts). 9 TS tests + 7 Rust unit tests. Per-plugin rate limiting already covered by existing PluginRateLimiter in handle_rpc flow. Pre-existing lint/check failures unchanged._

- [x] **A3.2** `ai.execute` RPC namespace — **TypeScript session**
  - `activeForm`: "Implementing ai.execute RPC for plugins"
  - New `PluginRpcAiBackend` interface in `plugin_rpc_handler.ts`
  - `ai.execute` case in dispatch — requires `ai:execute` permission
  - Invokes `AiService.execute()` (existing) → through `AiPort` → `ai_execute_cli` Tauri command
  - Returns `{ output: string, success: boolean, error: string | null }` — no streaming
  - Uses default provider config from `AiSettingsStore`
  - Tests: permission check, execution success/failure, provider not configured error
  - _Completed 2026-04-11 `c2966610`. Added PluginRpcAiBackend type and handle_ai method in plugin_rpc_handler.ts. ai.execute dispatches with ai:execute permission check, validates prompt (required) and mode (optional, defaults to "ask"). Wired AI backend in create_app_context.ts: reads ai_providers and ai_default_provider_id from editor_settings, bridges to AiService.execute() with open note context. Added carbide.ai.execute(opts) to SDK. 9 tests covering permission check, mode validation, prompt validation, backend not initialized, success/failure propagation. Pre-existing lint/check failures unchanged._

- [x] **A3.3** SDK surface + docs — **Docs session**
  - `activeForm`: "Adding AI and network SDK docs"
  - Update `carbide_plugin_api.js`: add `carbide.network.fetch(url, opts)` and `carbide.ai.execute({ prompt, mode? })`
  - Update `docs/plugin_howto.md`: AI and network namespace docs, permission requirements
  - Update manifest schema docs: `network:fetch`, `ai:execute` permissions, `allowed_origins`
  - _Completed 2026-04-11 `ba2ceef6`. SDK already added in A3.1/A3.2. Updated plugin_howto.md: added network:fetch and ai:execute to permissions table, added allowed_origins to optional manifest fields and example, added network.* and ai.* RPC reference sections with restrictions/limitations, added SDK examples, fixed stale "not yet implemented" note. Phase A now fully complete._

---

### Phase B Units

#### B1: MCP Tier 2/3 + Plugin MCP Bridge

- [x] **B1.1** MCP Tier 2 tools — **Rust session**
  - `activeForm`: "Hand-porting MCP Tier 2 tools"
  - Hand-port from `27247865`: backlinks, outlinks, properties, references tool handlers
  - Register in `router.rs`, add tool definitions
  - Tests: tool dispatch for each new handler
  - _Completed 2026-04-11 `96e5ec92`. Hand-ported 6 tools in 2 new modules: graph.rs (get_backlinks, get_outgoing_links, list_properties, query_notes_by_property) and references.rs (list_references, search_references). Used shared parse_args/prop from tools/mod.rs instead of local copies from source commit. Registered in router.rs dispatch chain. 13 tests covering definitions, schema validation, snake_case naming, descriptions. All cargo check + cargo test clean. Pre-existing lint/check failures unchanged._

- [x] **B1.2** MCP Tier 3 + plugin MCP bridge — **Rust + TypeScript session**
  - `activeForm`: "Hand-porting MCP Tier 3 and plugin MCP bridge"
  - Hand-port from `63b8bcb9`: git_status, git_log, rename_note tool handlers
  - Plugin MCP bridge: `mcp.*` RPC namespace (list_tools, call_tool, register_tool)
  - Tests: git tool responses, plugin tool registration round-trip
  - _Completed 2026-04-11 `f5ac7a5d`. Hand-ported from 63b8bcb9. Created tools/git.rs with 3 MCP tools (git_status, git_log, rename_note) dispatching to existing git/notes services. Made collect_git_log pub(crate). Router extended to 18 total tools. Added mcp_list_tool_definitions and mcp_call_tool Tauri commands in router.rs. Plugin RPC handler gains mcp.* namespace: list_tools (combines native + plugin-registered tools), call_tool (dispatches to Rust router), register_tool (stores TS-side with plugin_id namespace prefix, requires mcp:register permission). McpPort extended with list_tool_definitions/call_tool. Fixed stale tool count assertions (9→18) from B1.1. 17 files changed. 9 Rust tests + 7 TS tests. Pre-existing failures unchanged._

---

#### B2: CLI Extended Commands

- [x] **B2.1** CLI git + reference commands — **Rust session**
  - `activeForm`: "Hand-porting CLI git and reference commands"
  - Hand-port from `3d0179b1`: git + reference CLI subcommands + backend routes
  - Tests: subcommand parsing, route serialization
  - _Completed 2026-04-11 `7318455c`. Hand-ported from 3d0179b1. Created commands/git.rs (8 subcommands: status, commit, log, diff, push, pull, restore, init) and commands/references.rs (list, search, add by DOI, BBT search). Added git_diff_working() to git/service.rs for working tree diff. Added 12 backend routes to cli_routes.rs (/cli/git/*, /cli/references/*). Adapted route handlers to current codebase pattern — auth handled by middleware layer, not per-handler check_auth. Used resolve_vault_root helper and shared_ops::VaultIdArgs where applicable. 9 deserialization tests. 6 files changed. Pre-existing failures unchanged._

- [ ] **B2.2** CLI bases, tasks, dev commands — **Rust session**
  - `activeForm`: "Hand-porting CLI bases/tasks/dev commands"
  - Hand-port from `48f0017c`: bases, tasks, dev subcommands + backend routes
  - Tests: subcommand parsing, route serialization

---

#### B3: Slash Command Contribution Point

- [ ] **B3.1** Slash command contribution point — **TypeScript + Svelte session**
  - `activeForm`: "Hand-porting slash command contribution point"
  - Hand-port from `6bc50243`: manifest `contributes.slash_commands`, ProseMirror `/` menu hook
  - Depends on B1.2 (plugin MCP bridge)
  - Tests: command registration, menu rendering, dispatch

---

### Phase C Units

#### C1: Metadata Events

- [ ] **C1.1** `metadata-changed` event emission — **Rust session**
  - `activeForm`: "Adding metadata change event emission"
  - Extend `db.rs` or `service.rs` to emit Tauri events on upsert/rename/delete
  - Define event payload: `{ event_type: "upsert"|"rename"|"delete", path, old_path? }`
  - Tests: event emission on each mutation type

- [ ] **C1.2** Plugin bridge for metadata events — **TypeScript session**
  - `activeForm`: "Wiring metadata events to plugin bridge"
  - Subscribe to Tauri metadata events in plugin host
  - Forward to iframe via `events.on("metadata-changed", cb)` in plugin SDK
  - Tests: event delivery to subscribed plugin, no delivery without subscription

---

### Phase D Units

#### D1: Graph Visualization

- [ ] **D1.1** Smart link edges in graph data model — **Rust + TypeScript session**
  - `activeForm`: "Adding smart link edges to graph model"
  - Rust graph builder: new edge type for smart links, provenance metadata
  - TS graph types: extend `VaultGraphSnapshot`, `GraphNeighborhoodSnapshot`
  - Tests: graph builder produces smart link edges

- [ ] **D1.2** Graph rendering — dashed edges, hover provenance, section-level edges — **Svelte/D3 session**
  - `activeForm`: "Rendering smart link edges in graph view"
  - Visual differentiation: dashed lines for smart links, solid for explicit
  - Hover tooltip shows rule provenance
  - Block-level edges when embeddings exist
  - Tests: rendering logic, hover state

---

#### D2: Power Features

- [ ] **D2.1** Bulk property rename — **Rust + TypeScript session**
  - `activeForm`: "Implementing bulk property rename"
  - Tauri command, frontmatter writer integration, UI confirmation dialog, git checkpoint
  - Tests: multi-file rename, rollback on error

- [ ] **D2.2** Bulk property delete — **Rust + TypeScript session**
  - `activeForm`: "Implementing bulk property delete"
  - Same pattern as D2.1
  - Tests: multi-file delete, confirmation UI

- [ ] **D2.3** Nested property flattening — **TypeScript session**
  - `activeForm`: "Adding nested property dot notation"
  - `extract_metadata.ts`: dot notation (`author.name`), write-back preserves original YAML structure
  - Tests: extraction, round-trip, edge cases

- [ ] **D2.4** Plugin SDK package — **TypeScript session**
  - `activeForm`: "Creating plugin SDK npm package"
  - `@carbide/plugin-types`, `create-carbide-plugin` template
  - Tests: type checking, template generation

- [ ] **D2.5** CLI TUI mode — **Rust session**
  - `activeForm`: "Building CLI TUI interface"
  - ratatui or rustyline, exploratory — may span multiple conversations
  - Tests: input handling, rendering

---

### Phase E Units

- [ ] **E1.1** Archive stale branches — **Git session**
  - `activeForm`: "Archiving stale feature branches"
  - Rename `feat/plugin-hardening` → `archive/feat/plugin-hardening`
  - Rename `feat/extended-tools` → `archive/feat/extended-tools`
  - Only after all hand-port work verified on main

---

## Batch Table with Review Gates

| Batch | Phase | Units | Est. Sessions | Review Gate |
|---|---|---|---|---|
| **A** | A | ~~A1.1~~, ~~A2.1~~, ~~A2.2~~, ~~A2.3~~, ~~A3.1~~, ~~A3.2~~, ~~A3.3~~ | 7 (7 done) | Plugin tests pass, editor width works, AI + network RPC respond correctly |
| **B** | B | B1.1–B1.2, B2.1–B2.2, B3.1 | 5 | All MCP tools respond, CLI subcommands work, slash commands render |
| **C** | C | C1.1–C1.2 | 2 | Metadata events fire and reach plugins |
| **D** | D | D1.1–D1.2, D2.1–D2.5 | 7 | Graph renders smart links, power features work end-to-end |
| **E** | E | E1.1 | 1 | Branches archived, main clean |
| **Total** | | **22 units** | **~22** | **4 done, 18 remaining** |

---

## Decisions Needed

### 1. `vault_contains` activation event — port now or defer?

**Context:** No known plugin currently needs vault-shape lazy activation. The event would allow plugins to activate only when a vault contains specific files (e.g., `.obsidian/`, `package.json`).

**Recommendation:** Defer. Create a follow-up issue. Port when a concrete plugin needs it.

### 2. BUG-002B (undo history across tab switch) — track as future work?

**Context:** CodeMirror state (including undo history) is destroyed on every tab switch. Fix requires not destroying CM on tab switch — architectural change. BUG-002A (content flush) is already fixed. A CM content cache was added but full undo history is deferred.

**Recommendation:** Yes, track as future work. Not in this roadmap — it's an editor architecture change that doesn't block any current phase.

### 3. Phase C (metadata events) before Phase B?

**Context:** Phase C has no dependency on Phase B. It depends only on Steps 4 and 9 which are already on main.

**Recommendation:** Yes, C can run before or concurrently with B. The ordering in this roadmap allows parallelism — C is independent. If resources allow, start C as soon as Phase A passes review.

### 4. Checkpoint commits on `feat/extended-tools` — inspect before archiving?

**Context:** 4 checkpoint commits exist on the branch (WIP snapshots). They may contain uncommitted work-in-progress not captured in the named commits.

**Recommendation:** Inspect with `git diff` between each checkpoint and its parent. If any contains novel code not in the named commits, extract it before archiving. Low risk — the named commits cover the full feature scope.

### 5. `network.fetch` — streaming responses (SSE/chunked)?

**Context:** Current design returns complete responses only. SSE/chunked would require a different IPC pattern (Tauri events for progress).

**Recommendation:** Start with complete responses only. Streaming adds significant complexity (event-based IPC, backpressure, cancellation) for a feature no plugin needs yet. Add streaming as a follow-up if a concrete use case emerges.

### 6. `ai.execute` — support `api` transport kind?

**Context:** `AiTransport::Api` exists in types but is unimplemented in `ai_execute_cli`. Only CLI providers (Claude Code, Codex, Ollama) work today.

**Recommendation:** Only CLI providers for now. The `api` transport would require HTTP client logic, API key management, and streaming — significant scope. Plugin authors who need direct API access can use `network.fetch` with their own API keys instead.

### 7. `allowed_origins` in manifest — required or optional?

**Context:** Controls which domains a plugin can fetch via `network.fetch`.

**Recommendation:** Optional with explicit user consent. If omitted, the host shows a permission dialog on first fetch attempt listing the requested origin. If present, only listed origins are allowed without dialog. This matches browser extension patterns and keeps the manifest simple for simple plugins.

---

## Summary Table

| Phase | Step | Units | Sessions | Status |
|---|---|---|---|---|
| A | A1: Editor width tokens | 1 | 1 | DONE |
| A | A2: Plugin hardening | 3 | 2–3 | DONE |
| A | A3: Plugin AI + network RPC | 3 | 3 | DONE |
| B | B1: MCP Tier 2/3 + bridge | 2 | 2 | DONE |
| B | B2: CLI extended commands | 2 | 2 | NOT STARTED |
| B | B3: Slash commands | 1 | 1 | NOT STARTED |
| C | C1: Metadata events | 2 | 2 | NOT STARTED |
| D | D1: Graph visualization | 2 | 2 | NOT STARTED |
| D | D2: Power features | 5 | 5 | NOT STARTED |
| E | E1: Archive branches | 1 | 1 | NOT STARTED |
| **Total** | | **22** | **~21–22** | |
