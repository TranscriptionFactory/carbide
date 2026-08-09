# Bloat Review — Features, Dependencies, Abstractions

**Date:** 2026-07-15
**Status:** Analysis complete
**Scope:** Comprehensive review of whether Carbide has become bloated. Four parallel investigations across feature overlap, dependency footprint, dead/orphaned code, and abstraction/complexity. No code was changed; this is findings + recommendations.
**Sources:** `~/src/carbide` (Tauri + Svelte 5 + ProseMirror). AGENTS.md's "0 users as of now" framing is the benchmark.

---

## 1. Executive summary

Carbide is **well-built but over-invested for its user count.** The architectural discipline (Ports + Adapters, layering lint, single dispatch surface, BDD testing) is real and verified — nothing is dead, orphaned, or scaffolded. What exists is *creeping over-investment*: ~155K LOC TypeScript + ~42K LOC Rust + ~87K LOC tests across 42 frontend / 24 Rust features, a 69-case plugin RPC host, dual editor engines, a second UI runtime, and a 6KLOC Rust MCP server — for an app with no shipping plugin ecosystem.

Net verdict: **not rot, but bloat.** The surface grows linearly with feature count (each new feature touches 3+ places in `create_app_context.ts`), the dependency tree pulls heavy renderers eagerly into the note-tab chunk, and the plugin/MCP/AI constellation consumes ~22% of the Rust backend for zero current consumers.

The biggest wins are **not** feature deletions — they're (a) pruning the speculative plugin/MCP/AI surface, (b) lazy-loading the eager heavy deps, (c) splitting three fat registration/UI files, and (d) a handful of product-direction calls (Yjs scaffolding, Excalidraw-as-second-runtime, citation-as-core).

### Surface at a glance

| Metric | Count | Notes |
|---|---|---|
| Frontend features (`src/lib/features/`) | 42 | Arch doc lists 15 canonical; 27 are post-doc additions, all live |
| Rust features (`src-tauri/src/features/`) | 24 | All registered in `mod.rs` AND `app/mod.rs` |
| Total TS+Svelte LOC | ~155K | Editor alone = 29K LOC (52 importers) |
| Total Rust LOC | ~42K | `mcp/` is the single largest Rust feature at 6K LOC |
| Test LOC | ~87K | 468 frontend test files; densest coverage = `reference/` (17 tests) |
| npm deps | ~60 | Includes pixi.js, xterm, mermaid, pdfjs, excalidraw + react, yjs, citation-js suite |

---

## 2. What was investigated

Four parallel subagents, each scoped to one bloat axis:

1. **Feature overlap & duplication** — per-feature importer counts, canonical-vs-actual list, cluster analysis (LSP sprawl, smart-vs-plain, AI/MCP/RAG, metadata trio, document-vs-reference, diagnostics-vs-lint).
2. **Dependency bloat** — every heavy npm dep, actual import sites, lazy vs eager, blast radius, dead deps, plugin-ization seams.
3. **Dead/orphaned/underused** — external importer counts for all 42 features, Rust registration, action-registry wiring, settings-catalog surface, test presence, last-touched dates.
4. **Abstraction & complexity** — fat-module deep-dives, layering-ceremony measurement, speculative-generality (single-impl ports, TODO markers, deferred-features-with-code), plugin/MCP proportionality, dual-editor-engine and React-in-Svelte assessments.

Full per-feature and per-dependency tables are preserved in the working notes; the synthesized findings appear below.

---

## 3. Findings, grouped by confidence

### A. Remove outright (dead / pure ceremony)

Low risk, no product decision required.

| # | What | Evidence | LOC |
|---|---|---|---|
| A1 | `pipeline_execute` Tauri command | Registered `src-tauri/src/app/mod.rs:184`, never invoked from frontend; the `pipeline` *module* is live (used internally by `features::ai`), only the IPC command is dead | ~1 |
| A2 | Dead JS deps: `svelte-themes` (0 import sites), `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-log` (0 TS imports, Rust-side only) | grep across `src/` returns empty | — |
| A3 | Empty plugin placeholders `html-strip`, `smart-templates`, `wiki-compiler` | manifest-only, 0 code files — advertise non-existent plugins in marketplace UI | ~60 |
| A4 | "STT removed" comment cruft across 7 hot files | `settings_dialog.svelte:21,47-52,169-180,4622-4641`, `create_app_context.ts:101,913,1433`, `editor_settings.ts`, `action_ids.ts:468`, `reactors/index.ts:53,432`, `create_prod_ports.ts:54` | ~80 |
| A5 | `smart_blocks/ports.ts` | phantom seam — port interface, no adapter file, 1 test ref | ~32 |
| A6 | `zotero_bbt/ports.ts` + elevate as `reference/adapters/` | single extension, single adapter, never faked in tests | ~12 |

### B. Merge / relocate (duplicative or mis-scoped)

Mechanical, low-risk, no feature loss.

| # | What | Why |
|---|---|---|
| B1 | Fold `lsp/` (932 LOC) into `markdown_lsp/` | Misleadingly named "generic LSP" but hard-coupled to markdown — `lsp/application/lsp_actions.ts:10` & `apply_workspace_edit_result.ts:6` import `MarkdownLspService`. `code_lsp/` doesn't import it at all. Highest bloat-per-effort win. |
| B2 | Demote `diagnostics/` (110 LOC, 21 importers, no Rust peer) to `shared/state/` | Shared diagnostic-aggregation store, not a vertical slice. Keeping it under `features/` invites scaffolding it as one. |
| B3 | Rename `smart_links` → `link_suggest`, `types` → `symbol_explorer` | Names collide with `links/` and TS's `types/` convention; unsearchable. Zero LOC change, clarity win. |

### C. Plugin/MCP/AI constellation — scope down hard

Biggest single over-investment: ~13K LOC TS + ~10K LOC Rust (~22% of backend) for "0 users."

| # | What | Evidence |
|---|---|---|
| C1 | Prune `plugin_rpc_handler.ts` (1371 LOC, 69 case arms, 16 namespaces) | VSCode-grade extension host surface. Audit `plugins/**/*.js` for the 4 *living* plugins' actual RPC calls; cut unused namespaces (likely `mcp`, `ai`, `export`, `render`, `sidecar`, `actions`). |
| C2 | Drop `mcp/http.rs` (852 LOC) MCP-over-HTTP transport | Confirm no consumer uses HTTP vs. CLI stdio. Likely ~850 Rust LOC removable. |
| C3 | `external_mcp` sidecar (621 LOC Rust) — provisional keep | Just shipped (TODO.md:107). Delete if no plugin references it within N months. |

**Shipped plugins reality check:** `plugins/` has 7 entries; 3 are empty manifest placeholders (A3). The living 4 are: auto-tag (152 LOC), html-to-markdown (772), slides/md-export (404 each). The marketplace UI ships `plugin_marketplace_browser.svelte` (194 LOC) + `plugin_marketplace_service.ts` (112 LOC) for a 4-plugin catalogue.

### D. Dependency bloat (bundle wins, no feature loss)

| # | What | Evidence |
|---|---|---|
| D1 | Shiki: lazy-load 31 language grammars (`shiki_highlighter.ts:8-38`) | Biggest static bloat in note-tab chunk; `editor/index.ts:46` value-exports them so `note_editor.svelte:11` pulls eagerly. |
| D2 | Graph: dynamic-import seam at `GraphPanel` / `GraphTabView` | d3-force + graph domain (3 static importers) lands in app-shell chunk via `workspace_layout.svelte:31`. Drop `optimizeDeps.include: ["d3-force"]` once isolated. |
| D3 | Move `editor/index.ts:46-55` value re-exports (shiki + `parse_to_mdast`) behind dynamic facade | Leaks the lazy-editor boundary — unified/remark pipeline loads before rich-text editor inits. |
| D4 | Lazy xterm in `terminal_session_view.svelte:3-5` | Mirrors already-lazy `tauri-pty`. ~250KB until terminal opens. |
| D5 | Lazy papaparse in `csv_viewer.svelte:2` (currently static) | ~50KB, only CSV tabs need it. |
| D6 | Consolidate `lucide-static` → `@lucide/svelte` (already a devDep) | 8 importers in `editor/adapters/`. |

### E. Needs a product decision

These are architectural bets that survived review on technical merit but warrant explicit go/no-go.

| # | What | Tradeoff |
|---|---|---|
| E1 | **Yjs + y-prosemirror** | No provider wired anywhere (`y-websocket`/`y-webrtc`/awareness = 0 hits). `multi_device_vault_sync_brainstorm.md:152` explicitly defers CRDT sync as a "large build" not pursued. Today it's an in-memory CRDT mirror of the ProseMirror doc with no transport — scaffolding, ~80KB. Remove or gate behind a flag. |
| E2 | **Excalidraw + React** | Already iframe-isolated (not in Svelte bundle) — justified by isolation. But it's a second UI runtime + `build:excalidraw` pipeline + `carbide-excalidraw://` protocol + 6 editor/canvas files. Highest-leverage architectural cut if canvas isn't on the critical path. |
| E3 | **citation-js suite** (4 deps, ~300KB) | Single seam (`citationjs_adapter.ts`) — strong plugin-ize candidate. Niche academic feature. |
| E4 | **`reference/` (3765 LOC)** | Two domains crammed in: citations library + linked-sources/PDF-indexing. Split into `reference_library_service` + `linked_sources_service` regardless; decide separately whether academic-citation is core or a power-user niche. |

### F. Fat modules — split, not remove

| File | LOC | Dominant source | Action |
|---|---|---|---|
| `settings_dialog.svelte` | 5546 | 15 categories inlined; 61 callback props threaded from `app_shell_dialogs.svelte` | Split into `features/settings/ui/panels/*.svelte` mirroring existing `ThemeSettings`/`HotkeysPanel`/`McpSettings`. Dialog shrinks to <500 LOC. |
| `create_app_context.ts` | 1526 | Linear-scaling ritual: every new feature touches ctor + `register_*_actions` + `base_action_input` + `workspace_edit_deps` | Introduce `FeatureModule.register(di)` table → ~300 LOC intrinsic. Per-feature ceremony moves into the feature's own `index.ts`. |
| `code_block_view_plugin.ts` | 1469 | 5 concerns in one NodeView (lang picker, copy, html-preview iframe, mermaid render/zoom/export, smart-blocks, resize) | Split into `code_block_{mermaid,html_preview,resize,picker}.ts`. Main class → ~400 LOC of composition. |
| `plugin_rpc_handler.ts` | 1371 | 69 case arms across 16 namespaces | See C1. |
| `workspace_layout.svelte` | 1565 | 8 sidebar-view kinds with near-identical `<Sidebar.Group>` boilerplate | Extract `<SidebarView kind=.../>` switch → layout file becomes "scaffold + routing," <600 LOC. |

---

## 4. What was NOT found

- **No orphaned features.** Minimum external importer count = `zotero_bbt` at 1, still wired. Every feature is reachable from `create_app_context`/`create_app_stores`/bootstrap/routes.
- **No scaffolds.** `TODO/FIXME` markers are clean (8 total, all in vendored `foliate-js/*`). Zero in Carbide-authored code.
- **No deferred-features-with-code.** Cross-referenced `carbide/TODO.md` "Deferred permanent" / "Open Decisions" sections — none are built yet. The `vault_contains` activation event, `network.fetch` streaming, and `ai.execute` transport are all deferred-and-absent.
- **Dual editor engines are deliberate.** ProseMirror (visual mode) + CodeMirror (source mode) are a toggleable mode pair, not a bridge fight. The architecture doc currently mentions only ProseMirror — add a "Editor modes" section so future maintainers don't mistake the duplication for cruft.

---

## 5. Recommended execution order

| Phase | Items | Effort | Risk | Commit boundary |
|---|---|---|---|---|
| 1 | **A1–A6** trivial cleanup | trivial | none | One commit |
| 2 | **B1–B3** merge/rename | mechanical | low | One PR |
| 3 | **D1–D6** lazy-loading | medium | low (zero feature loss) | One PR, measurable bundle win |
| 4 | **E1** Yjs remove-or-flag | small | product call | Needs decision |
| 5 | **C** plugin/MCP scope-down | medium | product call | Needs `plugins/**/*.js` RPC audit + direction on plugin system |
| 6 | **F** fat-module splits | independent | low | Anytime, one PR per file |
| 7 | **E2–E4** Excalidraw / citation / reference | large | product-direction | Needs decisions |

---

## 6. Open decisions for the maintainer

1. **Is the plugin system a near-term bet or deferred?** If deferred, C1 + C2 + C3 together remove ~1.5–2.5K LOC and convert the per-feature registration cost from O(features × 3 files) to O(features × 1 file). If near-term, keep the surface but freeze new namespaces until a shipping plugin needs them.
2. **Is canvas/Excalidraw core?** If not, dropping it removes React + react-dom + `@types/react*` + `@vitejs/plugin-react` + `@excalidraw/excalidraw` + the `build:excalidraw` pipeline + the custom protocol + 6 editor/canvas files. The biggest architectural leverage available.
3. **Is academic citation core or a power-user niche?** If niche, plugin-ize the citation-js adapter (single-file seam) and gate the `reference` UI behind a setting.
4. **Is real-time sync still on the roadmap?** If not, Yjs + y-prosemirror is dead weight (E1).
5. **Does the README/architecture doc need updating?** The feature table in `docs/architecture.md` lists 15 canonical features; 27 more are now live — the doc is stale, not the features.

---

## 7. Architecture doc drift (action item regardless of decisions above)

`docs/architecture.md` should be updated to reflect:
- The actual 42-feature surface (or at least the active core + extension split).
- The ProseMirror + CodeMirror dual-engine editor model (currently only ProseMirror is mentioned).
- The Excalidraw iframe-isolation pattern (currently undocumented).
- The plugin RPC namespace surface (if the plugin system is retained).

This is documentation hygiene, not bloat reduction — but stale docs are how future maintainers mistake deliberate design for cruft.