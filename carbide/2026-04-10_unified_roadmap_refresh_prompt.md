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

2. **Incorporate remaining roadmap work** (Steps 10, 14-16 from the original):
   - Step 10: Plugin Hardening — use the **corrected** plan at `carbide/2026-04-10_plugin_hardening_safe_selective_merge_plan.md`, not the original mcp_native_gaps_plan Phase 5. Key changes: hand-port only (no cherry-picks), skip lifecycle protocol rewrite, skip `on_file_type`/`on_startup_finished`. **Status: PARTIAL** — error budget/rate limiting merged; activation events (`on_startup_finished`, `on_file_type`, `vault_contains`) and `textarea` setting type still on `feat/plugin-hardening` (6 commits not on main).
   - Step 14: Metadata Events — **scoped down to Phase C1 only** (`metadata-changed` event emission + plugin bridge). Phases A4 (link map) and D1 (property/tag accessors) are already on main. Phase C2 (`listTags` alias) remains low priority.
   - Step 15: Graph Visualization (smart link edges, block-level edges) — NOT STARTED
   - Step 16: Power Features (bulk property ops, nested property flattening, plugin SDK, CLI TUI) — NOT STARTED

3. **Incorporate new work not in the original roadmap:**

   a. **Editor Width Token Refactor** (`carbide/plans/editor-width-token-refactor.md`) — **PARTIAL**
      - ~~Standardize `--editor-max-width` across all themes~~ ✅ Done on main
      - Expose `--source-editor-max-width` as CSS var in CodeMirror — NOT DONE (token does not exist yet)
      - Fix zen mode hardcoded width — NOT VERIFIED
      - Scoped down to ~1 hour remaining work

   b. **Unmerged branch stabilization** — one branch remains:
      - `feat/extended-tools` — 26 commits not on main. Contains: MCP Tier 2/3 tools (backlinks, outlinks, properties, references, git_status, git_log, rename_note), plugin MCP bridge, CLI git/reference/bases/tasks/dev commands, slash command contribution point. Has diverged significantly from main (includes stale autostart workaround). Needs rebase and selective merge review.
      - ~~`feat/mcp-streamable-http`~~ ✅ Merged
      - ~~`feat/cli-sidecar-install`~~ ✅ Merged
      - ~~`feat/cli-glow-open`~~ ✅ Merged

   c. **Metadata API remaining gaps** (from `carbide/2026-04-05_plan_metadata_api_surface.md`):
      - Phase C1: `metadata-changed` event emission + plugin bridge (= Step 14.1) — **NOT DONE** (db.rs does not emit typed change events when metadata is updated)
      - ~~Phase A4: Resolved/unresolved link map~~ ✅ Done — `note_links` table, `get_note_links()`, `get_backlinks()` on main
      - ~~Phase D1: `getFirstLinkpathDest` with vault index lookup~~ ✅ Done — property/tag accessors on main (verify if specific `getFirstLinkpathDest` wrapper is exposed to plugins)
      - Phase C2: Optional `metadata.listTags()` alias (low priority, functionality already exists as `search.tags()`)

   d. **Bug fix plans** — all verified as merged to main:
      - ~~`2026-04-08-editor-bugs-implementation-plan.md`~~ ✅ BUG-001–004 merged. Only BUG-002B (undo history across tab switch) deferred by design (architectural — requires not destroying CM on tab switch)
      - ~~`2026-04-06_LSP_IMPLEMENTATION_PLAN.md` / `2026-04-06_wave2_implementation_plan.md`~~ ✅ Waves 1–4 fully merged
      - ~~`2026-04-06_mcp_transports_terminal_plan.md`~~ ✅ All 4 bugs resolved + flickering fix merged

4. **Produce conversation-sized work units** for all remaining work, following the same format as `2026-04-05_conversation_work_units.md`:
   - One coherent concern per unit
   - ≤8 files touched
   - Ends with a commit
   - Tests included
   - Specify session type (Rust / TypeScript / Svelte / etc.)
   - Include `activeForm` descriptions

5. **Build a new dependency graph** showing what blocks what.

6. **Define new batches** for review gates.

7. **Flag any decisions needed** — e.g., whether `vault_contains` activation event is needed, whether to rebase `feat/extended-tools` (26 commits diverged) before or after new work, whether BUG-002B (undo history) should be tracked as future work.

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
| `carbide/2026-04-08-editor-bugs-implementation-plan.md` | ✅ Merged — reference only for BUG-002B deferral context |
| `carbide/2026-04-06_LSP_IMPLEMENTATION_PLAN.md` | ✅ Merged — no longer needed |
| `carbide/2026-04-06_mcp_transports_terminal_plan.md` | ✅ Merged — no longer needed |

Also verify against the actual codebase:
- Check `src/lib/features/plugin/` for current plugin system state
- Check `src/styles/theme-*.css` for current editor width token state
- Check `src-tauri/src/features/mcp/` for current MCP transport state
- Check `src-tauri/src/features/search/db.rs` for current metadata state

---

## Output Format

Produce a single markdown document (`carbide/2026-04-10_unified_implementation_roadmap.md`) with:

1. Header with date, status, supersedes note
2. Completed work summary (1 line per step)
3. Remaining work organized into new numbered steps
4. Dependency graph (ASCII)
5. Conversation-sized work units with checkboxes
6. Batch table with review gates
7. Decisions needed section
8. Summary table
