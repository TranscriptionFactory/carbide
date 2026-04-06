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
  ├─ feat/extended-tools  ←  76 commits (Steps 1-12, full feature stack)
  │     includes: feat/mcp-stdio → feat/metadata-headings-cmd → feat/metadata-foundations
  │       → feat/metadata-enrichment → feat/smart-linking → feat/http-cli
  │       → feat/metadata-file-cache → feat/plugin-hardening → feat/block-embeddings
  └─ feat/editor-drag-blocks  ←  9 commits (Step 13, independent, branched from d6a47599)
```

---

## Decision: Partial Merge at `feat/metadata-file-cache` (Step 9)

The audit flagged Steps 10-12 as problematic:
- **Step 10 (plugin hardening):** Premature — rate limiting, error budgets, activation events for 0 plugins
- **Step 11 (block embeddings):** O(n*m) brute-force KNN, disabled by default, high infrastructure cost
- **Step 12 (extended tools):** Brings useful MCP/CLI tools but also 1,489 lines of duplicated `cli_routes.rs` + slash commands that depend on plugin hardening

**Merge through Step 9. Archive Steps 10-12 for reference. Reimplement the useful parts of Step 12 later with a proper shared service layer.**

| What you get (Steps 1-9, 52 commits, +9,614 lines) | What you defer |
|-----------------------------------------------------|----------------|
| MCP server (types, router, JSON-RPC dispatch) | Plugin hardening (rate limiting, error budgets, activation events) |
| Metadata foundations (type inference, frontmatter writer, property enumeration) | Block embeddings (schema, KNN, block_semantic_similarity rule) |
| Backend enrichment (ctime_ms, note_links table) | Tier 2/3 MCP tools (backlinks, git, references, properties) |
| Smart links engine + UI (7 rules, weighted scoring, provenance) | Extended CLI commands (git, references, bases, tasks, dev) |
| HTTP server + CLI binary + auto-setup | Slash command contribution point |
| Composite getFileCache endpoint | 1,489-line `cli_routes.rs` duplication |

---

## Phase 1: Merge Steps 1-9 + Cherry-Pick Docs

### 1a. Merge

```bash
# 1. Ensure clean
git status

# 2. Merge through Step 9
git checkout main
git merge feat/metadata-file-cache -m "$(cat <<'EOF'
Merge Steps 1-9: MCP server, metadata, smart links, HTTP/CLI, getFileCache

Steps merged:
  1. MCP stdio server + Tier 1 tools (notes CRUD, search, metadata, vault)
  2. Headings Tauri command
  3. Metadata foundations (type inference, frontmatter writer, property enumeration)
  4. Backend enrichment (ctime_ms, note_links table)
  5-6. Smart links engine (7 rules, weighted scoring, provenance UI)
  7-8. HTTP server, CLI binary, auto-setup for Claude Desktop/Code
  9. Composite getFileCache endpoint

Steps 10-12 deferred (plugin hardening, block embeddings, extended tools).
See carbide/2026-04-06_extended_tools_branch_audit.md for rationale.
EOF
)"

# 3. Verify
pnpm check && pnpm lint && pnpm test
cd src-tauri && cargo check && cd ..
```

### 1b. Cherry-pick documents from this session

Three checkpoint commits on `feat/extended-tools` contain planning docs created during this review. These docs are relevant regardless of which code ships.

```bash
# Cherry-pick the three doc checkpoints (docs only, no code conflicts)
git cherry-pick ff7fb7b1 --no-commit  # mcp_transports_terminal_plan.md + conversation log
git cherry-pick c09e9a89 --no-commit  # audit, ancestry, toolbar review, merge plan
git cherry-pick 63f15c05 --no-commit  # merge plan updates

# Review what's staged — should be only carbide/*.md files
# Remove conversation-2026-04-06-155756.md if present (ephemeral, shouldn't be committed)
git reset HEAD conversation-2026-04-06-155756.md 2>/dev/null
git checkout -- conversation-2026-04-06-155756.md 2>/dev/null

# Commit as a single docs commit
git commit -m "docs: add planning documents from branch audit and stabilization review"
```

If cherry-pick conflicts on `carbide/2026-04-05_conversation_work_units.md` (the checkbox file was updated by Steps 10-12), resolve by keeping the Step 9 version (checkboxes through 9.1 checked).

### 1c. Archive discarded branches

```bash
# Tag for reference
git tag archive/plugin-hardening feat/plugin-hardening
git tag archive/block-embeddings feat/block-embeddings
git tag archive/extended-tools feat/extended-tools

# Delete the branch refs
git branch -D feat/plugin-hardening feat/block-embeddings feat/extended-tools

# Cleanup merged stack branches
git branch -d feat/mcp-stdio feat/metadata-headings-cmd feat/metadata-foundations \
  feat/metadata-enrichment feat/smart-linking feat/http-cli feat/metadata-file-cache

# Cleanup stale planning branch
git branch -d feat/smart-linking-plan
```

### 1d. Decision: `feat/editor-drag-blocks`

Independent branch (9 commits, 15 files, +1,061 lines, all editor code). Does not interact with any audit concerns. Leave on branch — merge whenever you've reviewed the UX.

---

## Phase 2: Bug Fixes (High Impact, Small Effort)

Ship before any refactoring. These fix real user-facing bugs.

### 2a. Terminal Bugs — 1 session, ~6 files

**Source:** `2026-04-06_mcp_transports_terminal_plan.md` → "Terminal Bug Fixes"
**Branch:** `fix/terminal-session-lifecycle`

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | Tab switch destroys xterm instance, loses scrollback | `terminal_panel_content.svelte:155-159` | Remove `{#if}` guard — render all sessions, control visibility via `active` prop |
| 2 | `fixed_cwd` ignores stored session cwd | `terminal_session_view.svelte:39-44` | Read `session?.cwd` instead of always using vault path |
| 3 | Toggle/close kills all PTY processes | `terminal_actions.ts`, `terminal_store.svelte.ts` | Split `close()` into `hide()` (panel only) and `reset()` (destructive) |
| 4 | `reconcile_session` respawns manual-policy sessions | `terminal_service.ts:202-216` | Check `respawn_policy` before killing process |

### 2b. Floating Toolbar Fixes — 1 session, ~4 files

**Source:** `2026-04-06_floating_toolbar_review.md`
**Branch:** `fix/formatting-toolbar`

| # | Fix | Severity | Approach |
|---|-----|----------|----------|
| 1 | Strip `on_select` mode + all floating positioning code | High | Remove `create_anchor`, `backdrop_el`, `compute_floating_position`, the entire `on_select` branch |
| 2 | Fix stale view capture in Svelte mount | High | Pass `() => toolbar_view` getter instead of `view` directly |
| 3 | Use `wrapIn` for blockquote | Medium | Replace `setBlockType(blockquote)` with `wrapIn(blockquote)` |
| 4 | Use `wrapInList` for bullet/ordered lists | Medium | Replace manual list construction with `wrapInList` from prosemirror-schema-list |
| 5 | Replace `prompt()` with command event pattern | Medium | Gate link/image behind `is_command_available: false` until async input UI built |
| 6 | Remove `on_select` from `ToolbarVisibility` type | Cleanup | Remove the enum value, update settings type |

---

## Phase 3: Audit Refactoring

**Source:** `2026-04-06_extended_tools_branch_audit.md` → "Refactoring Roadmap"

Since we merged only through Step 9, some audit items no longer apply (plugin hardening, block embeddings, slash commands were not merged). Remaining items:

### 3a. DRY fixes — `refactor/mcp-dry`

Small, low-risk:
- Extract `prop()` helper to `tools/mod.rs` (copy-pasted in 7 tool modules)
- Extract `VaultArgs` to `tools/mod.rs` (duplicated in multiple modules)
- Remove unused `SmartLinkRule.config` field from Rust types + TS types
- Consolidate `HttpServerState` three mutexes → single `Arc<Mutex<ServerInner>>`

### 3b. Stdio transport cleanup — `refactor/stdio-cleanup`

The in-process stdio transport (`server.rs`, `transport.rs`) is unreachable from the app — the frontend calls `http_server_*` commands. The CLI proxy approach (Phase 4b) makes in-process stdio unnecessary.

- Remove `McpState`, `server.rs`, `transport.rs` (~340 lines)
- Remove unreachable `mcp_start`/`mcp_stop`/`mcp_status` Tauri commands from `app/mod.rs`

### 3c. Shared service wrappers — `refactor/shared-ops`

**Do this when reimplementing extended CLI/MCP tools (Phase 4c), not before.** Since the 1,489-line `cli_routes.rs` was not merged, build the shared layer from scratch as the foundation for new routes.

Create `src-tauri/src/features/mcp/shared_ops.rs`:
- Vault path resolution + service call wrappers returning structured results
- MCP tools format as `ToolResult` text; CLI routes return as JSON
- Axum auth middleware on the CLI router from the start

---

## Phase 4: MCP Transport + Extended Tools (Reimplemented Clean)

**Source:** `2026-04-06_mcp_transports_terminal_plan.md` + archived `feat/extended-tools` as reference

### 4a. Streamable HTTP — `feat/mcp-streamable-http`

Single Rust session. Adds SSE response support to existing `/mcp` POST handler:
- Branch on `Accept: text/event-stream` header
- `Mcp-Session-Id` header on initialize
- GET `/mcp` stub (empty SSE stream for spec compliance)
- Update Desktop config to include `"type": "http"`

### 4b. stdio via CLI proxy — `feat/mcp-stdio-proxy`

Single Rust session. Adds `carbide mcp` subcommand:
- Reads stdin line-by-line, POSTs to `/mcp`, writes response to stdout
- `ensure_running_with_timeout` extraction (30s for cold launch)
- Update Desktop setup to write stdio config (`"command": "/usr/local/bin/carbide", "args": ["mcp"]`)
- Add `carbide setup desktop` / `carbide setup code` CLI commands
- `carbide status` shows MCP server address + CLI install state

### 4c. Extended MCP/CLI tools (reimplemented) — `feat/extended-tools-v2`

Reimplement the useful parts of archived Step 12, built on `shared_ops` from Phase 3c:

**MCP tools to reimplement** (reference: `archive/extended-tools` `tools/` modules):
- `get_backlinks`, `get_outgoing_links` — graph queries
- `list_properties`, `query_notes_by_property` — property queries
- `list_references`, `search_references` — citation lookups
- `git_status`, `git_log` — git tools
- `rename_note`

**CLI routes to reimplement** (via `shared_ops`, with auth middleware):
- `/cli/git/*` — git operations
- `/cli/references/*` — citation operations
- `/cli/bases/*` — structured property queries

**Skip for now:**
- Slash command contribution point (no plugins yet)
- Plugin MCP bridge (`mcp.*` RPC namespace — no plugins yet)
- `/cli/tasks/*`, `/cli/dev/*` — low priority

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
Phase 1: Merge feat/metadata-file-cache (Steps 1-9)   ← do first
  │       + cherry-pick docs + archive Steps 10-12
  │
  ├─ Phase 2a: Terminal bug fixes                      ← high impact, independent
  ├─ Phase 2b: Floating toolbar fixes                  ← high impact, independent
  │
  ├─ Phase 3a: DRY fixes                               ← small, can parallelize with 2
  ├─ Phase 3b: Stdio cleanup (remove dead code)         ← small, unblocks 4b
  │
  ├─ Phase 4a: Streamable HTTP                          ← independent
  ├─ Phase 4b: stdio CLI proxy                          ← depends on 4a
  ├─ Phase 4c: Extended tools v2 (with shared_ops)      ← depends on 3c (built during 4c)
  │
  ├─ (Optional) Merge feat/editor-drag-blocks           ← independent, anytime
  │
  └─ Phase 5: carbide-lite rebase                       ← after main is stable
```

Phases 2 and 3a/3b can all run in parallel. Phase 4 can start as soon as Phase 1 is done. Phase 5 waits for everything else.
