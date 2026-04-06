# Codebase Audit Report: `feat/extended-tools` Branch

**Generated**: 2026-04-06
**Repository**: /Users/abir/src/carbide
**Branch**: `feat/extended-tools` (35 commits, 201 files changed, +22,656 / -1,378 lines vs `main`)
**Auditor**: Claude Codebase Auditor

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Overall Health Score | B- |
| Critical Issues | 3 |
| Warnings | 9 |
| Files Reviewed | 45+ significant files |
| Lines Added | ~22,656 |

**Key Findings**: This branch introduces a large surface area (MCP server, HTTP API, CLI binary, smart links engine, plugin hardening, block embeddings, slash commands) in a single feature branch. The individual implementations are competent, but the branch as a whole has structural duplication between the CLI routes and MCP tools layers (extractable into shared service wrappers), premature hardening in the plugin system, and an overengineered smart links rules engine for the current feature set.

**Top 3 Priorities**:
1. **Extract shared service wrappers for CLI routes and MCP tools** -- `cli_routes.rs` (1,489 lines) and `tools/*.rs` both independently resolve vault paths and call the same services. Extract a shared operations layer; add Axum auth middleware to replace 30+ copy-pasted auth checks.
2. **Defer plugin hardening (rate limiting, error budgets, activation events) to when plugins exist** -- there are 0 third-party plugins. This is speculative infrastructure.
3. **Simplify or defer block-level embeddings** -- brute-force KNN over all block embeddings is an O(n*m) scan that will not scale and adds significant complexity for a feature behind a disabled-by-default flag.

---

## Architecture Assessment

### Transport Architecture: Three Legitimate Paths, Shared Plumbing Problem

The branch introduces **three** ways to invoke operations, each serving a different consumer:

1. **MCP tools** (JSON-RPC via `McpRouter` -> `tools/*.rs`) -- used by Claude Desktop/Code. Returns `ToolResult` text formatted for LLM consumption.
2. **CLI REST routes** (`cli_routes.rs` -> direct service calls) -- used by the `carbide-cli` binary. Returns structured JSON for `--json` mode and plain-text formatting.
3. **Tauri commands** (existing `#[tauri::command]` functions) -- used by the frontend.

Each transport is justified — they serve different consumers with different output format needs. The problem is not the existence of multiple paths, but that paths 1 and 2 **independently duplicate** the shared plumbing (vault path resolution, service calls, error handling) instead of sharing it.

```
Claude Desktop/Code  -->  /mcp (JSON-RPC)  -->  McpRouter  -->  tools/*.rs    -->  [vault resolve + service call]
carbide-cli binary   -->  /cli/* (REST)    -->  cli_routes.rs                 -->  [vault resolve + service call] (duplicated)
Svelte frontend      -->  Tauri IPC        -->  #[tauri::command]             -->  services
```

For example, "read a note" is implemented in:
- `tools/notes.rs:handle_read_note()` (lines 184-204)
- `cli_routes.rs:cli_read()` (lines 180-206)

Both call `storage::vault_path()` then `safe_vault_abs()` then `std::fs::read_to_string()`. A shared `read_note(vault_id, path) -> Result<NoteContent>` wrapper would let both be thin format adapters.

### Module Relationships

The MCP feature directory (`src-tauri/src/features/mcp/`) contains:
- `router.rs` -- JSON-RPC dispatch (217 lines, clean)
- `transport.rs` -- stdio stream handler (190 lines, clean)
- `http.rs` -- Axum server + MCP POST handler + HttpServerState (534 lines)
- `cli_routes.rs` -- **1,489 lines** of Axum REST handlers
- `server.rs` -- McpState for stdio transport (150 lines)
- `setup.rs` -- Claude Desktop/Code auto-config (351 lines)
- `auth.rs` -- Token management (105 lines)
- `types.rs` -- JSON-RPC types (257 lines)
- `tools/` -- 7 tool modules (~600 lines total)

`cli_routes.rs` is the largest file on the branch and the primary tech debt source.

### Design Patterns

- **Frontend port/adapter pattern**: Consistently applied. `McpPort` interface, `McpTauriAdapter` implementation, `McpService` orchestrator, `McpStore` state. This is clean and justified by the existing codebase convention.
- **MCP tool dispatch**: Chain-of-responsibility pattern in `McpRouter.dispatch_tool()`. Each tool module returns `Option<ToolResult>`, falling through on `None`. Works but the `pub fn dispatch_tool_public()` and `pub fn tool_definitions_public()` wrappers on lines 162-168 are code smell -- they exist solely to bypass visibility for the Tauri `mcp_call_tool` command.
- **Smart links rules engine**: Strategy pattern with weighted scoring. Structurally fine but overbuilt for 7 hardcoded rule implementations.

---

## Critical Issues (Must Fix)

### Issue 1: CLI Routes / MCP Tools — Duplicated Service Layer

- **Location**: `src-tauri/src/features/mcp/cli_routes.rs` (1,489 lines) and `tools/*.rs` (~600 lines)
- **Severity**: HIGH
- **Impact**: Every new operation's vault-path resolution and service call is implemented twice. Auth checking is copy-pasted into every CLI handler (30+ times). Error handling is inconsistent between the two paths.

**Description**: The CLI REST routes (`/cli/*`) and MCP tools (`tools/*.rs`) both independently resolve vault paths and call the same underlying service functions. The duplication is in the shared plumbing, not the transport — each transport has legitimate reasons to exist:

- **REST (`/cli/*`)** is the natural transport for a CLI binary. `carbide read "My Note"` maps cleanly to `POST /cli/read {path: "My Note"}`. REST returns structured JSON suitable for `--json` mode and plain-text formatting.
- **JSON-RPC (`/mcp`)** is the MCP protocol transport. MCP tools return `ToolResult` text content formatted for LLM consumption, not structured data.

Routing the CLI through JSON-RPC would add ceremony (wrapping every call in `{"jsonrpc": "2.0", "method": "tools/call", ...}`) and create a lossy round-trip (MCP tools return formatted text, but the CLI needs structured JSON for `--json`). The CLI also has operations the MCP tools lack (append, prepend, git push/pull/restore/init, bases/query, tasks, dev/index) — these are CLI-specific and don't belong in the MCP tool surface.

**Evidence of duplication**:
- `cli_read` (cli_routes.rs:180-206) vs `handle_read_note` (tools/notes.rs:184-204) — both call `storage::vault_path()` then `safe_vault_abs()` then `std::fs::read_to_string()`
- `cli_git_status` (cli_routes.rs:684-701) vs `handle_git_status` (tools/git.rs:128-162)
- `cli_files` (cli_routes.rs:226-249) vs `handle_list_notes` (tools/notes.rs:151-176)
- Auth check boilerplate `if let Err(status) = check_auth(...)` repeated in every CLI handler

**Recommendation**:
1. **Extract shared service wrappers** (e.g., `shared_ops::read_note(vault_id, path) -> Result<NoteContent>`) that handle vault path resolution and service calls. Both MCP tools and CLI routes become thin adapters over these wrappers — MCP formats as `ToolResult` text, CLI returns structured JSON.
2. **Add Axum auth middleware** to the CLI router instead of checking auth in every handler.
3. **Consolidate param structs** — the 15+ one-off `#[derive(Deserialize)]` structs in `cli_routes.rs` overlap with `*Args` structs in `tools/*.rs`. Share where possible.

### Issue 2: Block Embeddings KNN is O(n*m) Full Table Scan

- **Location**: `src-tauri/src/features/search/vector_db.rs:block_knn_search()` (diff line ~290)
- **Severity**: CRITICAL (performance, will not scale)
- **Impact**: `block_knn_search` loads every row from `block_embeddings`, computes dot distance for each, and sorts. For N notes with M sections each, this is O(N*M) per query. The `query_block_semantic_similarity` rule in `rules.rs:268-314` calls this for every source block, making it O(S * N * M).

**Description**: The existing `knn_search` for note-level embeddings has the same brute-force pattern, but block embeddings multiply the cardinality. A vault with 1,000 notes and 10 sections each = 10,000 block embeddings. Each smart link computation for a note with 10 sections = 10 * 10,000 = 100,000 distance computations.

**Recommendation**: This feature is disabled by default (`enabled: false` in config). Before enabling it:
1. Add a vector index (sqlite-vss, or at minimum an approximate nearest neighbor approach)
2. Or limit the search to notes already identified by other rules (use block similarity as a re-ranking step, not a discovery step)

### Issue 3: McpState and HttpServerState are Near-Identical + Stdio is Unreachable

- **Location**: `src-tauri/src/features/mcp/server.rs:McpState` and `src-tauri/src/features/mcp/http.rs:HttpServerState`
- **Severity**: HIGH (architecture)
- **Impact**: Two separate server lifecycle managers with identical structure (shutdown_tx, task_handle, running/status mutex, start/stop/get_info methods). Each is independently registered as Tauri managed state. The stdio transport's Tauri commands (`mcp_start`, `mcp_stop`, `mcp_status`) are registered but nothing calls them.

**Description**: Both follow the exact same pattern:
```rust
// McpState (server.rs)
status: Arc<Mutex<McpServerStatus>>,
shutdown_tx: Arc<Mutex<Option<watch::Sender<bool>>>>,
task_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,

// HttpServerState (http.rs)
shutdown_tx: Arc<tokio::sync::Mutex<Option<watch::Sender<bool>>>>,
task_handle: Arc<tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
running: Arc<tokio::sync::Mutex<bool>>,
```

Per commit `968750c9`, the frontend adapter was rewired from `mcp_start`/`mcp_stop`/`mcp_status` (stdio) to `http_server_start`/`http_server_stop`/`http_server_status` (HTTP). The stdio Tauri commands are still registered in `app/mod.rs` and `McpState` is still managed state, but nothing in the frontend calls them — they are **unreachable from the app**, not dead in principle.

**Context**: The stdio transport is the standard MCP transport for subprocess-managed servers (e.g., Claude Desktop launching a process). The current HTTP-only approach requires the app to already be running. Stdio is unfinished rather than unnecessary — it doesn't work because Tauri captures stdout, not because the concept is wrong. A future fix would likely involve a separate stdio binary or a different IPC mechanism.

**Recommendation**:
1. **Short-term**: Extract a shared `ServerLifecycle` struct that both `McpState` and `HttpServerState` can use, eliminating the structural duplication. Consolidate the three separate mutexes in `HttpServerState` into a single `Arc<Mutex<ServerInner>>`.
2. **If stdio is not on the near-term roadmap**: Remove `McpState`/`server.rs`/`transport.rs` (~340 lines) and the unreachable Tauri commands. Document the stdio approach for future implementation. The transport logic is clean and well-tested — it can be re-added when there's a plan for Tauri stdout capture.
3. **If stdio is planned**: Fix the Tauri stdout issue and unify the lifecycle managers.

---

## Warnings (Should Fix)

### Warning 1: Every CLI Route Handler Copies Auth Check Boilerplate

- **Location**: `src-tauri/src/features/mcp/cli_routes.rs` -- every handler
- **Category**: DRY Violation
- **Description**: Every single handler in `cli_routes.rs` starts with:
  ```rust
  if let Err(status) = check_auth(&headers, state.token()) {
      return json_err(status, "Unauthorized");
  }
  ```
  This is repeated 30+ times across the file.
- **Recommendation**: Use an Axum middleware/extractor layer to handle auth once at the router level, rather than in each handler.

### Warning 2: Proliferation of One-Off Deserialize Structs in cli_routes.rs

- **Location**: `src-tauri/src/features/mcp/cli_routes.rs` lines 24-140
- **Category**: Clean Code
- **Description**: 15+ bespoke `#[derive(Deserialize)]` parameter structs (`ReadParams`, `SearchParams`, `FilesParams`, `CreateParams`, `WriteParams`, `AppendParams`, `PrependParams`, `RenameParams`, `MoveParams`, `DeleteParams`, `GitCommitParams`, `GitLogParams`, `GitDiffParams`, `GitPullParams`, `GitRestoreParams`, `ReferencesSearchParams`, `ReferencesAddParams`, `ReferencesBbtSearchParams`, `BasesQueryParams`, `TasksParams`, `TaskUpdateParams`). These overlap heavily with the `*Args` structs in `tools/*.rs`.
- **Recommendation**: Share types or, better, eliminate this layer per Critical Issue 1.

### Warning 3: `prop()` Helper Duplicated Across Tool Modules

- **Location**: `tools/notes.rs:35-42`, `tools/git.rs:26-33`, `tools/graph.rs:32-39`, `tools/references.rs`, `tools/metadata.rs`, `tools/search.rs`, `tools/vault.rs`
- **Category**: DRY Violation
- **Description**: The `prop()` helper function that constructs a `PropertySchema` is copy-pasted in every tool module.
- **Recommendation**: Move to a shared location (e.g., `tools/mod.rs` or `types.rs`).

### Warning 4: VaultArgs Struct Duplicated Across Tool Modules

- **Location**: `tools/git.rs:103-106`, `tools/graph.rs:153-162`
- **Category**: DRY Violation
- **Description**: `VaultArgs { vault_id: String }` is defined independently in multiple tool modules.
- **Recommendation**: Define once in the tools mod or types.

### Warning 5: Smart Links `config` Field is Unused

- **Location**: `src-tauri/src/features/smart_links/mod.rs:19` (`SmartLinkRule.config`)
- **Category**: Dead Code / YAGNI
- **Description**: Every rule has `config: std::collections::HashMap<String, String>` but no rule implementation reads it. `rules.rs` dispatches purely on `rule.id` with hardcoded logic. The config field is always `Default::default()`.
- **Recommendation**: Remove it. If rules need config later, add it then.

### Warning 6: Plugin Rate Limiter Stores Every Timestamp

- **Location**: `src/lib/features/plugin/domain/rate_limiter.ts`
- **Category**: Performance / Premature
- **Description**: The rate limiter stores an array of timestamps per plugin and filters the entire array on every call. For 100 calls/minute this is fine, but the design choice of `number[]` + filter is more complex than a simple sliding window counter. More importantly, there are 0 plugins using this.
- **Recommendation**: This is fine code but it is premature. Consider whether any of the plugin hardening (rate limiting, error budgets, activation events) should ship before there is a plugin ecosystem. The code is clean enough that it could be written in a day when needed.

### Warning 7: `find_frontmatter_end` Reimplemented in cli_routes.rs

- **Location**: `src-tauri/src/features/mcp/cli_routes.rs:354-376`
- **Category**: DRY Violation
- **Description**: Frontmatter parsing logic for the `prepend` operation. Likely duplicates or should share logic with the frontmatter handling in the notes/metadata services.
- **Recommendation**: Extract to a shared utility.

### Warning 8: title_overlap Rule Does Full Table Scan

- **Location**: `src-tauri/src/features/smart_links/rules.rs:190-236` (`query_title_overlap`)
- **Category**: Performance
- **Description**: Loads ALL notes from the database (`SELECT path, title FROM notes WHERE path != ?1`), tokenizes every title in Rust, and computes Jaccard similarity. This is O(N) in vault size with string allocation for every note on every invocation.
- **Recommendation**: This rule is disabled by default. Keep it disabled and consider FTS-based alternatives before enabling.

### Warning 9: HttpServerState Uses Three Separate Mutexes

- **Location**: `src-tauri/src/features/mcp/http.rs:175-191`
- **Category**: Complexity
- **Description**: `HttpServerState` wraps `shutdown_tx`, `task_handle`, and `running` in three separate `Arc<Mutex<...>>`. These are always locked together in `start()` and `stop()`. A single mutex over a struct would be simpler and prevent any subtle ordering issues.
- **Recommendation**: Combine into `Arc<Mutex<ServerInner>>` where `ServerInner` holds all three fields.

---

## Security Findings

| Finding | Severity | Location | Status |
|---------|----------|----------|--------|
| Constant-time token comparison | Good | `auth.rs:57-66` via `subtle::ConstantTimeEq` | Resolved |
| Token file permissions set to 0600 | Good | `auth.rs:46-52` | Resolved |
| Vault path traversal protection | Good | `safe_vault_abs` / `safe_vault_abs_for_write` used consistently | Resolved |
| CORS restricted to localhost | Good | `http.rs:50-72` | Resolved |
| `set_var("HOME")` in tests | Low | `auth.rs:95`, `setup.rs:258` -- not thread-safe, can affect parallel tests | Open |

The security posture is good. Bearer token auth, constant-time comparison, path traversal protection, and localhost-only CORS are all in place.

---

## Overengineering Assessment

### Plugin Hardening (Steps 10): Premature

**Files**: `rate_limiter.ts` (35 lines), `rpc_timeout.ts` (38 lines), `match_activation_event.ts` (65 lines), `plugin_error_tracker.ts` (56 lines), `plugin_slash_commands.ts` (61 lines)

**Assessment**: This is ~255 lines of plugin infrastructure for a system with 0 third-party plugins. The code is well-written and well-tested, but it is speculative. The activation events system (`on_startup_finished`, `on_file_type:*`, `vault_contains:*`) is a full VS Code-style lazy loading system for a plugin host that currently runs in an iframe sandbox.

The `vault_contains` activation event requires listing all vault files at startup and pattern-matching against plugin declarations -- meaningful overhead for a feature with no consumers.

**Verdict**: The individual pieces are small and clean. The risk is not in the code quality but in the accumulated maintenance surface. Every future change to the plugin lifecycle must account for activation events, rate limiting, error budgets, timeout handling, and slash command registration. This is the definition of premature hardening.

### Smart Links Rules Engine (Steps 11): Right Direction, Over-Abstracted

**Files**: `rules.rs` (315 lines), `mod.rs` (151 lines), `config.rs` (21 lines)

**Assessment**: The rules engine has a clean architecture (configurable weighted rules, per-vault persistence, UI for toggling/weighting). But the abstraction level is ahead of the feature. There is no mechanism for users to write custom rules -- the 7 rules are hardcoded with a `match` on string IDs. The `SmartLinkRuleGroup` grouping adds a layer that currently just separates "metadata" from "semantic" rules -- not a meaningful user-facing distinction.

The `config` field on `SmartLinkRule` exists but is never read. The disable/weight toggle UI is the only user-facing configurability.

**Verdict**: Simplify to a flat list of rule toggles with weights. Remove groups and config until there is a demonstrated need.

### Block Embeddings (Step 11): High Cost, Low Payoff

**Added code**: ~170 lines in `vector_db.rs`, rule implementation in `rules.rs`, schema changes, service wiring.

**Assessment**: Block embeddings multiply the storage and compute requirements by the average number of sections per note. The brute-force KNN makes this O(n) in block count per query. The feature is disabled by default, which is appropriate, but the infrastructure cost is real -- schema migrations, rename/delete cascading, service changes.

**Verdict**: This should have stayed as a design document until there was evidence that note-level semantic similarity was insufficient. The feature adds ~200 lines of code that will need to be maintained through every schema change.

### MCP Auto-Setup (Step 8): Justified

**Files**: `setup.rs` (351 lines including 112 lines of tests)

**Assessment**: This is a pragmatic feature. Auto-configuring `claude_desktop_config.json` and `.mcp.json` removes a manual setup step for users. The code handles cross-platform paths, existing config merging, and edge cases. Well-tested.

**Verdict**: Good. Keep.

### HTTP Server + CLI Binary (Step 7): Justified but Needs Consolidation

The HTTP server is a necessary primitive for MCP HTTP transport and CLI access. The CLI binary is a useful tool. The problem is the duplicated dispatch layer, not the architecture itself.

---

## Refactoring Roadmap

| Priority | Task | Files Affected | Complexity | Impact |
|----------|------|----------------|------------|--------|
| 1 | **Extract shared service wrappers** for CLI routes + MCP tools (vault path resolution, common service calls) | New `shared_ops` module, `cli_routes.rs`, `tools/*.rs` | High | Eliminates duplicated plumbing; both layers become thin adapters |
| 2 | **Add Axum auth middleware** to CLI router | `cli_routes.rs`, `http.rs` | Low | Removes 30+ copy-pasted auth checks |
| 3 | **Consolidate HttpServerState mutexes** into single `Arc<Mutex<ServerInner>>` | `http.rs` | Low | Simpler lifecycle management |
| 4 | **Decide on stdio transport**: If not near-term, remove unreachable `McpState`/`server.rs`/`transport.rs` (~340 lines) and document for future. If planned, fix Tauri stdout issue | `server.rs`, `transport.rs`, `app/mod.rs` | Medium | Removes unreachable code or fixes broken transport |
| 5 | **Extract shared `prop()` and `VaultArgs`** from tool modules | `tools/*.rs` | Low | DRY |
| 6 | **Remove SmartLinkRule.config field** | `mod.rs`, store types | Low | Dead code removal |
| 7 | **Gate block embeddings behind feature flag** at compile time | `vector_db.rs`, `rules.rs` | Medium | Reduces default binary complexity |
| 8 | **Defer plugin hardening** to post-plugin-ecosystem | Multiple plugin files | Low (just defer) | Reduces maintenance surface |

---

## Test Quality Assessment

### Rust Tests (in-file `#[cfg(test)]`)
- **`http.rs` tests** (lines 286-534): Good. Tests auth rejection, malformed JSON, ping, tools/list, notifications, health endpoint, server lifecycle. Uses Tower `oneshot` for proper Axum handler testing.
- **`transport.rs` tests** (lines 64-190): Good. Tests ping, initialize, invalid JSON, unknown methods, notifications, empty lines, sequential processing, shutdown signal, tools list count.
- **`setup.rs` tests** (lines 236-351): Good. Tests config creation, merging, detection. Uses `tempdir` properly. One concern: `set_var("HOME")` is not thread-safe.
- **`auth.rs` tests** (lines 68-105): Good. Constant-time comparison and file creation tested.

### TypeScript Tests
- **`mcp_service.test.ts`** (189 lines): Good. Tests happy paths, error handling, edge cases (port failure, stop on error). Follows port/mock pattern correctly.
- **`smart_links_service.test.ts`** (165 lines): Good. Tests CRUD operations, error propagation, no-vault handling.
- **`plugin_service_hardening.test.ts`** (196 lines): Good but couples to internals. Uses `plugin_service_internals()` cast to reach private fields. This makes tests brittle to refactoring.
- **`plugin_rpc_handler.test.ts`** (339+ lines added): Good coverage of new slash command and MCP namespaces.

### Coverage Gaps
1. No integration tests for the full HTTP -> MCP -> tool -> service path
2. No tests for `cli_routes.rs` handlers (the largest file on the branch)
3. No tests for `rules.rs` SQL queries (would need a test database)
4. Block embeddings have no end-to-end tests
5. CLI binary (`carbide-cli`) has no tests

---

## Documentation Gaps

- [ ] No README or doc for the MCP server setup beyond the auto-config UI
- [ ] No CLI usage documentation (`carbide --help` works but no man page or README section)
- [ ] No architecture doc for the transport layer (MCP vs HTTP vs CLI dispatch)
- [ ] Smart links rules have no user-facing documentation explaining what each rule does
- [ ] Plugin API for slash commands undocumented

---

## Files Reviewed

### Rust Backend
- [x] `src-tauri/src/features/mcp/cli_routes.rs` -- CRITICAL: 1,489 lines of duplicated dispatch
- [x] `src-tauri/src/features/mcp/http.rs` -- HTTP server, auth, MCP handler (534 lines)
- [x] `src-tauri/src/features/mcp/router.rs` -- JSON-RPC dispatch (217 lines, clean)
- [x] `src-tauri/src/features/mcp/transport.rs` -- stdio stream handler (190 lines, likely dead)
- [x] `src-tauri/src/features/mcp/server.rs` -- McpState (150 lines, likely dead)
- [x] `src-tauri/src/features/mcp/setup.rs` -- Auto-config (351 lines, good)
- [x] `src-tauri/src/features/mcp/auth.rs` -- Token management (105 lines, good)
- [x] `src-tauri/src/features/mcp/types.rs` -- JSON-RPC types (257 lines, clean)
- [x] `src-tauri/src/features/mcp/tools/mod.rs` -- Tool module registry
- [x] `src-tauri/src/features/mcp/tools/notes.rs` -- Note CRUD tools (297 lines)
- [x] `src-tauri/src/features/mcp/tools/git.rs` -- Git tools (210 lines)
- [x] `src-tauri/src/features/mcp/tools/graph.rs` -- Backlinks/outlinks/properties tools (322 lines)
- [x] `src-tauri/src/features/smart_links/mod.rs` -- Smart links types + commands (151 lines)
- [x] `src-tauri/src/features/smart_links/rules.rs` -- Rule implementations (315 lines)
- [x] `src-tauri/src/features/smart_links/config.rs` -- Rules persistence (21 lines)
- [x] `src-tauri/src/features/search/vector_db.rs` -- Block embeddings additions (~170 lines)

### CLI Crate
- [x] `src-tauri/crates/carbide-cli/src/main.rs` -- CLI entry point (431 lines)
- [x] `src-tauri/crates/carbide-cli/src/client.rs` -- HTTP client (96 lines)
- [x] `src-tauri/crates/carbide-cli/src/auth.rs` -- Token reader (12 lines)
- [ ] `src-tauri/crates/carbide-cli/src/commands/*.rs` -- Skipped (thin dispatch, follows pattern from main.rs)
- [ ] `src-tauri/crates/carbide-cli/src/install.rs` -- Skipped (CLI install utility)

### TypeScript Frontend
- [x] `src/lib/features/mcp/ports.ts` -- McpPort interface (49 lines)
- [x] `src/lib/features/mcp/application/mcp_service.ts` -- Service (62 lines, clean)
- [x] `src/lib/features/mcp/state/mcp_store.svelte.ts` -- Store (25 lines, clean)
- [x] `src/lib/features/smart_links/application/smart_links_service.ts` -- Service (81 lines, clean)
- [x] `src/lib/features/smart_links/state/smart_links_store.svelte.ts` -- Store (84 lines, clean)
- [x] `src/lib/features/plugin/domain/rate_limiter.ts` -- Rate limiter (35 lines)
- [x] `src/lib/features/plugin/domain/rpc_timeout.ts` -- Timeout wrapper (38 lines)
- [x] `src/lib/features/plugin/domain/match_activation_event.ts` -- Activation matching (65 lines)
- [x] `src/lib/features/plugin/domain/plugin_slash_commands.ts` -- Slash commands (61 lines)
- [x] `src/lib/features/plugin/application/plugin_error_tracker.ts` -- Error budget (56 lines)
- [x] `src/lib/features/plugin/application/plugin_rpc_handler.ts` -- RPC handler diff reviewed
- [x] `src/lib/features/plugin/application/plugin_service.ts` -- Service diff reviewed

### Tests
- [x] `tests/unit/services/mcp_service.test.ts` -- 189 lines, good quality
- [x] `tests/unit/services/smart_links_service.test.ts` -- 165 lines, good quality
- [x] `tests/unit/services/plugin_service_hardening.test.ts` -- 196 lines, tests internals
- [x] In-file Rust tests in `http.rs`, `transport.rs`, `setup.rs`, `auth.rs` -- reviewed

---

## Appendix: Detailed Analysis of Key Concerns

### A. Should the CLI binary use REST or JSON-RPC?

Currently: CLI -> REST routes (`/cli/*`) -> services
Alternative: CLI -> JSON-RPC (`/mcp`) -> McpRouter -> tools -> services

**Verdict: REST is the right transport for the CLI.** The duplication problem is in the shared service layer, not the transport choice.

REST is the natural fit because:
- `carbide read "My Note"` maps directly to `POST /cli/read {path: "My Note"}` — clean, no ceremony
- REST returns structured JSON, which the CLI needs for both `--json` mode and plain-text formatting
- JSON-RPC would require wrapping every call in `{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "read_note", "arguments": {...}}}` and unwrapping `ToolResult` text — a lossy round-trip since MCP tools return LLM-formatted text, not structured data
- The CLI has operations (append, prepend, git push/pull/restore, bases/query, tasks, dev/index) that don't belong in the MCP tool surface

The fix is to extract shared service wrappers that both transports call:
```
/mcp JSON-RPC  →  McpRouter  →  tools/*.rs    →  shared_ops::read_note()  →  services
/cli/* REST    →  cli_routes →  handlers      →  shared_ops::read_note()  →  services
```
Where `shared_ops` handles vault path resolution and the common service call. MCP tools format the result as `ToolResult` text; CLI routes return it as JSON.

### B. Is the Frontend Port/Adapter Pattern Justified?

Yes. The `McpPort` -> `McpTauriAdapter` -> `McpService` -> `McpStore` pattern adds ~4 files totaling ~170 lines for the MCP feature. This is consistent with the existing codebase convention and provides testability (mock ports in tests). The stores are small and focused. This is not overengineering -- it is consistency.

### C. `tool_definitions_public()` and `dispatch_tool_public()` Wrappers

These methods on `McpRouter` (lines 162-168) exist solely because `get_tool_definitions()` and `dispatch_tool()` are private, but `mcp_call_tool` and `mcp_list_tool_definitions` Tauri commands need access. This is a visibility hack. Either make the underlying methods public or restructure so the Tauri commands go through the proper request/response flow.
