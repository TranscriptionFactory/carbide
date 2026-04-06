# Conversation-Sized Work Units

**Date:** 2026-04-05
**Companion to:** `2026-04-05_unified_implementation_roadmap.md`
**Progress:** 17 / 46 units complete

---

## How to Use This Document

This is a living checklist. Each unit `[ ]` becomes `[x]` when complete, with a date and commit hash. The **next unit to implement** is always the first unchecked `[ ]` box whose step has no unmet dependencies (see dependency graph in the roadmap).

When starting a session, say: _"Next step from `carbide/2026-04-05_conversation_work_units.md`"_ — Claude will read the doc, find the next unchecked unit, read the design reference, and begin.

When finishing a session, Claude updates this file: checks the box, adds date + commit, and notes anything the next unit needs to know.

### Headless execution

```bash
claude --dangerously-skip-permissions -p "$(cat carbide/implementation_prompt.md)"
```

Run repeatedly. Each invocation completes one unit, updates checkboxes, and the next invocation picks up where it left off. Inspect results between batches.

### Batches

Review between batches — check the branch, run the app, read commits. Each batch is a natural ship point.

| Batch | Steps | Units                           | Runs | Review gate                                                                                |
| ----- | ----- | ------------------------------- | ---- | ------------------------------------------------------------------------------------------ |
| **A** | 1–2   | 1.1–1.5, 2.1                    | 6    | MCP stdio works in Claude Desktop; headings command callable                               |
| **B** | 3–4   | 3.1–3.3, 4.1–4.2                | 5    | Type inference in bases; frontmatter edits round-trip; `ctime_ms` + `note_links` populated |
| **C** | 5–6   | 5.1–5.3, 6.1–6.2                | 5    | Suggested Links panel shows metadata + semantic rules with provenance                      |
| **D** | 7–8   | 7.1–7.6, 8.1–8.2                | 8    | `carbide read/search` works from terminal; Claude Desktop + Code auto-configured           |
| **E** | 9–10  | 9.1, 10.1–10.3                  | 4    | `getFileCache` composite endpoint; plugins lazy-load with timeouts                         |
| **F** | 11–12 | 11.1–11.2, 12.1–12.5            | 7    | Block-level suggestions; full MCP + CLI surface                                            |
| **G** | 13–15 | 13.1–13.2, 14.1–14.2, 15.1–15.2 | 6    | Drag blocks; live metadata events; graph shows smart link edges                            |
| **H** | 16    | 16.1–16.5                       | 5    | Bulk property ops; nested props; plugin SDK; CLI TUI                                       |

---

## Sizing Principles

- **One coherent concern per conversation.** Rust backend vs TypeScript frontend are usually separate sessions.
- **Ends with a commit.** Every unit produces passing `pnpm check && pnpm lint && pnpm test && cargo check`.
- **≤8 files touched.** Beyond that, context quality degrades. If scope creep pushes beyond this, stop and split.
- **≤1 major design decision.** If you hit a second, document it and ask.
- **Tests included.** Each unit ships with tests for the code it introduces.
- **Branch per step.** Units within a step share a branch. Merge to `main` when the step is complete.
- **Do not modify code outside the unit's scope** even if you spot issues — note them for a separate session.

---

## Step 1: MCP Stdio Server + Tier 1 Tools

**Branch:** `feat/mcp-stdio`
**Design ref:** `carbide/mcp_native_gaps_plan.md` → "Phase 1: Core MCP Server"
**Depends on:** nothing

- [x] **1.1** Module scaffold + MCP types + JSON-RPC 2.0 message parsing
  - Files: `src-tauri/src/features/mcp/mod.rs`, `types.rs`, `router.rs` + tests
  - Define `McpRequest`, `McpResponse`, `ToolDefinition`, `McpError`. JSON-RPC 2.0 parse/serialize. No transport yet — pure types + router dispatch skeleton.
  - _Completed 2026-04-05 `fc6decde`. Built full JSON-RPC 2.0 types (request/response/error with serde), MCP protocol types (InitializeResult, ToolDefinition, ToolCallParams, ToolResult with ContentBlock tagged enum, ResourceDefinition), and McpRouter with dispatch for initialize/ping/tools-list/tools-call/resources-list/resources-read. 25 tests. Tool definitions and dispatch are empty stubs — unit 1.3 populates them. Pre-existing lint failures in `build_command_context.ts` and 1 pre-existing test failure in document store — not related to MCP._

- [x] **1.2** Stdio transport + server lifecycle
  - Files: `mcp/server.rs`, `mcp/transport.rs`, Tauri command wiring
  - Stdin/stdout line-delimited JSON-RPC. `mcp_start`/`mcp_stop`/`mcp_status` Tauri commands. `McpState` managed state.
  - _Completed 2026-04-05 `b3926bcc`. Built generic async JSON-RPC stream transport over AsyncBufRead/AsyncWrite with tokio::select shutdown. McpState manages lifecycle (start_stdio/stop/get_status/shutdown). Three Tauri commands with specta annotations wired into app builder + shutdown hook. Added tokio `io-std` and `io-util` features. 10 transport tests. Pre-existing lint (build_command_context.ts layering) and test (document_service) failures unchanged. MCP types use snake_case serde — will need `rename_all = "camelCase"` before real MCP client integration (noted for future unit)._

- [x] **1.3** Tier 1 tools — notes CRUD
  - Files: `mcp/tools/mod.rs`, `mcp/tools/notes.rs`
  - `list_notes`, `read_note`, `create_note`, `update_note`, `delete_note`. Each calls existing service functions.
  - _Completed 2026-04-05 `0d3d8717`. Five MCP tool definitions with camelCase JSON schemas + dispatch handlers. Router uses `Option<AppHandle>` — `with_app()` for production, `new()` for tests. read_note/update_note bypass BufferManager for direct disk IO (MCP doesn't need editor buffer state). Made `build_note_meta` pub(crate). Added `#[serde(rename_all = "camelCase")]` on ToolDefinition for MCP protocol compliance. 8 new tool-specific tests + updated 2 existing tests. Pre-existing lint/test failures unchanged._

- [x] **1.4** Tier 1 tools — search + metadata + vault
  - Files: `mcp/tools/search.rs`, `mcp/tools/metadata.rs`, `mcp/tools/vault.rs`
  - `search_notes` (wraps OmniFind), `get_note_metadata`, `list_vaults`. Resource definitions.
  - _Completed 2026-04-05 `088ead37`. Three new tool modules: search_notes wraps index_search with configurable limit (default 20, max 100); get_note_metadata combines build_note_meta + get_note_stats + tags/properties from search DB into text output; list_vaults exposes vault registry. Router extended to 8 total tools. Made parse_args pub(crate) for cross-module reuse. 12 new tests + updated 2 existing tests for new tool count. Pre-existing lint/test failures unchanged._

- [x] **1.5** Frontend MCP feature + settings toggle
  - Files: `src/lib/features/mcp/` scaffold, settings UI
  - `McpStore` (status/config), settings panel toggle, autostart reactor. Thin — backend does the work.
  - _Completed 2026-04-05 `23335416`. Built full frontend MCP feature module: McpStore ($state status/transport), McpPort interface + TauriAdapter (start/stop/get_status), McpService (start/stop/refresh_status with error resilience), mcp_autostart reactor (starts MCP on vault open when mcp_enabled=true). Added mcp_enabled to EditorSettings (default true, global-only). Full DI wiring across app_ports, create_app_stores, create_app_context, create_prod_ports, reactors/index. 9 tests (6 service + 3 store). Settings dialog toggle UI deferred — can be added alongside Step 8 auto-setup panel. Pre-existing lint (build_command_context.ts layering) and test (document_service) failures unchanged._

---

## Step 2: Headings Tauri Command

**Branch:** `feat/metadata-headings-cmd` (or commit directly to `main`)
**Design ref:** `carbide/metadata_api_surface.md` → Phase A2
**Depends on:** nothing

- [x] **2.1** Add `get_note_headings` Tauri command
  - Files: `service.rs`, `db.rs` (expose existing query at `db.rs:3237`)
  - Wrap existing query. Add specta annotation. Wire in Tauri app builder. Test.
  - _Completed 2026-04-05 `87c9c9d1`. Added NoteHeading model type (level/text/line) to model.rs, get_note_headings query function to db.rs, specta-annotated Tauri command to service.rs, wired in app/mod.rs. 2 new tests (ordered results + empty for missing note). Pre-existing lint/test failures unchanged._

---

## Step 3: Metadata Foundations

**Branch:** `feat/metadata-foundations`
**Design ref:** `carbide/mcp_native_gaps_plan.md` → "Gap 3: Metadata System" (3a, 3b, 3c)
**Depends on:** nothing (benefits Step 1 but not blocked)

- [x] **3.1** Property type inference — **TypeScript session**
  - Files: `infer_property_type.ts` (new), test file, update `extract_metadata.ts` call site
  - Pure function + exhaustive unit tests (dates, booleans, numbers, arrays, tags, edge cases). Update SQLite `property_type` semantics.
  - _Completed 2026-04-05 `f3203b48`. Created `infer_property_type.ts` with 6-type system (string/number/boolean/date/array/tags). Uses ISO date regex, boolean string detection, Number.isFinite for numeric strings, short-string heuristic for tags vs array. Added `PropertyType` union type narrowing `NoteProperty.type`. Updated `extract_metadata.ts` to call inference. 38 new tests covering all types + edge cases (NaN, Infinity, null, objects, nested arrays). Updated 4 existing test files for new type expectations. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged. SQLite `property_type` column semantics now receive inferred types from frontend — backend schema unchanged (still string column)._

- [x] **3.2** Frontmatter writer — **TypeScript session**
  - Files: `frontmatter_writer.ts` (new), test file
  - `update/add/remove_frontmatter_property()`, `ensure_frontmatter()`. Heavy on edge-case tests (comments, indentation, quoting, array formatting, empty frontmatter). Trickiest unit in Step 3.
  - _Completed 2026-04-05 `b8db31b7`. Created `frontmatter_writer.ts` in `metadata/domain/` with 4 exported functions operating on raw markdown strings. Format-preserving: finds YAML block boundaries via regex, modifies only within delimiters. Quoting heuristic for special YAML chars (`:`, `#`, `{}`, `[]`, booleans, null). Arrays inline for ≤3 items, multi-line with `- ` prefix otherwise. Multi-line array values consumed correctly during update/remove. 53 tests covering: add/update/remove for all types, empty frontmatter, no frontmatter, sequential operations, round-trips, special chars, partial key matching, escaping. Exported via metadata feature index.ts. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **3.3** Property enumeration with types + unique values — **Rust + TS session**
  - Files: `db.rs` (extend `list_all_properties`), `model.rs` (update `PropertyInfo`), frontend type updates
  - SQL extension to return top-N unique values. Update frontend `BasesPort`/adapter.
  - _Completed 2026-04-05 `1c6ba082`. Added `unique_values: Option<Vec<String>>` to PropertyInfo in Rust model + TS interface. Extended `list_all_properties` with two additional prepared statements: count distinct values per key, fetch top-20 sorted values for properties with ≤100 distinct values (None for high-cardinality). Updated bases_panel built-in properties, BasesStore/BasesService/plugin_rpc_handler tests. 3 new Rust tests (low cardinality, high cardinality skip, cap at 20). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

---

## Step 4: Backend Enrichment

**Branch:** `feat/metadata-enrichment`
**Design ref:** `carbide/metadata_api_surface.md` → Phases A1, A3
**Depends on:** nothing (parallel-safe with Step 3)

- [x] **4.1** `ctime_ms` capture — **Rust session**
  - Files: `model.rs`, `db.rs` (schema + indexing), frontend `NoteMeta` propagation
  - Add column, populate from `fs::metadata().created()`, fallback to `mtime_ms` on Linux.
  - _Completed 2026-04-05 `917c541e`. Added `ctime_ms` field to `IndexNoteMeta` (Rust) and `NoteMeta` (TS). Extended `file_meta()` to return 3-tuple (mtime, ctime, size) using `fs::metadata().created()` with fallback to mtime when birth time unavailable (Linux). Added `ctime_ms INTEGER DEFAULT 0` column via schema migration. Updated all INSERT/SELECT statements in db.rs (upsert_note_simple, upsert_plain_content, query_bases, note_meta_with_stats_from_row). Propagated through 3 Tauri adapters, 6 source files, 55 test files. 2 new Rust tests (persistence round-trip + default-zero for legacy). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **4.2** Populate `note_links` table — **Rust session**
  - Files: `db.rs` (INSERT in `upsert_note`), `service.rs` (new `get_note_links` command)
  - Extend outlink extraction to capture link_text, link_type, section_heading, target_anchor. Resolve `outlinks` vs `note_links` dual-table question. Decision-heavy — keep focused.
  - _Completed 2026-04-05 `92d11f26`. Added wiki link extraction (wikilinks + embeds) in `extract_links()` during `upsert_note_simple`. Populates `note_links` table with target_path, link_text, link_type (wikilink/embed), section_heading (nearest heading above link), target_anchor. Also feeds extracted wikilink targets into outlinks table (previously empty for .md files). Added `NoteLink` model, `get_note_links` db query + specta Tauri command. Decision: kept `outlinks` as fast path for backlink/orphan queries — `note_links` is the rich version with metadata. 7 new tests. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

---

## Step 5: Smart Linking Phase 1

**Branch:** `feat/smart-linking`
**Design ref:** `carbide/2026-04-02_smart_linking_and_block_notes.md` → "Feature 1: Smart Linking", Phase 1
**Depends on:** Steps 3-4 make rules richer but existing tables suffice for MVP

- [x] **5.1** Rust backend — rule types + config persistence + SQL rule execution — **Rust session**
  - Files: `src-tauri/src/features/smart_links/` (new module)
  - Tauri commands: `smart_links_load_rules`, `smart_links_save_rules`, `smart_links_compute_suggestions`. SQL queries for `same_day`, `shared_tag`, `shared_property`. Config as JSON in `.carbide/smart-links/rules.json`.
  - _Completed 2026-04-05 `e7d91629`. New `smart_links` feature module with 3 files: `mod.rs` (types + Tauri commands), `config.rs` (JSON persistence with default-on-first-access), `rules.rs` (SQL execution engine). Types: SmartLinkRule, SmartLinkRuleGroup, SmartLinkRuleMatch, SmartLinkSuggestion — all with camelCase serde + specta. Rule config uses `HashMap<String, String>` (not serde_json::Value) for specta compatibility. Three SQL rules: `same_day` (mtime date match via SQLite date()), `shared_tag` (Jaccard overlap against note_inline_tags), `shared_property` (key-value pair match against note_properties). Weighted score aggregation with dedup by target path. Default rules: same_day(0.3), shared_tag(0.5), shared_property(0.4). 11 tests (8 rule + 3 config). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **5.2** TypeScript frontend — store + service + port extension + LinksService integration — **TypeScript session**
  - Files: `src/lib/features/smart_links/` (new), extend `SearchPort`, update `LinksService`
  - `SmartLinksStore`, `SmartLinksService`, extend `SuggestedLink` type with provenance. Wire `load_suggested_links()` to union explicit + smart suggestions.
  - _Completed 2026-04-05 `53e2c8fe`. New `smart_links` feature module with SmartLinksStore (rule groups state + mutations), SmartLinksService (load/save/toggle rules via SearchPort), 4 TS types matching Rust types (SmartLinkRule, SmartLinkRuleGroup, SmartLinkRuleMatch, SmartLinkSuggestion). Extended SearchPort with 3 methods (load_smart_link_rules, save_smart_link_rules, compute_smart_link_suggestions) + Tauri adapter implementation. Extended SuggestedLink with optional `rules` provenance array. LinksService.load_suggested_links now fires semantic + smart link queries in parallel via Promise.allSettled, merges by target path (dedup with combined provenance, max score), sorts by score. Graceful degradation: either source can fail independently. DI wired in create_app_stores + create_app_context. 28 new tests (8 store, 6 service, 14 links_service including merge/dedup/partial-failure). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **5.3** UI — rule configuration + provenance display — **Svelte/UI session**
  - Files: Settings UI for rule toggles/weights, provenance chips in Suggested Links panel
  - Reuse shadcn toggle/slider components. Show which rules triggered each suggestion.
  - _Completed 2026-04-05 `6a917bbe`. Added SmartLinksSettings component embedded in Semantic settings section with per-group toggles and per-rule enabled/weight controls (Switch + Slider). Rules auto-load on first settings visit. Provenance chips in SuggestedLinksSection show abbreviated rule labels (day/tag/prop/semantic/title/links) with hover tooltip showing raw score. Extracted format_rule.ts domain module with rule_chip_label, format_rule_name, rule_chip_title. 8 new tests. Component accesses services through context (matching citation_picker/task_list_item pattern). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

---

## Step 6: Smart Linking Phase 2

**Branch:** `feat/smart-linking` (continue)
**Design ref:** `carbide/2026-04-02_smart_linking_and_block_notes.md` → Phase 2
**Depends on:** Step 5

- [x] **6.1** Semantic rule wiring + scoring engine — **Rust session**
  - Rust: `semantic_similarity` rule (call `find_similar_notes` directly — never hybrid search), `title_overlap`, `shared_outlinks` queries. Weighted aggregation, dedup, sort.
  - _Completed 2026-04-05 `4ba5ba3f`. Three new rules in rules.rs: semantic_similarity calls vector_db::knn_search directly (converts distance to similarity, filters ≤0), title_overlap tokenizes titles and computes Jaccard similarity (0.15 threshold), shared_outlinks queries outlinks table for shared targets (Jaccard on outlink sets). Added "semantic" rule group to default_rules() with semantic_similarity enabled by default, title_overlap and shared_outlinks disabled. 8 new tests + 2 updated config/default_rules tests. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **6.2** Frontend scoring integration + tests — **TypeScript session**
  - TS: update service to handle multi-rule results. Integration tests for weighted merge, dedup, ranking.
  - _Completed 2026-04-05 `9b53fecd`. Extracted merge_suggestions from links_service.ts into links/domain/merge_suggestions.ts as a pure domain function. Added rule deduplication by ruleId (keeps higher rawScore) to handle semantic_similarity appearing from both find_similar_notes and the backend rules engine. 18 new tests in tests/unit/domain/merge_suggestions.test.ts covering: multi-rule results, path dedup, rule dedup, weighted ranking, threshold filtering, limit enforcement, mixed sources. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

---

## Step 7: HTTP Server + CLI Binary

**Branch:** `feat/http-cli`
**Design ref:** `carbide/mcp_native_gaps_plan.md` → Phase 3 + `carbide/cli_design.md`
**Depends on:** Step 1 (MCP server exists), Step 3 (enriched metadata)

- [x] **7.1** Axum server scaffold + auth middleware + health endpoint — **Rust session**
  - Files: `mcp/transport.rs` (extend) or new `http/` module, `auth.rs`
  - Axum on port 3457. Bearer token from `~/.carbide/mcp-token`. `GET /health`. CORS localhost-only.
  - _Completed 2026-04-05 `5d150d0e`. New `auth.rs` (token read/create/verify with constant-time comparison via `subtle`) and `http.rs` (Axum server scaffold with health endpoint, CORS localhost-only, HttpServerState lifecycle with graceful shutdown, 3 Tauri commands). Token auto-generated as 32 random bytes hex-encoded at `~/.carbide/mcp-token` with 0o600 permissions. HttpAppState holds AppHandle + token for authenticated routes (7.2+). Dependencies: axum 0.8, tower 0.5, tower-http 0.6, subtle 2, rand 0.8, hex 0.4. 14 tests (5 auth + 9 http). Wired into app/mod.rs (managed state, shutdown, invoke handler). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [ ] **7.2** `/mcp` JSON-RPC route — **Rust session**
  - Thin adapter — same tool dispatch as stdio. Test with curl. Small — can combine with 7.1.

- [ ] **7.3** `/cli/*` REST routes — read operations — **Rust session**
  - `POST /cli/read`, `/cli/search`, `/cli/files`, `/cli/tags`, `/cli/properties`, `/cli/outline`, `/cli/vault`, `/cli/vaults`, `/cli/status`. Each ~5-10 lines.

- [ ] **7.4** `/cli/*` REST routes — write operations — **Rust session**
  - `POST /cli/create`, `/cli/write`, `/cli/append`, `/cli/prepend`, `/cli/rename`, `/cli/move`, `/cli/delete`. Can combine with 7.3 if thin enough.

- [ ] **7.5** CLI crate scaffold + core read commands — **Rust session**
  - Files: `src-tauri/crates/carbide-cli/` — `main.rs`, `client.rs`, `auth.rs`, `vault.rs`, `format.rs`, `commands/notes.rs`, `commands/search.rs`
  - Clap derive API. `carbide read`, `carbide search`, `carbide files`, `carbide tags`, `carbide outline`. Plain text + `--json`.

- [ ] **7.6** CLI write + vault + general commands — **Rust session**
  - `carbide create/write/append/rename/move/delete`, `carbide vault/vaults/vault:open`, `carbide help/version/status`. App launch detection (check `/health`, launch if down, poll 10s).

---

## Step 8: Auto-Setup + Shell Integration

**Branch:** `feat/http-cli` (continue) or `feat/auto-setup`
**Design ref:** `carbide/mcp_native_gaps_plan.md` → Phase 4
**Depends on:** Step 7

- [ ] **8.1** Claude Desktop/Code auto-config + settings UI — **Rust + Svelte session**
  - `mcp/setup.rs`, `.mcp.json` generation, settings panel updates. Write/merge `claude_desktop_config.json`. Auto-setup button, token regen, connection status.

- [ ] **8.2** CLI PATH registration + shell completions — **Rust session**
  - Symlink logic, clap completions (bash/zsh/fish), `--install-cli` command.

---

## Step 9: Composite getFileCache

**Branch:** `feat/metadata-file-cache`
**Design ref:** `carbide/metadata_api_surface.md` → Phases B1, B2
**Depends on:** Steps 2, 3, 4

- [ ] **9.1** `note_get_file_cache` Tauri command + plugin RPC wiring — **Rust + TS session**
  - Files: `service.rs`, `db.rs` (composite query), `plugin_rpc_handler.ts`
  - Assembly from existing tables. Wire as `metadata.getFileCache(path)`. Clean up dead `note_get_metadata` reference.

---

## Step 10: Plugin Hardening

**Branch:** `feat/plugin-hardening`
**Design ref:** `carbide/mcp_native_gaps_plan.md` → Phase 5 (Gaps 2a-2e)
**Depends on:** nothing (independent)

- [ ] **10.1** Activation events + lazy loading — **TypeScript session**
  - Plugin service `should_activate` pattern matching, manifest type update. `on_startup_finished`, `on_file_type:*`, `vault_contains:*`.

- [ ] **10.2** Lifecycle hooks + RPC timeouts + rate limiting — **TypeScript session**
  - `plugin_host_adapter.ts`, plugin store. `activate`/`deactivate` protocol. `Promise.race` timeout. Sliding window rate limiter. Error budget (10 → auto-disable).

- [ ] **10.3** Richer settings schema — **Svelte/UI session**
  - `textarea`, `min`/`max`, `placeholder`, `description`. Small — can combine with 10.2.

---

## Step 11: Block Embeddings

**Branch:** `feat/block-embeddings`
**Design ref:** `carbide/2026-04-02_smart_linking_and_block_notes.md` → Phase 3
**Depends on:** Step 6 (smart linking engine)

- [ ] **11.1** `block_embeddings` table + embedding pipeline extension — **Rust session**
  - Files: `db.rs` (schema), `embeddings.rs`, `vector_db.rs`
  - Threshold: 20 words OR >10 lines. Reuse Snowflake Arctic Embed XS. Backfill during indexing.

- [ ] **11.2** `block_knn_search` + `block_semantic_similarity` smart link rule — **Rust session**
  - `vector_db.rs` (new search), smart_links module (new rule). Brute-force scan fine for MVP.

---

## Step 12: Extended MCP/CLI Tools

**Branch:** `feat/extended-tools`
**Design ref:** `carbide/mcp_native_gaps_plan.md` → Phase 6
**Depends on:** Steps 7-8

- [ ] **12.1** MCP Tier 2 tools — **Rust session**
  - `mcp/tools/` — backlinks, outlinks, references, properties, query_by_property.

- [ ] **12.2** MCP Tier 3 + plugin MCP bridge — **Rust + TS session**
  - Git tools, rename. `plugin_rpc_handler.ts` `mcp.*` namespace: `list_tools`, `call_tool`, `register_tool`.

- [ ] **12.3** CLI git + reference commands — **Rust session**
  - `git:status/commit/log/diff/push/pull/restore/init`, `references/reference:add/search/bbt`.

- [ ] **12.4** CLI bases + tasks + plugins + dev commands — **Rust session**
  - Remaining CLI surface.

- [ ] **12.5** Slash command contribution point — **TS + Svelte session**
  - Plugin manifest `contributes.slash_commands`. ProseMirror `/` menu hook. Most complex unit in Step 12.

---

## Step 13: Editor Drag Handles

**Branch:** `feat/editor-drag-blocks`
**Design ref:** `carbide/2026-04-02_smart_linking_and_block_notes.md` → Phase 4
**Depends on:** nothing

- [ ] **13.1** Block detection ProseMirror plugin + drag handle UI — **TypeScript/ProseMirror session**
  - Detect block boundaries, render grip icon on hover for eligible blocks.

- [ ] **13.2** Drag-and-drop + markdown round-trip — **TypeScript/ProseMirror session**
  - Drop handler, content reordering, re-indexing trigger. Verify AST round-trip.

---

## Step 14: Metadata Events + Link Resolution

**Branch:** `feat/metadata-events`
**Design ref:** `carbide/metadata_api_surface.md` → Phases C1, A4, D1
**Depends on:** Steps 4, 9

- [ ] **14.1** `metadata-changed` event emission + plugin bridge — **Rust + TS session**
  - Rust event on upsert/rename/delete → plugin iframe forwarding. `events.on("metadata-changed", cb)`.

- [ ] **14.2** Resolved/unresolved link map + `getFirstLinkpathDest` with index — **Rust session**
  - Cross-reference `note_links.target` against `notes`. Extend resolve commands with vault index search.

---

## Step 15: Graph Visualization

**Branch:** `feat/graph-smart-links`
**Design ref:** `carbide/2026-04-02_smart_linking_and_block_notes.md` → Phase 5
**Depends on:** Steps 5-6, 11

- [ ] **15.1** Smart link edges in graph data model — **Rust + TS session**
  - Rust graph builder (new edge type), TS graph types. Provenance metadata.

- [ ] **15.2** Rendering — dashed edges, hover provenance, section-level edges — **Svelte/D3 session**
  - Visual differentiation from explicit links. Block-level edges when embeddings exist.

---

## Step 16: Power Features

**Branch:** per-feature branches
**Design ref:** `carbide/mcp_native_gaps_plan.md` Phase 7 + `carbide/metadata_api_surface.md` 3d-3e
**Depends on:** all prior

- [ ] **16.1** Bulk property rename — **Rust + TS session**
  - Tauri command + frontmatter writer + UI confirmation + git checkpoint.

- [ ] **16.2** Bulk property delete — **Rust + TS session**
  - Same pattern as 16.1. Can combine if straightforward.

- [ ] **16.3** Nested property flattening — **TypeScript session**
  - `extract_metadata.ts` dot notation (`author.name`). Write-back preserves original structure.

- [ ] **16.4** Plugin SDK package — **TypeScript session**
  - `@carbide/plugin-types`, `create-carbide-plugin` template.

- [ ] **16.5** CLI TUI mode — **Rust session**
  - ratatui or rustyline. Exploratory — may span multiple conversations.

---

## Summary

| Step                    | Units  | Sessions   |
| ----------------------- | ------ | ---------- |
| 1. MCP Stdio            | 5      | 5          |
| 2. Headings Cmd         | 1      | 1          |
| 3. Metadata Foundations | 3      | 3          |
| 4. Backend Enrichment   | 2      | 2          |
| 5. Smart Linking P1     | 3      | 3          |
| 6. Smart Linking P2     | 2      | 2          |
| 7. HTTP + CLI           | 6      | 5-6        |
| 8. Auto-Setup           | 2      | 2          |
| 9. getFileCache         | 1      | 1          |
| 10. Plugin Hardening    | 3      | 2-3        |
| 11. Block Embeddings    | 2      | 2          |
| 12. Extended Tools      | 5      | 4-5        |
| 13. Editor Drag         | 2      | 2          |
| 14. Metadata Events     | 2      | 2          |
| 15. Graph Viz           | 2      | 2          |
| 16. Power Features      | 5      | 5          |
| **Total**               | **46** | **~43-46** |
