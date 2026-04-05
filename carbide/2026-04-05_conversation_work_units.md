# Conversation-Sized Work Units

**Date:** 2026-04-05
**Companion to:** `2026-04-05_unified_implementation_roadmap.md`

---

## Sizing Principles

Each unit is scoped for a single Claude Code Opus 4.6 conversation (~1-4 hours of focused work). Sizing criteria:

- **One coherent concern per conversation.** Rust backend vs TypeScript frontend are usually separate sessions.
- **Ends with a commit.** Every unit produces passing `pnpm check && pnpm lint && pnpm test && cargo check`.
- **≤8 files touched.** Beyond that, context quality degrades.
- **≤1 major decision.** If a unit requires multiple design choices, split it.
- **Tests included.** Each unit ships with tests for the code it introduces.
- **Branch per step.** Units within a step share a branch (e.g., `feat/mcp-stdio`). Merge to `main` when the step is complete.

---

## Step 1: MCP Stdio Server + Tier 1 Tools

**Branch:** `feat/mcp-stdio`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **1.1** | Module scaffold + MCP types + JSON-RPC 2.0 message parsing | `mcp/mod.rs`, `mcp/types.rs`, `mcp/router.rs` + tests | Define `McpRequest`, `McpResponse`, `ToolDefinition`, `McpError`. JSON-RPC 2.0 parse/serialize. No transport yet — pure types + router dispatch skeleton |
| **1.2** | Stdio transport + server lifecycle | `mcp/server.rs`, `mcp/transport.rs`, Tauri command wiring | Stdin/stdout line-delimited JSON-RPC. `mcp_start`/`mcp_stop`/`mcp_status` Tauri commands. `McpState` managed state. Test with `echo '{"jsonrpc":"2.0",...}' \| cargo run` |
| **1.3** | Tier 1 tools — notes CRUD | `mcp/tools/mod.rs`, `mcp/tools/notes.rs` | `list_notes`, `read_note`, `create_note`, `update_note`, `delete_note`. Each tool calls existing service functions. Tool definitions (name, description, input schema) |
| **1.4** | Tier 1 tools — search + metadata + vault | `mcp/tools/search.rs`, `mcp/tools/metadata.rs`, `mcp/tools/vault.rs` | `search_notes` (wraps OmniFind), `get_note_metadata`, `list_vaults`. Resource definitions (vault structure, config, properties) |
| **1.5** | Frontend MCP feature + settings toggle | `src/lib/features/mcp/` scaffold, settings UI | `McpStore` (status/config), settings panel toggle, autostart reactor. Thin — backend does the work |

---

## Step 2: Headings Tauri Command

**Branch:** `feat/metadata-headings-cmd` (or commit directly to `main` — trivial)

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **2.1** | Add `get_note_headings` Tauri command | `service.rs` (add command), `db.rs` (expose existing query) | Single conversation. Wrap existing query at `db.rs:3237`. Add specta annotation. Wire in Tauri app builder. Test |

---

## Step 3: Metadata Foundations

**Branch:** `feat/metadata-foundations`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **3.1** | Property type inference | `infer_property_type.ts` (new), test file, update `extract_metadata.ts` call site | Pure function + exhaustive unit tests (dates, booleans, numbers, arrays, tags, edge cases). Update SQLite `property_type` semantics. **TypeScript session** |
| **3.2** | Frontmatter writer | `frontmatter_writer.ts` (new), test file | `update/add/remove_frontmatter_property()`, `ensure_frontmatter()`. Heavy on edge-case tests (comments, indentation, quoting, array formatting, empty frontmatter). **TypeScript session** — this is the trickiest unit in Step 3 |
| **3.3** | Property enumeration with types + unique values | `db.rs` (extend `list_all_properties` query), `model.rs` (update `PropertyInfo`), frontend type updates | SQL extension to return top-N unique values. Update frontend `BasesPort`/adapter. **Rust + TS session** |

---

## Step 4: Backend Enrichment

**Branch:** `feat/metadata-enrichment`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **4.1** | `ctime_ms` capture | `model.rs` (add field), `db.rs` (schema + indexing), frontend `NoteMeta` propagation | Add column, populate from `fs::metadata().created()`, fallback to `mtime_ms` on Linux. **Rust session** with small TS type update |
| **4.2** | Populate `note_links` table | `db.rs` (INSERT in `upsert_note`), `service.rs` (new Tauri command `get_note_links`) | Extend outlink extraction pass to capture link_text, link_type, section_heading, target_anchor. Resolve `outlinks` vs `note_links` dual-table question here. **Rust session** — decision-heavy, keep focused |

---

## Step 5: Smart Linking Phase 1

**Branch:** `feat/smart-linking`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **5.1** | Rust backend — rule types + config persistence + SQL rule execution | `src-tauri/src/features/smart_links/` (new module) | Tauri commands: `smart_links_load_rules`, `smart_links_save_rules`, `smart_links_compute_suggestions`. SQL queries for `same_day`, `shared_tag`, `shared_property`. Config as JSON in `.carbide/smart-links/rules.json`. **Rust session** |
| **5.2** | TypeScript frontend — store + service + port extension + LinksService integration | `src/lib/features/smart_links/` (new), extend `SearchPort`, update `LinksService` | `SmartLinksStore`, `SmartLinksService`, extend `SuggestedLink` type with provenance. Wire `load_suggested_links()` to union explicit + smart suggestions. **TypeScript session** |
| **5.3** | UI — rule configuration + provenance display | Settings UI for rule toggles/weights, provenance chips in Suggested Links panel | Reuse shadcn toggle/slider components. Show which rules triggered each suggestion. **Svelte/UI session** |

---

## Step 6: Smart Linking Phase 2

**Branch:** `feat/smart-linking` (continue)

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **6.1** | Semantic rule wiring + scoring engine | Rust: add `semantic_similarity` rule execution (call `find_similar_notes` directly), `title_overlap`, `shared_outlinks` queries. Scoring: weighted aggregation, dedup, sort | **Rust session**. Key constraint: call `knn_search`/`find_similar_notes()` directly, never hybrid search |
| **6.2** | Frontend scoring integration + tests | TS: update service to handle multi-rule results. Integration tests for weighted merge, dedup, ranking | **TypeScript session**. End-to-end test: multiple rules enabled, verify composite ranking |

---

## Step 7: HTTP Server + CLI Binary

**Branch:** `feat/http-cli`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **7.1** | Axum server scaffold + auth middleware + health endpoint | `mcp/transport.rs` (extend) or new `http/` module, `auth.rs` | Axum server started from Tauri setup. Bearer token from `~/.carbide/mcp-token`. `GET /health` returns status. CORS localhost-only. **Rust session** |
| **7.2** | `/mcp` JSON-RPC route | HTTP route handler that delegates to existing MCP router | Thin adapter — same tool dispatch as stdio. Test with curl. **Rust session** (small, can combine with 7.1 if time allows) |
| **7.3** | `/cli/*` REST routes — read operations | `POST /cli/read`, `/cli/search`, `/cli/files`, `/cli/tags`, `/cli/properties`, `/cli/outline`, `/cli/vault`, `/cli/vaults`, `/cli/status` | Each route is ~5-10 lines. Accepts JSON body, returns JSON. **Rust session** |
| **7.4** | `/cli/*` REST routes — write operations | `POST /cli/create`, `/cli/write`, `/cli/append`, `/cli/prepend`, `/cli/rename`, `/cli/move`, `/cli/delete` | Same pattern as 7.3. **Rust session** (can combine with 7.3 if routes are thin enough) |
| **7.5** | CLI crate scaffold + core read commands | `src-tauri/crates/carbide-cli/` — `main.rs`, `client.rs`, `auth.rs`, `vault.rs`, `format.rs`, `commands/notes.rs`, `commands/search.rs` | Clap derive API. `carbide read`, `carbide search`, `carbide files`, `carbide tags`, `carbide outline`. Output formatting (plain text + `--json`). **Rust session** |
| **7.6** | CLI write + vault + general commands | `commands/vault.rs`, `commands/metadata.rs`, `commands/general.rs`, `launch.rs` | `carbide create/write/append/rename/move/delete`, `carbide vault/vaults/vault:open`, `carbide help/version/status`. App launch detection (check `/health`, launch if down, poll). **Rust session** |

---

## Step 8: Auto-Setup + Shell Integration

**Branch:** `feat/http-cli` (continue) or `feat/auto-setup`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **8.1** | Claude Desktop/Code auto-config + settings UI | `mcp/setup.rs`, `.mcp.json` generation, settings panel updates | Write/merge `claude_desktop_config.json`. Generate `.mcp.json` in vault root. Settings UI: auto-setup button, token regen, connection status. **Rust + Svelte session** |
| **8.2** | CLI PATH registration + shell completions | `launch.rs` (symlink logic), clap completions generation, `--install-cli` command | Platform-specific symlink/PATH. Clap generates bash/zsh/fish completions. **Rust session** |

---

## Step 9: Composite getFileCache

**Branch:** `feat/metadata-file-cache`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **9.1** | `note_get_file_cache` Tauri command + plugin RPC wiring | `service.rs` (new command), `db.rs` (composite query), `plugin_rpc_handler.ts` (new method) | Assembly from existing tables. Single SQL transaction or multi-query. Wire as `metadata.getFileCache(path)`. Clean up dead `note_get_metadata` reference. **Rust + TS session** |

---

## Step 10: Plugin Hardening

**Branch:** `feat/plugin-hardening`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **10.1** | Activation events + lazy loading | Plugin service (`should_activate` pattern matching), manifest type update | `on_startup_finished`, `on_file_type:*`, `vault_contains:*`. Plugins not matching stay unloaded. **TypeScript session** |
| **10.2** | Lifecycle hooks + RPC timeouts + rate limiting | `plugin_host_adapter.ts`, plugin store | `activate`/`deactivate` postMessage protocol. `Promise.race` timeout wrapper. Sliding window rate limiter. Error budget counter (10 → auto-disable). **TypeScript session** |
| **10.3** | Richer settings schema | Setting type definitions, settings tab renderer | `textarea`, `min`/`max`, `placeholder`, `description`. **Svelte/UI session** (small, can combine with 10.2) |

---

## Step 11: Block Embeddings

**Branch:** `feat/block-embeddings`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **11.1** | `block_embeddings` table + embedding pipeline extension | `db.rs` (schema), `embeddings.rs` (iterate `note_sections`, embed above threshold), `vector_db.rs` (storage) | Size threshold: 20 words OR >10 lines. Reuse Snowflake Arctic Embed XS. Backfill during normal indexing. **Rust session** |
| **11.2** | `block_knn_search` + `block_semantic_similarity` smart link rule | `vector_db.rs` (new search function), smart_links module (new rule) | Brute-force linear scan (fine for MVP). Wire into smart link scoring. **Rust session** |

---

## Step 12: Extended MCP/CLI Tools

**Branch:** `feat/extended-tools`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **12.1** | MCP Tier 2 tools | `mcp/tools/` — backlinks, outlinks, references, properties, query_by_property | Each tool wraps existing service function. **Rust session** |
| **12.2** | MCP Tier 3 + plugin MCP bridge | `mcp/tools/` — git tools, rename. `plugin_rpc_handler.ts` — `mcp.*` namespace | Git tools wrap existing commands. Plugin bridge: `mcp.list_tools`, `mcp.call_tool`, `mcp.register_tool`. **Rust + TS session** |
| **12.3** | CLI git + reference commands | `commands/git.rs`, `commands/references.rs` | `git:status/commit/log/diff/push/pull/restore/init`, `references/reference:add/reference:search/reference:bbt`. **Rust session** |
| **12.4** | CLI bases + tasks + plugins + dev commands | `commands/bases.rs`, `commands/tasks.rs`, `commands/plugins.rs`, `commands/dev.rs` | Remaining CLI surface. **Rust session** |
| **12.5** | Slash command contribution point | Plugin manifest extension, ProseMirror slash command hook, RPC handler | `contributes.slash_commands` in manifest. Editor `/` menu integration. **TS + Svelte session** — most complex unit in Step 12 |

---

## Step 13: Editor Drag Handles

**Branch:** `feat/editor-drag-blocks`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **13.1** | Block detection ProseMirror plugin + drag handle UI | New ProseMirror plugin, gutter decoration | Detect block boundaries, render grip icon on hover for eligible blocks. **TypeScript/ProseMirror session** |
| **13.2** | Drag-and-drop implementation + markdown round-trip | Drop handler, content reordering, re-indexing trigger | Reorder updates markdown content. Verify AST round-trip preserves formatting. **TypeScript/ProseMirror session** |

---

## Step 14: Metadata Events + Link Resolution

**Branch:** `feat/metadata-events`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **14.1** | `metadata-changed` event emission + plugin bridge | Rust event emission on upsert/rename/delete, TS plugin bridge subscription | Tauri event system → plugin iframe forwarding. `events.on("metadata-changed", cb)` in plugin SDK. **Rust + TS session** |
| **14.2** | Resolved/unresolved link map + `getFirstLinkpathDest` with index | `db.rs` (link resolution query), `service.rs` (extend resolve commands) | Cross-reference `note_links.target` against `notes` table. Extend `resolve_note_link`/`resolve_wiki_link` with vault index search. **Rust session** |

---

## Step 15: Graph Visualization

**Branch:** `feat/graph-smart-links`

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **15.1** | Smart link edges in graph data model | Rust graph builder (add smart link edge type), TS graph types (`VaultGraphSnapshot`, `GraphNeighborhoodSnapshot`) | New edge type with provenance metadata. **Rust + TS session** |
| **15.2** | Rendering layer — dashed edges, hover provenance, section-level edges | D3/rendering updates, tooltip UI | Visual differentiation from explicit links. Block-level edges when embeddings exist. **Svelte/D3 session** |

---

## Step 16: Power Features

**Branch:** Per-feature branches

| Unit | Scope | Files | Notes |
|------|-------|-------|-------|
| **16.1** | Bulk property rename | Tauri command + frontmatter writer integration + UI confirmation dialog | Query matching notes → read → rewrite → write atomically → git checkpoint. **Rust + TS session** |
| **16.2** | Bulk property delete | Same pattern as 16.1 | Can combine with 16.1 if straightforward. **Rust + TS session** |
| **16.3** | Nested property flattening | `extract_metadata.ts` (flatten one level with dot notation), metadata panel display update | `author.name` indexing from nested YAML. Write-back preserves original structure. **TypeScript session** |
| **16.4** | Plugin SDK package | `@carbide/plugin-types` npm package, `create-carbide-plugin` template | RPC types, manifest schema, event types. Scaffold generator. **TypeScript session** |
| **16.5** | CLI TUI mode | `src-tauri/crates/carbide-cli/src/tui/` — ratatui or rustyline | Interactive mode with autocomplete, history, live results. **Rust session** — exploratory, may span multiple conversations |

---

## Summary

| Step | Units | Total Sessions |
|------|-------|----------------|
| 1. MCP Stdio | 5 | 5 |
| 2. Headings Cmd | 1 | 1 |
| 3. Metadata Foundations | 3 | 3 |
| 4. Backend Enrichment | 2 | 2 |
| 5. Smart Linking P1 | 3 | 3 |
| 6. Smart Linking P2 | 2 | 2 |
| 7. HTTP + CLI | 6 | 5-6 |
| 8. Auto-Setup | 2 | 2 |
| 9. getFileCache | 1 | 1 |
| 10. Plugin Hardening | 3 | 2-3 |
| 11. Block Embeddings | 2 | 2 |
| 12. Extended Tools | 5 | 4-5 |
| 13. Editor Drag | 2 | 2 |
| 14. Metadata Events | 2 | 2 |
| 15. Graph Viz | 2 | 2 |
| 16. Power Features | 5 | 5 |
| **Total** | **46** | **~43-46 sessions** |

Each session targets 1-4 hours. At 2-3 sessions/day, the full roadmap is ~15-23 working days of focused implementation. Steps 1-6 (MCP core + metadata + smart linking) are ~16 sessions / ~6-8 days — the critical path to a differentiated product.
