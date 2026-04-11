# Conversation-Sized Work Units

**Date:** 2026-04-05 (updated 2026-04-11)
**Companion to:** `2026-04-11_unified_implementation_roadmap.md`
**Progress:** 47 / 56 units complete (34 original + 13/22 new)

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

### Original batches (Steps 1–13)

| Batch | Steps | Units                           | Runs | Status      | Review gate                                                                                |
| ----- | ----- | ------------------------------- | ---- | ----------- | ------------------------------------------------------------------------------------------ |
| **A** | 1–2   | 1.1–1.5, 2.1                    | 6    | DONE        | MCP stdio works in Claude Desktop; headings command callable                               |
| **B** | 3–4   | 3.1–3.3, 4.1–4.2                | 5    | DONE        | Type inference in bases; frontmatter edits round-trip; `ctime_ms` + `note_links` populated |
| **C** | 5–6   | 5.1–5.3, 6.1–6.2                | 5    | DONE        | Suggested Links panel shows metadata + semantic rules with provenance                      |
| **D** | 7–8   | 7.1–7.6, 8.1–8.2                | 8    | DONE        | `carbide read/search` works from terminal; Claude Desktop + Code auto-configured           |
| **E** | 9     | 9.1                             | 1    | DONE        | `getFileCache` done                                                                        |
| **F** | 11–13 | 11.1–11.2, 12.1–12.5, 13.1–13.2 | 9    | DONE        | Block-level suggestions; full MCP + CLI surface; drag blocks                               |

### New batches (Phases A–E, from 2026-04-11 roadmap refresh)

| Batch  | Phase | Units                          | Sessions | Status      | Review gate                                                            |
| ------ | ----- | ------------------------------ | -------- | ----------- | ---------------------------------------------------------------------- |
| **G**  | A     | A1.1, A2.1–A2.3, A3.1–A3.3    | 7        | DONE        | Plugin tests pass, editor width works, AI + network RPC respond        |
| **H**  | B     | B1.1–B1.2, B2.1–B2.2, B3.1    | 5        | DONE        | All MCP tools respond, CLI subcommands work, slash commands render     |
| **I**  | C     | C1.1–C1.2                      | 2        | IN PROGRESS | Metadata events fire and reach plugins                                 |
| **J**  | D     | D1.1–D1.2, D2.1–D2.5          | 7        | NOT STARTED | Graph renders smart links, power features work end-to-end              |
| **K**  | E     | E1.1                           | 1        | NOT STARTED | Branches archived, main clean                                          |

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

- [x] **7.2** `/mcp` JSON-RPC route — **Rust session**
  - Thin adapter — same tool dispatch as stdio. Test with curl. Small — can combine with 7.1.
  - _Completed 2026-04-05 `79382bab`. Added POST /mcp route to Axum HTTP server in http.rs. Bearer token auth, JSON-RPC 2.0 parsing, dispatches to McpRouter (same as stdio). Notifications return 204 No Content. Stateless — creates fresh McpRouter per request (HTTP has no session). 7 new tests using test-only handler (avoids AppHandle dependency): auth rejection (missing + wrong token), malformed JSON parse error, ping, tools/list, unknown method, notification. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **7.3** `/cli/*` REST routes — read operations — **Rust session**
  - `POST /cli/read`, `/cli/search`, `/cli/files`, `/cli/tags`, `/cli/properties`, `/cli/outline`, `/cli/vault`, `/cli/vaults`, `/cli/status`. Each ~5-10 lines.
  - _Completed 2026-04-05 `757dbab0`. New `cli_routes.rs` module with 9 authenticated POST routes nested under `/cli`. Each route is a thin adapter: deserializes JSON params, delegates to existing service functions (notes_service::list_notes, search_db::search, search_db::list_all_tags, search_db::list_all_properties, search_db::get_note_headings, vault_service::list_vaults, vault_service::get_last_vault_id), returns JSON. Read uses direct disk IO (same as MCP tools, bypasses BufferManager). Files endpoint supports optional folder filter. Search caps limit at 200. Added token() accessor to HttpAppState. 8 tests (3 status endpoint with auth, 5 serialization). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **7.4** `/cli/*` REST routes — write operations — **Rust session**
  - `POST /cli/create`, `/cli/write`, `/cli/append`, `/cli/prepend`, `/cli/rename`, `/cli/move`, `/cli/delete`. Can combine with 7.3 if thin enough.
  - _Completed 2026-04-05 `5cf5a6dd`. Seven new authenticated POST routes in cli_routes.rs. Each is a thin adapter: create calls notes_service::create_note (with overwrite support via direct atomic_write), write/append/prepend use direct disk IO (bypass BufferManager — CLI has no editor session), rename calls notes_service::rename_note, move calls notes_service::move_items (single item), delete calls notes_service::delete_note. Prepend inserts after YAML frontmatter when present using find_frontmatter_end helper. Append ensures trailing newline before appending. 11 new tests (7 param deserialization + 4 frontmatter boundary detection). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **7.5** CLI crate scaffold + core read commands — **Rust session**
  - Files: `src-tauri/crates/carbide-cli/` — `main.rs`, `client.rs`, `auth.rs`, `vault.rs`, `format.rs`, `commands/notes.rs`, `commands/search.rs`
  - Clap derive API. `carbide read`, `carbide search`, `carbide files`, `carbide tags`, `carbide outline`. Plain text + `--json`.
  - _Completed 2026-04-05 `0fde0813`. New `carbide-cli` crate in `src-tauri/crates/` as workspace member. Clap derive API with 6 subcommands: read, search, files, tags, outline, status. CarbideClient (reqwest) reads bearer token from `~/.carbide/mcp-token`, checks /health, posts JSON to /cli/\* routes. Auto-resolves active vault via /cli/status when --vault not given. Plain text formatting (path lists, search snippets with scores, tag counts, indented heading outlines) + --json flag for raw JSON. Dependencies: clap 4, reqwest 0.12, serde/serde_json, tokio, dirs 6. Decision: used standard clap --flag style instead of Obsidian-style key=value positional args — more robust, auto-generates help, and idiomatic Rust. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **7.6** CLI write + vault + general commands — **Rust session**
  - `carbide create/write/append/rename/move/delete`, `carbide vault/vaults/vault:open`, `carbide help/version/status`. App launch detection (check `/health`, launch if down, poll 10s).
  - _Completed 2026-04-05 `efdef9e2`. Added 7 write subcommands (create/write/append/prepend/rename/move/delete) to commands/notes.rs, 2 vault subcommands (vault/vaults) in new commands/vault.rs, clap `version` attribute for `--version` flag. App launch detection: ensure_running() checks /health, calls platform-specific launch_app() (open -a on macOS, carbide on Linux, cmd /C start on Windows), polls every 500ms for 10s. Vaults command handled before vault resolution (doesn't need active vault). vault:open deferred — requires backend route not yet implemented. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

---

## Step 8: Auto-Setup + Shell Integration

**Branch:** `feat/http-cli` (continue) or `feat/auto-setup`
**Design ref:** `carbide/mcp_native_gaps_plan.md` → Phase 4
**Depends on:** Step 7

- [x] **8.1** Claude Desktop/Code auto-config + settings UI — **Rust + Svelte session**
  - `mcp/setup.rs`, `.mcp.json` generation, settings panel updates. Write/merge `claude_desktop_config.json`. Auto-setup button, token regen, connection status.
  - _Completed 2026-04-05 `622ce574`. Rust setup.rs with 4 Tauri commands: mcp_setup_claude_desktop (writes/merges claude_desktop_config.json), mcp_setup_claude_code (writes .mcp.json to vault dir with type:http), mcp_regenerate_token, mcp_get_setup_status. Config merge preserves existing mcpServers entries. Frontend: McpSetupStatus/McpSetupResult types, port/adapter/service/store wiring, MCP settings panel (enable toggle, server status badge, configure buttons for Desktop/Code with status icons, token regeneration). Settings nav gets new "MCP" category with CableIcon. Decision: used env var HOME/USERPROFILE for home dir instead of adding `dirs` crate dependency. 7 new tests (5 service + 2 store). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **8.2** CLI PATH registration + shell completions — **Rust session**
  - Symlink logic, clap completions (bash/zsh/fish), `--install-cli` command.
  - _Completed 2026-04-05 `322c365a`. Added `install.rs` module with symlink-based PATH registration (`--install-cli` creates `/usr/local/bin/carbide` -> current exe, `--uninstall-cli` removes it with safety check that target is a carbide binary). Shell completions via `clap_complete` crate (`--completions bash|zsh|fish` outputs to stdout). Made `command` field `Option<Command>` so flags work without subcommands; prints help when no subcommand given. On Windows, `create_symlink` falls back to file copy. 3 tests (symlink path, binary name detection, current exe resolution). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

---

## Step 9: Composite getFileCache

**Branch:** `feat/metadata-file-cache`
**Design ref:** `carbide/metadata_api_surface.md` → Phases B1, B2
**Depends on:** Steps 2, 3, 4

- [x] **9.1** `note_get_file_cache` Tauri command + plugin RPC wiring — **Rust + TS session**
  - Files: `service.rs`, `db.rs` (composite query), `plugin_rpc_handler.ts`
  - Assembly from existing tables. Wire as `metadata.getFileCache(path)`. Clean up dead `note_get_metadata` reference.
  - _Completed 2026-04-05 `ce1461da`. Added FileCache struct (model.rs) assembling frontmatter (BTreeMap<String, (value, type)>), tags, headings, links, embeds (partitioned by link_type), stats, ctime_ms/mtime_ms/size_bytes. Composite get_file_cache query in db.rs calls existing get_note_stats/get_note_properties/get_note_tags/get_note_headings/get_note_links and partitions links from embeds. note_get_file_cache Tauri command + specta annotation in service.rs. TS FileCache/CachedHeading/CachedLink types in metadata/types.ts. Replaced dead note_get_metadata with get_file_cache in MetadataPort + MetadataTauriAdapter. Extended SearchPort + search_tauri_adapter. Plugin RPC: metadata.getFileCache case + PluginRpcMetadataBackend.get_file_cache + wired in create_app_context.ts. 3 Rust tests (assembly, link/embed partition, missing note error). 2 new TS tests (plugin RPC success + permission check). Updated 5 test files for SearchPort mock. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

---

## Step 10: Plugin Hardening _(superseded — see Phase A2 below)_

_Original units 10.1-10.3 superseded by the 2026-04-11 roadmap refresh. Plugin hardening is now Phase A2 with revised scope. See `2026-04-11_unified_implementation_roadmap.md` for details._

---

## Step 11: Block Embeddings

**Branch:** `feat/block-embeddings-clean` (merged to main)
**Design ref:** `carbide/2026-04-02_smart_linking_and_block_notes.md` → Phase 3
**Depends on:** Step 6 (smart linking engine)

- [x] **11.1** `block_embeddings` table + embedding pipeline extension — **Rust session**
  - Files: `db.rs` (schema), `embeddings.rs`, `vector_db.rs`
  - Threshold: 20 words OR >10 lines. Reuse Snowflake Arctic Embed XS. Backfill during indexing.
  - _Completed 2026-04-06 `bfbd9e11` (on feat/extended-tools), merged to main via feat/block-embeddings-clean. Added block_embeddings table, section embedding pipeline, block_knn_search. Follow-up fixes: stale data, tag regression, two-tier search, progress events (`b06e9cf9`), last-line inclusion (`5902a93b`), HNSW vector index (`2140f844`), remediation with truncation + auto-embed + batch queries + async HNSW + accelerate (`c3cfeb29`)._

- [x] **11.2** `block_knn_search` + `block_semantic_similarity` smart link rule — **Rust session**
  - `vector_db.rs` (new search), smart_links module (new rule). Brute-force scan fine for MVP.
  - _Completed 2026-04-06 `f7aedc3c`. Added block_semantic_similarity rule + find_similar_blocks command. Subsequently upgraded to HNSW index for O(log n) approximate nearest neighbor search._

---

## Step 12: Extended MCP/CLI Tools

**Branch:** `feat/extended-tools` (not yet merged to main)
**Design ref:** `carbide/mcp_native_gaps_plan.md` → Phase 6
**Depends on:** Steps 7-8

- [x] **12.1** MCP Tier 2 tools — **Rust session**
  - `mcp/tools/` — backlinks, outlinks, references, properties, query_by_property.
  - _Completed 2026-04-06 `27247865`. Added Tier 2 MCP tools._

- [x] **12.2** MCP Tier 3 + plugin MCP bridge — **Rust + TS session**
  - Git tools, rename. `plugin_rpc_handler.ts` `mcp.*` namespace: `list_tools`, `call_tool`, `register_tool`.
  - _Completed 2026-04-06 `63b8bcb9`. Added git_status, git_log, rename_note + plugin MCP bridge._

- [x] **12.3** CLI git + reference commands — **Rust session**
  - `git:status/commit/log/diff/push/pull/restore/init`, `references/reference:add/search/bbt`.
  - _Completed 2026-04-06 `3d0179b1`. Added git + reference CLI commands and backend routes._

- [x] **12.4** CLI bases + tasks + plugins + dev commands — **Rust session**
  - Remaining CLI surface.
  - _Completed 2026-04-06 `48f0017c`. Added bases, tasks, and dev CLI commands and backend routes._

- [x] **12.5** Slash command contribution point — **TS + Svelte session**
  - Plugin manifest `contributes.slash_commands`. ProseMirror `/` menu hook. Most complex unit in Step 12.
  - _Completed 2026-04-06 `6bc50243`. Added slash command contribution point for plugins._

**Post-step note:** `feat/extended-tools` also includes `968750c9` (wire autostart to HTTP server instead of broken stdio transport) and has trailing checkpoint commits suggesting in-progress stabilization work. Additionally, `feat/mcp-streamable-http` branch reworked the MCP transport: removed stdio, added streamable HTTP transport, extracted shared_ops, DRY'd CLI routes and MCP tools. These branches need merge review before folding into main.

---

## Step 13: Editor Drag Handles

**Branch:** `feat/editor-drag-blocks` (merged to main, further refined on `feat/editor-drag-blocks-clean`)
**Design ref:** `carbide/2026-04-02_smart_linking_and_block_notes.md` → Phase 4
**Depends on:** nothing

**Post-step note:** After merge to main, drag handles received additional refinement: section-aware positioning (`aa1e840a`), baseline alignment per block type (`33bb834a`), and grip height adjustment (`0cfb7e41`).

- [x] **13.1** Block detection ProseMirror plugin + drag handle UI — **TypeScript/ProseMirror session**
  - Detect block boundaries, render grip icon on hover for eligible blocks.
  - _Completed 2026-04-06 `b94e52cf`. Domain module detect_draggable_blocks.ts identifies 13 eligible top-level block types (heading, paragraph, code_block, blockquote, bullet_list, ordered_list, hr, table, details_block, image-block, math_block, file_embed, excalidraw_embed). ProseMirror view plugin tracks mouse position, resolves top-level block via doc.resolve, renders floating drag handle (6-dot radial-gradient grip) positioned absolutely in left gutter. Drag initiates NodeSelection + sets view.dragging for ProseMirror native drop handling (via existing dropCursor plugin). Schema uses "hr" not "horizontal_rule" as node type name. CSS: handle hidden by default, shown on hover with grab cursor, dragging state with reduced opacity. Extension wired into assemble_extensions. 10 domain tests + 2 plugin tests. Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

- [x] **13.2** Drag-and-drop + markdown round-trip — **TypeScript/ProseMirror session**
  - Drop handler, content reordering, re-indexing trigger. Verify AST round-trip.
  - _Completed 2026-04-06 `f15b2221`. Added compute_block_drop.ts domain module with resolve_drop_target (snaps raw drop position to nearest block boundary using midpoint heuristic) and apply_block_move (atomic delete+insert transaction with position adjustment for direction). Extended block_drag_handle_plugin with handleDrop prop using plugin state to track dragging_from position — intercepts drops when moved=true and source is a block drag. Re-indexing triggers automatically through existing ProseMirror doc-change → autosave → index flow. 15 domain tests (resolve_drop_target snapping, compute_block_drop validation, apply_block_move for all directions + attribute preservation). 7 markdown round-trip tests (paragraph reorder, heading move, code block with language, blockquote, list block, horizontal rule, identity round-trip). Pre-existing lint (build_command_context.ts layering) and test (document_service eviction) failures unchanged._

---

## Steps 14–16 _(superseded)_

_Original Steps 14 (Metadata Events), 15 (Graph Viz), and 16 (Power Features) are superseded by Phases C, D below. The scope is similar but reorganized with new dependencies and additional work (AI/network RPC, branch hand-ports)._

---

# Remaining Work (2026-04-11 Roadmap Refresh)

_The units below replace the original Steps 10, 14–16. They follow the phase structure from `2026-04-11_unified_implementation_roadmap.md`. Each unit follows the same sizing principles as above._

---

## Phase A: Standalone Fixes (parallel-safe, no deps on unmerged work)

### Step A1: Editor Width Token Refactor

**Branch:** `fix/editor-width-tokens`
**Design ref:** `carbide/plans/editor-width-token-refactor.md`
**Session type:** CSS/Svelte
**Depends on:** nothing

- [x] **A1.1** Standardize `--editor-max-width` + expose `--source-editor-max-width` — **CSS/Svelte session**
  - Files: `src/styles/editor.css`, `src/styles/theme-theater.css`, `src/styles/theme-spotlight.css`, `src/styles/theme-zen-deck.css`, `src/lib/features/editor/ui/source_editor_theme.ts`, `src/lib/app/bootstrap/ui/workspace_layout.svelte`
  - Add `--source-editor-max-width: 48rem` default to `:root` in `editor.css`
  - Change `source_editor_theme.ts` `.cm-content` maxWidth to `var(--source-editor-max-width, 48rem)`
  - Replace hardcoded max-widths in theater (`120ch`) and spotlight (`80ch`) with `var(--editor-max-width)` + theme-level default
  - Rename zen-deck `--zen-max-width` to `--editor-max-width`
  - Fix zen mode in `workspace_layout.svelte` to use `var(--editor-max-width)` instead of hardcoded `72ch`
  - Tests: visual verification only (no unit tests — pure CSS)
  - _Completed 2026-04-11 `14788ee2`. Added `--source-editor-max-width: 48rem` to `:root` in editor.css. Theater and spotlight both had 80ch hardcoded (plan said 120ch for theater but code was 80ch) — replaced with `var(--editor-max-width)` and added theme-level `--editor-max-width` defaults. Renamed zen-deck `--zen-max-width` to `--editor-max-width`. Source editor uses `var(--source-editor-max-width, 48rem)`. Zen mode in workspace_layout.svelte uses `var(--editor-max-width, 72ch)` fallback. All themes visually identical — tokens enable user override via `token_overrides`._

---

### Step A2: Plugin Hardening — Safety Hand-Port

**Branch:** `feat/plugin-hardening-safe`
**Design ref:** `carbide/2026-04-10_plugin_hardening_safe_selective_merge_plan.md`
**Session type:** TypeScript + Svelte
**Depends on:** nothing

- [x] **A2.1** RPC hardening — timeouts + rate limiting + error budget — **TypeScript session**
  - Create `src/lib/features/plugin/domain/` directory
  - Create `domain/rpc_timeout.ts`: `RpcTimeoutError`, `get_rpc_timeout(method)` (5s default, 30s for FS), `with_timeout(promise, method, timeout_ms?)`
  - Create `domain/rate_limiter.ts`: `PluginRateLimiter` — sliding window, 100 calls/min per plugin
  - Strengthen `plugin_error_tracker.ts`: add `consecutive_errors` map, `record_success(plugin_id)`, auto-disable threshold (10 consecutive)
  - Update `plugin_service.ts` `handle_rpc()`: rate-limit check → timeout wrapper → record_success on non-error
  - Add `rate_limiter.clear_all()` in `PluginService.clear_active_vault()`
  - **Do NOT port:** `send_lifecycle_hook`, `SettingChangedCallback`, `on_settings_change` hook delivery, new lifecycle message format
  - Tests: timeout behavior, rate-limit rejection, success resets consecutive-error budget, repeated failures auto-disable
  - _Completed 2026-04-11 `72daa535`. Created `domain/rpc_timeout.ts` (RpcTimeoutError, get_rpc_timeout, with_timeout) and `domain/rate_limiter.ts` (PluginRateLimiter with sliding window). Extended PluginErrorTracker with consecutive_errors map, record_success(), get_consecutive_errors(), and 10-consecutive auto-disable threshold. Updated handle_rpc() flow: rate-limit check → timeout wrapper → record_success on non-error. Rate limiter resets on unload_plugin() and clear_active_vault(). 4 test files covering all behaviors. Pre-existing lint (build_command_context layering) and check (linked_source_utils types) failures unchanged._

- [x] **A2.2** Richer settings schema — **Svelte/UI session**
  - Hand-port from `b8edde58` (do NOT cherry-pick — includes activation event types from `1f04cd0b`)
  - Extend `PluginSettingSchema` in `ports.ts`: `type: "textarea"`, `min?: number`, `max?: number`, `placeholder?: string`
  - Create `src/lib/components/ui/textarea/textarea.svelte` + `index.ts` (shadcn-style)
  - Update `plugin_settings_dialog.svelte`: render textarea, clamp numeric to min/max, pass placeholders
  - Tests: textarea rendering, placeholder rendering, numeric clamp behavior
  - _Completed 2026-04-11 `b5328d64`. Hand-ported from b8edde58. Extended PluginSettingSchema with textarea type, placeholder, min, max. Created shadcn-style Textarea component. Updated plugin_settings_dialog with textarea rendering (full-width layout), min/max clamping via clamp_number(), and placeholder passthrough on string/number/textarea inputs. Updated plugin_rpc_handler read_setting_type to accept "textarea" and read_setting_schema to parse placeholder/min/max. Added textarea test stub. 4 new tests. Pre-existing tauri-pty resolution failure in test collection unchanged._

- [x] **A2.3** Documentation + vault_contains decision — **Docs session**
  - Update `docs/plugin_howto.md` — mention RPC timeout behavior, rate limiting, richer settings fields
  - Decide on `vault_contains` (recommended: defer — no plugin needs it yet)
  - _Completed 2026-04-11 `3bbc49e8`+`ba2ceef6`. Docs already updated in prior commits on this branch: RPC timeout behavior (5s default, 30s for FS), rate limiting (100 calls/min sliding window), error auto-disable (burst + consecutive), richer settings (textarea type, placeholder, min/max), network.fetch namespace (SSRF protection, size limits, allowed_origins), ai.execute namespace (ask/edit modes, provider config). Decision: vault_contains deferred — no plugin needs it yet, can be added later._

---

### Step A3: Plugin AI + Network RPC

**Branch:** `feat/plugin-ai-network-rpc`
**Design ref:** `2026-04-11_unified_implementation_roadmap.md` → Step A3
**Session type:** TypeScript + Rust
**Depends on:** nothing (existing `AiService` and `reqwest` on main)

- [x] **A3.1** `network.fetch` RPC namespace — **Rust + TypeScript session**
  - Rust: new `plugin_http_fetch` Tauri command — uses existing `reqwest`
  - SSRF protection: block localhost/private IPs before request fires
  - _Completed 2026-04-11 `df367450` (on feat/plugin-ai-network-rpc). Rust plugin_http_fetch command with SSRF protection, size limits. TS PluginRpcNetworkBackend with allowed_origins check. SDK carbide.network.fetch._
  - Request size limit (1MB body), response size limit (10MB)
  - TypeScript: new `PluginRpcNetworkBackend`, `network.fetch` dispatch — requires `network:fetch` permission
  - Manifest `allowed_origins` allowlist checked before forwarding
  - SDK: `carbide.network.fetch(url, opts)` in `carbide_plugin_api.js`
  - Tests: SSRF blocking, allowlist enforcement, rate limiting, success path

- [x] **A3.2** `ai.execute` RPC namespace — **TypeScript session**
  - New `PluginRpcAiBackend` in `plugin_rpc_handler.ts`
  - `ai.execute` dispatch — requires `ai:execute` permission
  - Invokes `AiService.execute()` → `AiPort` → `ai_execute_cli` Tauri command
  - Returns `{ output, success, error }` — no streaming
  - Uses default provider config from `AiSettingsStore`
  - Tests: permission check, execution success/failure, provider not configured error
  - _Completed 2026-04-11 `c2966610` (on feat/plugin-ai-network-rpc). PluginRpcAiBackend with permission check, bridges to AiService.execute()._

- [x] **A3.3** SDK surface + docs — **Docs session**
  - Update `carbide_plugin_api.js`: add `carbide.network.fetch(url, opts)` and `carbide.ai.execute({ prompt, mode? })`
  - Update `docs/plugin_howto.md`: AI and network namespace docs, permission requirements
  - Update manifest schema docs: `network:fetch`, `ai:execute` permissions, `allowed_origins`
  - _Completed 2026-04-11 `ba2ceef6` (on feat/plugin-ai-network-rpc). SDK + docs updated._

---

**Review gate A:** Plugin tests pass, existing lifecycle SDK behavior intact, editor width tokens work, AI and network RPC respond correctly with permission checks. `pnpm check && pnpm lint && pnpm test && cargo check` green.

---

## Phase B: Extended Tools Hand-Port (depends on Phase A)

### Step B1: MCP Tier 2/3 + Plugin MCP Bridge

**Branch:** `feat/mcp-extended-tools`
**Design ref:** Hand-port from `27247865`, `63b8bcb9`
**Session type:** Rust + TypeScript
**Depends on:** Phase A complete, main's MCP HTTP transport + shared_ops

- [x] **B1.1** MCP Tier 2 tools — **Rust session**
  - Hand-port from `27247865`: backlinks, outlinks, properties, references tool handlers
  - Register in `router.rs`, add tool definitions
  - Tests: tool dispatch for each new handler
  - _Completed 2026-04-11 `96e5ec92` (on feat/plugin-slash-commands). MCP Tier 2 tools hand-ported._

- [x] **B1.2** MCP Tier 3 + plugin MCP bridge — **Rust + TypeScript session**
  - Hand-port from `63b8bcb9`: git_status, git_log, rename_note tool handlers
  - Plugin MCP bridge: `mcp.*` RPC namespace (list_tools, call_tool, register_tool)
  - Tests: git tool responses, plugin tool registration round-trip
  - _Completed 2026-04-11 `f5ac7a5d` (on feat/plugin-slash-commands). Tier 3 tools + plugin MCP bridge hand-ported._

---

### Step B2: CLI Extended Commands

**Branch:** `feat/cli-extended-commands`
**Design ref:** Hand-port from `3d0179b1`, `48f0017c`
**Session type:** Rust
**Depends on:** main's CLI sidecar + glow (already merged)

- [x] **B2.1** CLI git + reference commands — **Rust session**
  - Hand-port from `3d0179b1`: git + reference CLI subcommands + backend routes
  - Tests: subcommand parsing, route serialization
  - _Completed 2026-04-11 `7318455c` (on feat/plugin-slash-commands). Git + reference CLI hand-ported._

- [x] **B2.2** CLI bases, tasks, dev commands — **Rust session**
  - Hand-port from `48f0017c`: bases, tasks, dev subcommands + backend routes
  - Tests: subcommand parsing, route serialization
  - _Completed 2026-04-11 `6a7893bf` (on feat/plugin-slash-commands). Bases, tasks, dev CLI hand-ported._

---

### Step B3: Slash Command Contribution Point

**Branch:** `feat/plugin-slash-commands`
**Design ref:** Hand-port from `6bc50243`
**Session type:** TypeScript + Svelte
**Depends on:** Step B1 (plugin MCP bridge)

- [x] **B3.1** Slash command contribution point — **TypeScript + Svelte session**
  - Hand-port from `6bc50243`: manifest `contributes.slash_commands`, ProseMirror `/` menu hook
  - Depends on B1.2 (plugin MCP bridge)
  - Tests: command registration, menu rendering, dispatch
  - _Completed 2026-04-11 `d9dd3c41` (on feat/plugin-slash-commands). Slash command contribution point hand-ported._

---

**Review gate B:** All MCP tools respond correctly, CLI subcommands work, slash commands from plugins render. `pnpm check && pnpm lint && pnpm test && cargo check` green.

---

## Phase C: Metadata Events (independent of Phase B, can run concurrently after Phase A)

### Step C1: Metadata Change Events + Plugin Bridge

**Branch:** `feat/metadata-events`
**Design ref:** `carbide/2026-04-05_plan_metadata_api_surface.md` → Phase C1
**Session type:** Rust + TypeScript
**Depends on:** Steps 4, 9 (on main — ctime, note_links, getFileCache all merged)

- [x] **C1.1** `metadata-changed` event emission — **Rust session**
  - Extend `db.rs` or `service.rs` to emit Tauri events on upsert/rename/delete
  - Define event payload: `{ event_type: "upsert"|"rename"|"delete", path, old_path? }`
  - Tests: event emission on each mutation type
  - _Completed 2026-04-11 `3b648000`. Added MetadataChangedEvent enum (Upsert/Rename/Delete with serde tag "event_type") to notes/service.rs. emit_metadata_changed helper calls app.emit("metadata-changed", event). Emits from create_note (upsert), write_and_index_note (upsert), rename_note (rename with old_path), delete_note (delete). 3 serialization tests verify JSON payload format. C1.2 needs to subscribe to this event in the plugin host and forward to iframes._

- [ ] **C1.2** Plugin bridge for metadata events — **TypeScript session**
  - Subscribe to Tauri metadata events in plugin host
  - Forward to iframe via `events.on("metadata-changed", cb)` in plugin SDK
  - Tests: event delivery to subscribed plugin, no delivery without subscription

---

**Review gate C:** Metadata change events fire correctly, plugin bridge delivers them to subscribed plugins. `pnpm check && pnpm lint && pnpm test && cargo check` green.

---

## Phase D: New Feature Work (depends on Phases A–C)

### Step D1: Graph Visualization

**Branch:** `feat/graph-smart-links`
**Design ref:** `carbide/2026-04-02_smart_linking_and_block_notes.md` → Phase 5
**Session type:** Rust + TypeScript + Svelte/D3
**Depends on:** Steps 5–6 (smart links — on main), Step 11 (block embeddings — on main)

- [ ] **D1.1** Smart link edges in graph data model — **Rust + TypeScript session**
  - Rust graph builder: new edge type for smart links, provenance metadata
  - TS graph types: extend `VaultGraphSnapshot`, `GraphNeighborhoodSnapshot`
  - Tests: graph builder produces smart link edges

- [ ] **D1.2** Graph rendering — dashed edges, hover provenance, section-level edges — **Svelte/D3 session**
  - Visual differentiation: dashed lines for smart links, solid for explicit
  - Hover tooltip shows rule provenance
  - Block-level edges when embeddings exist
  - Tests: rendering logic, hover state

---

### Step D2: Power Features

**Branch:** per-feature branches
**Design ref:** `carbide/mcp_native_gaps_plan.md` Phase 7 + `carbide/2026-04-05_plan_metadata_api_surface.md` 3d-3e
**Session type:** Mixed
**Depends on:** all prior

- [ ] **D2.1** Bulk property rename — **Rust + TypeScript session**
  - Tauri command, frontmatter writer integration, UI confirmation dialog, git checkpoint
  - Tests: multi-file rename, rollback on error

- [ ] **D2.2** Bulk property delete — **Rust + TypeScript session**
  - Same pattern as D2.1
  - Tests: multi-file delete, confirmation UI

- [ ] **D2.3** Nested property flattening — **TypeScript session**
  - `extract_metadata.ts`: dot notation (`author.name`), write-back preserves original YAML structure
  - Tests: extraction, round-trip, edge cases

- [ ] **D2.4** Plugin SDK package — **TypeScript session**
  - `@carbide/plugin-types`, `create-carbide-plugin` template
  - Tests: type checking, template generation

- [ ] **D2.5** CLI TUI mode — **Rust session**
  - ratatui or rustyline, exploratory — may span multiple conversations
  - Tests: input handling, rendering

---

**Review gate D:** Graph renders correctly with smart link edges. Bulk property ops work end-to-end. `pnpm check && pnpm lint && pnpm test && cargo check` green.

---

## Phase E: Cleanup

### Step E1: Archive Stale Branches

**Depends on:** All hand-port work verified on main

- [ ] **E1.1** Archive stale branches — **Git session**
  - Rename `feat/plugin-hardening` → `archive/feat/plugin-hardening`
  - Rename `feat/extended-tools` → `archive/feat/extended-tools`
  - Only after all hand-port work verified on main

---

## Summary

### Completed (original Steps 1–13)

| Step                    | Units | Sessions | Status |
| ----------------------- | ----- | -------- | ------ |
| 1. MCP Stdio            | 5     | 5        | DONE   |
| 2. Headings Cmd         | 1     | 1        | DONE   |
| 3. Metadata Foundations  | 3     | 3        | DONE   |
| 4. Backend Enrichment   | 2     | 2        | DONE   |
| 5. Smart Linking P1     | 3     | 3        | DONE   |
| 6. Smart Linking P2     | 2     | 2        | DONE   |
| 7. HTTP + CLI           | 6     | 5-6      | DONE   |
| 8. Auto-Setup           | 2     | 2        | DONE   |
| 9. getFileCache         | 1     | 1        | DONE   |
| 11. Block Embeddings    | 2     | 2        | DONE   |
| 12. Extended Tools      | 5     | 4-5      | DONE   |
| 13. Editor Drag         | 2     | 2        | DONE   |
| **Subtotal**            | **34**| **~32-34**|       |

### Remaining (Phases A–E from 2026-04-11 refresh)

| Phase | Step                        | Units | Sessions | Status      |
| ----- | --------------------------- | ----- | -------- | ----------- |
| A     | A1: Editor width tokens     | 1     | 1        | NOT STARTED |
| A     | A2: Plugin hardening        | 3     | 2–3      | NOT STARTED |
| A     | A3: Plugin AI + network RPC | 3     | 3        | NOT STARTED |
| B     | B1: MCP Tier 2/3 + bridge   | 2     | 2        | NOT STARTED |
| B     | B2: CLI extended commands    | 2     | 2        | NOT STARTED |
| B     | B3: Slash commands           | 1     | 1        | NOT STARTED |
| C     | C1: Metadata events          | 2     | 2        | NOT STARTED |
| D     | D1: Graph visualization      | 2     | 2        | NOT STARTED |
| D     | D2: Power features           | 5     | 5        | NOT STARTED |
| E     | E1: Archive branches         | 1     | 1        | NOT STARTED |
| **Subtotal**                    || **22**| **~21-22**|            |

| | **Grand total** | **56** | **~53-56** | **34 done, 22 remaining** |

---

## Out-of-Band Work (not in original unit plan)

Work merged to main outside the original unit plan:

| Work | Status | Notes |
|---|---|---|
| MCP streamable HTTP transport (`feat/mcp-streamable-http`) | Merged | Superseded stdio; extracted `shared_ops.rs`; DRY'd CLI routes + MCP tools |
| CLI sidecar install (`feat/cli-sidecar-install`) | Merged | CLI bundled as Tauri sidecar; Install/Uninstall controls in Settings |
| CLI glow + polish (`feat/cli-glow-open`) | Merged | Glow rendering, `edit`, `search --paths-only`, `tags --filter`, exit codes |
| Block embeddings HNSW (`feat/block-embeddings-clean`) | Merged | HNSW vector index, truncation fix, batch queries, async HNSW, accelerate |
| Editor drag refinements (`feat/editor-drag-blocks-clean`) | Merged | Section-aware positioning, baseline alignment, grip adjustments |
| STT removal | Merged | Removed speech-to-text feature |
| Tool status cards | Merged | Settings > Tools status display |

### Stale branches (to archive in Phase E)

| Branch | Commits | Disposition |
|---|---|---|
| `feat/plugin-hardening` | 6 commits (merge-base `bba85e1e`) | Hand-port useful work → archive |
| `feat/extended-tools` | 26 commits (child of plugin-hardening) | Hand-port useful work → archive |
