# Prompt: Generate Updated Unified Implementation Roadmap

**Date:** 2026-04-10
**Purpose:** Feed this document to Claude with access to the codebase to produce a new `carbide/2026-04-10_unified_implementation_roadmap.md` superseding `2026-04-05_unified_implementation_roadmap.md`.

---

## Context

The original unified roadmap (`2026-04-05_unified_implementation_roadmap.md`) organized 46 work units across 16 steps. As of 2026-04-10, 34 units are complete (Steps 1-9, 11-13). The remaining work is Steps 10, 14-16, plus new work that emerged since the original plan. The old document's structure and dependency graph are stale.

The work units tracker (`2026-04-05_conversation_work_units.md`) has been updated to reflect current status but the roadmap itself has not.

### Since-merged work (verified 2026-04-10)

The following items from the original prompt have been verified as **merged to main** and should be treated as completed:

- **feat/cli-sidecar-install** — CLI sidecar bundling + Install/Uninstall Settings UI (commits `49d4dc70`, `241acbb2`)
- **feat/cli-glow-open** — glow rendering, `edit`, `cat`, `search --paths-only`, `tags --filter`, exit codes, dynamic completions (commits `599097ea`, `f1176be6`)
- **feat/mcp-streamable-http** — HTTP transport, shared_ops extraction, DRY'd routes, stdio removal (+ `refactor/mcp-dry`, `refactor/shared-ops`, `refactor/stdio-cleanup` — all merged)
- **Editor bugs BUG-001–004** — paste, frontmatter, source editor fixes (commits `5c57eb38`, `ba045b43`). BUG-002B (undo history across tab switch) deferred by design
- **Terminal session bugs** — scrollback, cwd, toggle/close, respawn policy, flickering (commit `9d257152` + `fix/terminal-session-lifecycle`)
- **LSP startup reliability** — Waves 1–4 fully merged (typed status, provider extraction, diagnostics, vault safeguards)
- **Metadata link map (A4) + property/tag accessors** — `note_links` table, `get_note_links()`, `get_backlinks()`, property/tag enumeration all on main
- **Editor width `--editor-max-width`** — token standardized across themes (editor.css, theme-monolith.css, theme-command-deck.css)
- **Plugin error budget / rate limiting** — `plugin_error_tracker.ts` with auto-disable after 5 errors in 15s (commit `bed34b32`)

---

## Prompt

Read the following source documents, then produce a new unified implementation roadmap. The new roadmap should:

1. **Drop completed work.** Steps 1-9, 11-13 are done. Acknowledge them in a "Completed" summary section (one line per step with date range) but do not repeat their designs.

2. **Use the branch-aware merge strategy described below.** The remaining work comes from two sources — unmerged branch content (to hand-port) and new work (to implement fresh). The strategy prioritizes safety and efficiency by hand-porting onto fresh branches from main rather than rebasing the stale 26-commit lineage.

### Branch lineage (verified 2026-04-10)

`feat/plugin-hardening` (6 commits) → `feat/extended-tools` (20 more, 26 total vs main).

- `extended-tools` is a **child branch** of `plugin-hardening` (merge-base between them = `9e8c3268`, the tip of `plugin-hardening`). Both share merge-base `bba85e1e` with main.
- **Do NOT rebase or merge either branch.** Hand-port useful work onto fresh branches from current main. Archive both old branches when done.

#### Commit triage (what to port vs drop)

| Commits | Content | Disposition |
|---|---|---|
| `1f04cd0b` (10.1) | activation events + lazy loading (`on_startup_finished`, `on_file_type`, `vault_contains`) | **Hand-port `vault_contains` only** if needed (see Decisions). Skip `on_file_type`, `on_startup_finished` per corrected plan. |
| `0b4817a3` (10.2) | lifecycle hooks, RPC timeouts, rate limiting, error budget | **Hand-port safety logic only** (RPC timeouts, rate limiting, consecutive-error budget). Skip lifecycle protocol rewrite — it's broken on the branch (sends `{ type: "lifecycle" }` but SDK still listens for `method: "lifecycle.activate"`). Error budget burst thresholds already on main (`bed34b32`). |
| `b8edde58` (10.3) | textarea type, min/max, placeholder in settings schema | **Hand-port in full.** Do not cherry-pick (it depends on 10.1's `ports.ts` changes which we're partially skipping). |
| `3d061841` (11.1) | block_embeddings table + section embedding pipeline | **DROP — already on main** (`bfbd9e11` + subsequent fixes `143e6568`, `3c96a578`, `c3cfeb29`, etc.) |
| `f7aedc3c` (11.2) | block_semantic_similarity rule + find_similar_blocks | **DROP — already on main** (`67eeeb7d`) |
| `27247865` (12.1) | MCP Tier 2 tools (backlinks, outlinks, properties, references) | **Hand-port.** Main has Tier 1 + HTTP transport. These add new tool handlers. |
| `63b8bcb9` (12.2) | MCP Tier 3 tools (git_status, git_log, rename_note) + plugin MCP bridge | **Hand-port.** Plugin MCP bridge is the key new piece. |
| `3d0179b1` (12.3) | CLI git + reference commands + backend routes | **Hand-port.** Main has CLI sidecar + glow. These add new subcommands. |
| `48f0017c` (12.4) | CLI bases, tasks, dev commands + backend routes | **Hand-port.** More CLI subcommands. |
| `6bc50243` (12.5) | slash command contribution point for plugins | **Hand-port.** Depends on plugin MCP bridge (12.2). |
| `968750c9` | autostart workaround (wires to HTTP instead of broken stdio) | **DROP — stale.** Stdio was removed on main (`8680a491`). Autostart already uses HTTP. |
| `0874184f` | cargo lock update | **DROP.** |
| 4× checkpoint | WIP snapshots | **DROP.** |
| 6× `chore: mark unit N complete` | Tracker bookmarks | **DROP.** |

### Remaining work organized by phase

Organize all remaining work into these phases, in this order. Each phase should only begin after the previous phase's review gate passes. Within a phase, independent work units can run in parallel.

#### Phase A: Standalone fixes (no deps on unmerged work, can run in parallel)

1. **Editor width token refactor** — finish remaining work from `carbide/plans/editor-width-token-refactor.md`:
   - Expose `--source-editor-max-width` as CSS var in CodeMirror (token does not exist yet)
   - Verify/fix zen mode hardcoded width
   - ~1 hour, pure CSS/Svelte, zero risk

2. **Plugin hardening: safety hand-port** (from units 10.1–10.3) — use the **corrected** plan at `carbide/2026-04-10_plugin_hardening_safe_selective_merge_plan.md`:
   - RPC timeouts (`with_timeout`, `RpcTimeoutError`, timeout policy)
   - Per-plugin RPC rate limiting (`PluginRateLimiter`)
   - Consecutive-error budget (strengthen existing `PluginErrorTracker`)
   - Wire into `PluginService.handle_rpc()`: rate-limit check → timeout wrapper → record_success
   - Richer settings schema: `textarea` type, `min`/`max`/`placeholder`
   - **Do NOT port:** lifecycle protocol rewrite, `on_file_type`, `on_startup_finished`
   - Fresh branch from main. Hand-port only — do not cherry-pick.

3. **Plugin AI + Network RPC** — new plugin capabilities (no branch deps, fresh work):
   - `network.fetch` RPC namespace: host-side HTTP proxy via existing `reqwest` client
     - New `PluginRpcNetworkBackend` interface in `plugin_rpc_handler.ts`
     - New `plugin_http_fetch` Tauri command in Rust (uses `reqwest`)
     - `network:fetch` permission, manifest `allowed_origins` allowlist
     - SSRF protection: block localhost/private IPs in Rust before request fires
     - Request/response size limits, per-plugin rate limiting
   - `ai.execute` RPC namespace: bridge to existing `AiService` provider pipeline
     - New `PluginRpcAiBackend` interface in `plugin_rpc_handler.ts`
     - Invokes `AiService.execute()` → `ai_execute_cli` Tauri command (already exists)
     - `ai:execute` permission
     - Returns `{ output, success, error }` — no streaming (matches current pipeline design)
   - SDK surface: `carbide.network.fetch(url, opts)` and `carbide.ai.execute({ prompt, mode? })`
   - Update `carbide_plugin_api.js` and `docs/plugin_howto.md`

   **Review gate A:** Plugin tests pass, existing lifecycle SDK behavior intact, editor width works, **AI and network RPC respond correctly with permission checks**.

#### Phase B: Extended tools hand-port (depends on Phase A for plugin infra, fresh branches from main)

4. **MCP Tier 2/3 tools** (from units 12.1–12.2):
   - Tier 2: backlinks, outlinks, properties, references tool handlers
   - Tier 3: git_status, git_log, rename_note tool handlers
   - Plugin MCP bridge (allows plugins to expose MCP tools)
   - Depends on: main's MCP HTTP transport + shared_ops (already merged)

5. **CLI extended commands** (from units 12.3–12.4):
   - git + reference CLI subcommands + backend routes
   - bases, tasks, dev CLI subcommands + backend routes
   - Depends on: main's CLI sidecar + glow (already merged)

6. **Slash command contribution point** (from unit 12.5):
   - Plugin-contributed slash commands
   - Depends on: plugin MCP bridge from unit 4 above

   **Review gate B:** All MCP tools respond correctly, CLI subcommands work, slash commands from plugins render.

#### Phase C: Metadata + events (independent of Phase B, but ordered here to avoid overloading review)

7. **Metadata events — Phase C1 only** (`metadata-changed` event emission + plugin bridge):
   - Scoped from `carbide/2026-04-05_plan_metadata_api_surface.md`
   - db.rs must emit typed change events when metadata is updated
   - Plugin bridge must forward these to subscribed plugins
   - Phases A4 (link map) and D1 (property/tag accessors) already on main
   - Phase C2 (`listTags` alias) remains low priority — defer

   **Review gate C:** Metadata change events fire correctly, plugin bridge delivers them.

#### Phase D: New feature work (depends on Phases A–C)

8. **Graph visualization** (original Step 15):
   - Smart link edges, block-level edges
   - Design in `carbide/2026-04-02_smart_linking_and_block_notes.md`

9. **Power features** (original Step 16):
   - Bulk property ops, nested property flattening, plugin SDK extensions, CLI TUI
   - Design context in `carbide/mcp_native_gaps_plan.md` Phase 7

   **Review gate D:** Graph renders correctly, power features work end-to-end.

#### Phase E: Cleanup

10. **Archive stale branches:**
   - `feat/plugin-hardening` → `archive/feat/plugin-hardening`
   - `feat/extended-tools` → `archive/feat/extended-tools`
   - Only after all useful work has been hand-ported and verified on main

### Additional context for remaining work

- **Bug fix plans** — all verified as merged to main:
  - ~~`2026-04-08-editor-bugs-implementation-plan.md`~~ ✅ BUG-001–004 merged. Only BUG-002B (undo history across tab switch) deferred by design (architectural — requires not destroying CM on tab switch)
  - ~~`2026-04-06_LSP_IMPLEMENTATION_PLAN.md` / `2026-04-06_wave2_implementation_plan.md`~~ ✅ Waves 1–4 fully merged
  - ~~`2026-04-06_mcp_transports_terminal_plan.md`~~ ✅ All 4 bugs resolved + flickering fix merged

3. **Produce conversation-sized work units** for all remaining work, following the same format as `2026-04-05_conversation_work_units.md`:
   - One coherent concern per unit
   - ≤8 files touched
   - Ends with a commit
   - Tests included
   - Specify session type (Rust / TypeScript / Svelte / etc.)
   - Include `activeForm` descriptions

4. **Build a new dependency graph** showing what blocks what. Use the phase structure above as the skeleton — work units within a phase can have internal deps.

5. **Define new batches** for review gates (aligned with Phases A–E above).

6. **Flag any decisions needed:**
   - Whether `vault_contains` activation event should be hand-ported now or deferred (no known plugin needs it yet)
   - Whether BUG-002B (undo history across tab switch) should be tracked as future work
   - Whether Phase C (metadata events) should move before Phase B (it has no dependency on B and could run earlier if resources allow)
   - Whether the 4 checkpoint commits on `feat/extended-tools` contain any uncommitted WIP worth inspecting before archiving
   - Whether `network.fetch` should support streaming responses (SSE/chunked) or only return complete responses
   - Whether `ai.execute` should support the `api` transport kind (currently stubbed as unimplemented) or only CLI providers
   - Whether `allowed_origins` in the manifest should be required or optional (optional = allow all, with user consent via permission dialog)

---

## Source Documents to Read

Read these in order of priority:

| Document | What to extract |
|---|---|
| `carbide/2026-04-05_conversation_work_units.md` | Current completion status, remaining units, out-of-band work section |
| `carbide/2026-04-10_plugin_hardening_safe_selective_merge_plan.md` | Corrected plugin hardening scope (Steps 10.1-10.3) |
| `carbide/plans/editor-width-token-refactor.md` | Full plan for editor width tokenization |
| `carbide/2026-04-05_plan_metadata_api_surface.md` | Remaining metadata API gaps (Phases C1, A4, D1, C2) |
| `carbide/2026-04-05_unified_implementation_roadmap.md` | Original dependency graph, Steps 14-16 design |
| `carbide/mcp_native_gaps_plan.md` | Phase 7 power features, plugin system gaps 2a-2e context |
| `carbide/2026-04-02_smart_linking_and_block_notes.md` | Phase 5 graph visualization design |
| `carbide/TODO.md` | Remaining top-level tasks (rebrand, suffix-link index) |
| `src/lib/features/ai/` | Current AI service architecture, provider config, prompt builder |
| `src-tauri/src/features/ai/service.rs` | Rust-side AI CLI execution, provider presets |
| `src-tauri/src/features/pipeline/service.rs` | Pipeline execution (subprocess, timeout, output capture) |
| `carbide/2026-04-08-editor-bugs-implementation-plan.md` | ✅ Merged — reference only for BUG-002B deferral context |
| `carbide/2026-04-06_LSP_IMPLEMENTATION_PLAN.md` | ✅ Merged — no longer needed |
| `carbide/2026-04-06_mcp_transports_terminal_plan.md` | ✅ Merged — no longer needed |

Also verify against the actual codebase:
- Check `src/lib/features/plugin/` for current plugin system state
- Check `src/styles/theme-*.css` for current editor width token state
- Check `src-tauri/src/features/mcp/` for current MCP transport state
- Check `src-tauri/src/features/search/db.rs` for current metadata state
- Check `src/lib/features/ai/` for current AI service and provider abstraction
- Check `src-tauri/src/features/pipeline/` for subprocess execution infrastructure
- Check `src/lib/shared/ui/sandboxed_iframe.svelte` for current CSP (must remain `connect-src none`)

---

## Output Format

Produce a single markdown document (`carbide/2026-04-11_unified_implementation_roadmap.md`) with:

1. Header with date, status, supersedes note
2. Completed work summary (1 line per step)
3. Remaining work organized into new numbered steps
4. Dependency graph (ASCII)
5. Conversation-sized work units with checkboxes
6. Batch table with review gates
7. Decisions needed section
8. Summary table
