# Merge & Stabilization Plan

**Date:** 2026-04-06
**Inputs:**

- `2026-04-06_branch_ancestry_and_merge_order.md` — branch topology
- `2026-04-06_extended_tools_branch_audit.md` — audit of feat/extended-tools
- `2026-04-06_mcp_transports_terminal_plan.md` — MCP transport improvements + terminal bugs
- `2026-04-06_floating_toolbar_review.md` — formatting toolbar bugs

---

## Branch Topology

```
d6a47599 (v1.13.0, original main)
  ├─ 39cab98d (current main HEAD, +1 doc commit)
  ├─ feat/extended-tools  ←  72 commits (Steps 1-12, the full feature stack)
  └─ feat/editor-drag-blocks  ←  9 commits (Step 13, independent)
```

Both feature branches diverged from `d6a47599`. They share no commits. `feat/editor-drag-blocks` is 15 files, +1,061 lines — all editor domain code with good test coverage (515 lines tests / 386 lines code). It does not touch any MCP, CLI, smart links, or plugin code.

Merging `feat/extended-tools` into main requires a merge commit (main diverged by 1 doc commit). `feat/editor-drag-blocks` is a separate 3-way merge — optional, see below.

---

## Phase 1: Merge the Stack

**Decision: Merge everything.** The audit flagged plugin hardening and block embeddings as premature, but they are baked into the linear stack. Excising them via interactive rebase across 72 commits is more risk than keeping them. Refactoring happens post-merge.

### Commands

```bash
# 1. Ensure working tree is clean
git status

# 2. Merge the full feature stack into main
git checkout main
git merge feat/extended-tools -m "Merge feat/extended-tools: MCP server, HTTP API, CLI, smart links, plugin hardening, block embeddings, extended tools (Steps 1-12)"

# 3. Verify
pnpm check && pnpm lint && pnpm test
cd src-tauri && cargo check && cd ..

# 4. (Optional) Merge editor drag blocks — see decision below
git merge feat/editor-drag-blocks -m "Merge feat/editor-drag-blocks: block detection plugin + drag-and-drop (Step 13)"

# 5. Verify again
pnpm check && pnpm lint && pnpm test

# 6. Cleanup stale branch
git branch -d feat/smart-linking-plan

# 7. Cleanup merged stack branches (all contained in main now)
git branch -d feat/mcp-stdio feat/metadata-headings-cmd feat/metadata-foundations \
  feat/metadata-enrichment feat/smart-linking feat/http-cli feat/metadata-file-cache \
  feat/plugin-hardening feat/block-embeddings feat/extended-tools
# Only if merged: git branch -d feat/editor-drag-blocks
```

### Expected Conflicts

The `feat/extended-tools` merge may conflict on files modified by `39cab98d` (agent automation docs). Likely trivial — docs-only.

The `feat/editor-drag-blocks` merge (if done) will be a 3-way merge from the `d6a47599` base. Expect conflicts in `extensions/index.ts` (adjacent imports from both branches) and possibly `editor.css` (both add styles in different sections). The drag blocks code itself is clean — 15 files, all editor-focused, no overlap with MCP/CLI/smart-links/plugins.

### Decision: `feat/editor-drag-blocks`

This is **optional and independent**. The feature is self-contained (block detection plugin, drag handles, drop reordering) with good tests. It does not interact with any audit concerns.

- **Merge now** if you want the feature and are comfortable with the implementation
- **Defer** if you'd rather stabilize the stack first and review drag blocks separately
- **Leave on branch** indefinitely — it won't conflict with any planned work since it touches only editor domain code

---

## Phase 2: Bug Fixes (High Impact, Small Effort)

These fix real user-facing bugs. Ship before any refactoring.

### 2a. Terminal Bugs — 1 session, ~6 files ✅ DONE

**Status:** Merged to main via `fix/terminal-session-lifecycle` (commit `abbce591`, merged `cb9430de`)
**Source:** `2026-04-06_mcp_transports_terminal_plan.md` → "Terminal Bug Fixes"
**Branch:** `fix/terminal-session-lifecycle`

| #   | Bug                                                  | File                                                          | Fix                                                                                       | Status |
| --- | ---------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| 1   | Tab switch destroys xterm instance, loses scrollback | `terminal_panel_content.svelte:154-161`                       | `{#each}` renders all sessions; CSS visibility via `active` prop (`display:none`/`block`) | ✅     |
| 2   | `fixed_cwd` ignores stored session cwd               | `terminal_session_view.svelte:44`                             | `fixed_cwd: session?.cwd ?? stores.vault.vault?.path` reads stored cwd first              | ✅     |
| 3   | Toggle/close kills all PTY processes                 | `terminal_actions.ts:47,62`, `terminal_store.svelte.ts:28-31` | `hide()` preserves sessions (panel-only); `close()` is destructive (reset)                | ✅     |
| 4   | `reconcile_session` respawns manual-policy sessions  | `terminal_service.ts:202-218`                                 | Early return for `manual` policy — metadata-only update, no kill/respawn                  | ✅     |

**Tests added:** `terminal_store.test.ts` (hide vs close), `terminal_service.test.ts` (manual-policy reconcile), `register_terminal_actions.test.ts` (toggle/close preserve sessions). All passing.

**Note:** Pre-existing failure in `document_service.test.ts` (eviction test) — unrelated to terminal work.

### 2b. Floating Toolbar Fixes — 1 session, ~4 files

**Source:** `2026-04-06_floating_toolbar_review.md`
**Branch:** `fix/formatting-toolbar`

| #   | Fix                                                    | Severity | Approach                                                                                          |
| --- | ------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| 1   | Strip `on_select` mode + all floating positioning code | High     | Remove `create_anchor`, `backdrop_el`, `compute_floating_position`, the entire `on_select` branch |
| 2   | Fix stale view capture in Svelte mount                 | High     | Pass `() => toolbar_view` getter instead of `view` directly                                       |
| 3   | Use `wrapIn` for blockquote                            | Medium   | Replace `setBlockType(blockquote)` with `wrapIn(blockquote)`                                      |
| 4   | Use `wrapInList` for bullet/ordered lists              | Medium   | Replace manual list construction with `wrapInList` from prosemirror-schema-list                   |
| 5   | Replace `prompt()` with command event pattern          | Medium   | Gate link/image behind `is_command_available: false` until async input UI built                   |
| 6   | Remove `on_select` from `ToolbarVisibility` type       | Cleanup  | Remove the enum value, update settings type                                                       |

---

## Phase 3: Audit Refactoring

**Source:** `2026-04-06_extended_tools_branch_audit.md` → "Refactoring Roadmap"

Work in priority order. Each item is a separate branch.

### 3a. Extract shared service wrappers — `refactor/shared-ops`

**Priority 1 from audit. Highest-leverage refactor.**

Create `src-tauri/src/features/mcp/shared_ops.rs`:

- Extract vault path resolution + service call patterns from both `cli_routes.rs` and `tools/*.rs`
- Each shared op returns a structured result type
- MCP tools format as `ToolResult` text
- CLI routes return as JSON

Simultaneously:

- Add Axum auth middleware layer to the CLI router (kills 30+ copy-pasted `check_auth` calls)
- Consolidate overlapping param structs between `cli_routes.rs` and `tools/*.rs`

**Expected outcome:** `cli_routes.rs` shrinks significantly; `tools/*.rs` shrinks moderately; new `shared_ops.rs` is ~300-400 lines of clean service wrappers.

### 3b. DRY fixes — `refactor/mcp-dry` ✅ DONE

**Status:** Completed on `refactor/mcp-dry` (commit `4f551960`)

| #   | Item                                        | Status | Notes                                                                                                                                         |
| --- | ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Extract `prop()` helper to `tools/mod.rs`   | ✅     | Was 3 copies (notes.rs, search.rs, metadata.rs), not 7 — audit overestimated. Also extracted `op_err_to_tool_result()` (2 copies + 1 inline). |
| 2   | Extract `VaultArgs` to `tools/mod.rs`       | N/A    | Does not exist in current code. Likely cleaned up during Phase 3a shared_ops refactor.                                                        |
| 3   | Remove unused `SmartLinkRule.config` field  | ✅     | Removed from Rust struct, TS type, generated bindings, and all test fixtures (6 Rust + 5 TS literals).                                        |
| 4   | Consolidate `HttpServerState` three mutexes | ✅     | Replaced 3× `Arc<Mutex<T>>` with single `Arc<Mutex<ServerInner>>`. Eliminates implicit lock ordering.                                         |

**Tests:** 322 Rust tests pass, 2890/2891 TS tests pass (1 pre-existing failure in `document_service.test.ts` eviction test — unrelated).

### 3c. Stdio transport cleanup — `refactor/stdio-cleanup` ✅ DONE

**Status:** Completed on `refactor/stdio-cleanup` (commit `8680a491`)
**Decision:** Option A — removed unreachable stdio code.

| #   | Item                                                      | Status | Notes                                                                                                |
| --- | --------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| 1   | Delete `server.rs` (McpState, mcp_start/stop/status cmds) | ✅     | 131 lines removed. McpState managed state, shutdown call, and 3 invoke_handler entries also removed. |
| 2   | Delete `transport.rs` (run_jsonrpc_stream + 9 tests)      | ✅     | 191 lines removed. Tests covered stdio line-protocol but transport was unreachable from Tauri.       |
| 3   | Remove `pub mod server` / `pub mod transport` from mod.rs | ✅     | 2 lines from `features/mcp/mod.rs`.                                                                  |
| 4   | Rewire frontend adapter to HTTP server commands           | ✅     | `mcp_tauri_adapter.ts` now calls `http_server_start/stop/status` with a mapping to `McpStatusInfo`.  |

**Total:** 334 lines deleted, 14 lines added (adapter mapping). 312 Rust tests pass, 2890/2891 TS tests pass (1 pre-existing failure in `document_service.test.ts` — unrelated).

**Finding:** The frontend `McpPort.start()/stop()/get_status()` was calling the stdio Tauri commands (`mcp_start`/`mcp_stop`/`mcp_status`), meaning MCP autostart never actually started the HTTP server via the frontend path. Rewiring to `http_server_start/stop/status` fixes this — MCP autostart now correctly controls the HTTP server.

---

## Phase 4: MCP Transport Improvements

**Source:** `2026-04-06_mcp_transports_terminal_plan.md` → Parts 1-3
**Depends on:** Phase 1 (merge), Phase 3a nice-to-have but not blocking

### 4a. Streamable HTTP — `feat/mcp-streamable-http` ✅ DONE

**Status:** Completed on `feat/mcp-streamable-http` (commit `70182fd0`)

| #   | Item                                                      | Status | Notes                                                                                                  |
| --- | --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| 1   | POST `/mcp` branches on `Accept: text/event-stream` → SSE | ✅     | `mcp_handler` split into `mcp_post_handler` (SSE-aware) + helpers `wants_sse()`, `sse_response()`.     |
| 2   | `Mcp-Session-Id` header on initialize                     | ✅     | 16 random bytes → hex. Returned on both JSON and SSE responses to initialize.                          |
| 3   | GET `/mcp` stub (empty SSE stream for spec compliance)    | ✅     | `mcp_get_handler` returns empty SSE stream with keep-alive. Auth-gated.                                |
| 4   | Desktop config includes `"type": "http"`                  | ✅     | `build_mcp_server_entry` now always includes `"type": "http"`. Simplified `write_claude_code_config`.  |
| 5   | Added `futures-util` direct dependency                    | ✅     | Was transitive via axum; now explicit for `stream::once`/`stream::empty` in SSE helpers.               |
| 6   | 6 new tests                                               | ✅     | SSE content-type, JSON content-type, session ID on init, no session ID on ping, GET SSE, GET auth 401. |

**Tests:** 318 Rust tests pass (was 312 — 6 new), 2890/2891 TS tests pass (1 pre-existing failure).

**Finding:** `Mcp-Session-Id` validation is soft (logged, not rejected) per plan — our tools are stateless, so hard validation adds complexity for no benefit. The session ID is generated but not stored server-side.

### 4b. stdio via CLI proxy — `feat/mcp-stdio-proxy` ✅ DONE

**Status:** Completed on `feat/mcp-stdio-proxy` (commit `1b0c3d97`)

| #   | Item                                                       | Status | Notes                                                                                                     |
| --- | ---------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| 1   | `carbide mcp` stdio proxy subcommand                       | ✅     | New `mcp.rs`: reads stdin line-by-line, POSTs to `/mcp`, writes JSON responses to stdout, errors to stderr |
| 2   | `post_mcp_raw` client method                               | ✅     | Raw body POST to `/mcp` with `Accept: application/json`. Returns `Option<String>` (None for 204).          |
| 3   | `ensure_running_with_timeout` extraction                   | ✅     | 30s timeout for `carbide mcp` (cold launch), 10s default for other commands.                               |
| 4   | `carbide setup desktop` CLI command                        | ✅     | Writes stdio config (`"command": "/usr/local/bin/carbide", "args": ["mcp"]`) — no server needed.           |
| 5   | `carbide setup code <vault-path>` CLI command              | ✅     | Writes HTTP config to `.mcp.json` in vault root — no server needed.                                       |
| 6   | Desktop config uses stdio when CLI installed               | ✅     | `write_claude_desktop_config` (server-side) now uses `build_mcp_server_entry_stdio()` if CLI detected.     |
| 7   | `SetupStatus.cli_installed` field                          | ✅     | Added to Rust struct + TS type. Checks `/usr/local/bin/carbide` symlink existence.                         |
| 8   | `carbide status` shows MCP info                            | ✅     | Displays MCP endpoint URL and CLI install state.                                                           |

**Tests:** 5 CLI tests pass (2 new: stdio entry format, cli_installed check), 11 server MCP setup tests pass (2 new: stdio entry format, cli_installed). 2890/2891 TS tests pass (1 pre-existing failure).

**Note:** Phase 4c items (CLI polish) were folded into this phase as planned.

---

## Phase 5: carbide-lite Rebase

**Source:** `2026-04-06_branch_ancestry_and_merge_order.md` → "Phase 4 — Integrate carbide-lite"
**Depends on:** Phases 1-4 complete (main is stable with all features)

```bash
git rebase main carbide-lite
```

Expect ~10-15 conflicts concentrated in `create_app_context.ts`, `reactors/index.ts`, `app/mod.rs`, `Cargo.toml`. Pattern: new features go into full entrypoint path, lite path unchanged, new Rust modules gated behind `#[cfg(not(feature = "lite"))]`.

---

## Ordering Summary

```
Phase 1: Merge feat/extended-tools into main           ← do first, unblocks everything
  │
  ├─ Phase 2a: Terminal bug fixes                      ← high impact, independent
  ├─ Phase 2b: Floating toolbar fixes                  ← high impact, independent
  │
  ├─ Phase 3a: Extract shared service wrappers         ← biggest tech debt item
  ├─ Phase 3b: DRY fixes                               ← small, can parallelize
  ├─ Phase 3c: Stdio cleanup (remove dead code)        ✅ DONE
  │
  ├─ Phase 4a: Streamable HTTP                         ✅ DONE
  ├─ Phase 4b: stdio CLI proxy                         ✅ DONE
  │
  ├─ (Optional) Merge feat/editor-drag-blocks          ← independent, can merge anytime
  │
  └─ Phase 5: carbide-lite rebase                      ← after main is stable
```

Phases 2a, 2b, 3a, 3b can all run in parallel. Phase 4 can start as soon as Phase 1 is done. Phase 5 waits for everything else. `feat/editor-drag-blocks` is independent — merge whenever you're comfortable with it.
