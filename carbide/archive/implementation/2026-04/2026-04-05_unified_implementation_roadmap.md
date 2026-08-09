# Unified Implementation Roadmap: MCP + Metadata + Smart Linking

**Date:** 2026-04-05
**Status:** Active — guides all implementation work until superseded
**Supersedes ordering in:** `mcp_native_gaps_plan.md`, `metadata_api_surface.md`, `2026-04-02_smart_linking_and_block_notes.md`

---

## Purpose

Three plans were developed independently — MCP/CLI, metadata API surface, and smart linking/block notes. This document unifies them into a single dependency-aware implementation order. Each step references the source plan so the detailed design lives in one place.

**The three source documents remain the design references.** This document only governs _when_ to build what and _why_ that order.

---

## Key Insight: The Overlap

These plans share significant work that must not be done twice:

| Work Item                       | Appears In                                                 | Resolution        |
| ------------------------------- | ---------------------------------------------------------- | ----------------- |
| Property type inference         | MCP Phase 2 (Gap 3a) + Metadata API (implicit)             | Do once at Step 3 |
| Frontmatter write-back          | MCP Phase 2 (Gap 3b) + Metadata API (implicit)             | Do once at Step 3 |
| Property enumeration with types | MCP Phase 2 (Gap 3c) + Metadata API (Phase A)              | Do once at Step 3 |
| Populate `note_links` table     | Metadata API (A3) + Smart Linking (`shared_outlinks` rule) | Do once at Step 4 |
| Headings Tauri command          | Metadata API (A2) + getFileCache prerequisite              | Do once at Step 2 |

---

## Implementation Order

### Step 1: MCP Stdio Server + Tier 1 Tools

**Source:** `mcp_native_gaps_plan.md` Phase 1 (1a-1d)
**Effort:** ~1 week
**Dependencies:** None

- Create `src-tauri/src/features/mcp/` module
- Stdio transport + JSON-RPC 2.0 handler
- Tier 1 tools: `list_notes`, `read_note`, `create_note`, `update_note`, `delete_note`, `search_notes`, `get_note_metadata`, `list_vaults`
- Tauri commands for MCP lifecycle (`mcp_start`, `mcp_stop`, `mcp_status`)
- Resource definitions (vault structure, config, properties)

**Why first:** Highest leverage single feature. Makes Carbide visible to Claude Desktop, Claude Code, and Cursor. Zero dependencies on any other plan. Wraps existing Tauri commands directly.

**Exit criteria:** `claude mcp list` shows `carbide`; Claude Desktop can read/search/create notes.

---

### Step 2: Headings Tauri Command

**Source:** `metadata_api_surface.md` Phase A2
**Effort:** 2 hours
**Dependencies:** None

- Add `get_note_headings(vault_id, path)` Tauri command
- Wraps existing query at `db.rs:3237` (already works, used in tests)
- Returns `Vec<{level, text, line}>`

**Why here:** Trivial. Clears a metadata API gap while MCP Phase 1 is fresh. Unblocks `getFileCache` composite endpoint later (Step 9).

**Exit criteria:** New Tauri command callable from frontend. Add to MCP Tier 2 tools list.

---

### Step 3: Metadata Foundations (Type Inference + Frontmatter Writer + Property Enumeration)

**Source:** `mcp_native_gaps_plan.md` Phase 2 (Gaps 3a, 3b, 3c) — **this IS the same work as metadata_api_surface property enrichment**
**Effort:** ~1 week
**Dependencies:** None (benefits from Step 1 existing but not blocked)

- **3a.** `infer_property_type()` — pure function, replaces naive `typeof` with semantic type detection (date, boolean, number, tags, array, string). Update SQLite `note_properties.property_type` column semantics.
- **3b.** `frontmatter_writer.ts` — format-preserving `update/add/remove_frontmatter_property()`. Operates on raw markdown strings, preserves indentation and comments.
- **3c.** Extend `list_properties` response with inferred types and top-N unique values for autocomplete.

**Why here:** Enriches MCP tools (Step 1), CLI property commands (Step 7), bases views, and smart linking metadata rules (Step 5) all at once. Doing this early means everything downstream gets richer data.

**Exit criteria:** Bases queries on date/number properties use type-aware comparison. Editing a property in metadata panel writes back to YAML without corrupting formatting. `list_properties` returns inferred types.

---

### Step 4: Backend Enrichment (ctime + Populate note_links)

**Source:** `metadata_api_surface.md` Phases A1 + A3
**Effort:** ~3 days
**Dependencies:** None (parallel-safe with Step 3)

- **A1.** Add `ctime_ms` to `IndexNoteMeta`, populate from `fs::metadata().created()`, add column to `notes` table, propagate to frontend `NoteMeta`.
- **A3.** Populate `note_links` table during `upsert_note` indexing pass. Schema already exists (`db.rs:760`). Extend outlink extraction to capture `link_text`, `link_type` (link vs embed), `section_heading`, `target_anchor`. Add `get_note_links(vault_id, path)` Tauri command. Resolve `outlinks` vs `note_links` dual-table question (consolidate or document separation).

**Why here:** `ctime_ms` feeds `getFileCache` (Step 9). Populated `note_links` enables smart linking `shared_outlinks` rule (Step 5) and richer MCP/CLI link tools. Both are backend-only Rust work that doesn't touch UI.

**Exit criteria:** `ctime_ms` available in frontend `NoteMeta`. `note_links` table populated on every index with link text, type, and anchor data.

---

### Step 5: Smart Linking Phase 1 (Metadata Rules)

**Source:** `2026-04-02_smart_linking_and_block_notes.md` Phase 1
**Effort:** ~3 days
**Dependencies:** Steps 3-4 make rules richer but are not hard blockers (existing tables suffice for MVP)

- Rule infrastructure: types, store, config persistence via Rust Tauri commands
- Implement `same_day`, `shared_tag`, `shared_property` as SQL queries against existing tables
- If Step 4 is complete: also implement `shared_outlinks` against populated `note_links`
- Extend `SearchPort` with smart link methods
- Integrate with `LinksService.load_suggested_links()` — union of explicit + smart suggestions
- Extend `SuggestedLink` type with optional provenance (`rules[]`)

**Why here:** All backing tables populated. Pure SQL + config + UI wiring. First user-visible "intelligence" feature beyond basic semantic similarity.

**Exit criteria:** Suggested Links panel shows metadata-rule-based suggestions with provenance chips. Rules configurable in vault settings.

---

### Step 6: Smart Linking Phase 2 (Semantic Rules + Scoring)

**Source:** `2026-04-02_smart_linking_and_block_notes.md` Phase 2
**Effort:** ~2 days
**Dependencies:** Step 5 (rule infrastructure)

- Wire `semantic_similarity` rule to existing `find_similar_notes()` (call directly, **not** through hybrid search)
- Add `title_overlap` (Jaccard on tokenized titles) and `shared_outlinks` queries
- Weighted score aggregation: `sum(rule.weight * raw_score)` across all enabled rules
- Deduplicate by target, sort by composite score, truncate

**Why here:** Completes the smart linking engine. Mostly wiring — `find_similar_notes()` already works. After this, suggested links are fully powered.

**Exit criteria:** Suggestions from multiple rules merge correctly. Notes matching multiple rules rank higher. Semantic-only suggestions don't get dropped.

---

### Step 7: HTTP Server + CLI Binary

**Source:** `mcp_native_gaps_plan.md` Phase 3 + `cli_design.md`
**Effort:** ~1.5 weeks
**Dependencies:** Step 1 (MCP server exists), Step 3 (enriched metadata for tools/commands)

- **Server:** Axum HTTP server on port 3457. Bearer token auth. Endpoints: `POST /mcp` (JSON-RPC), `POST /cli/*` (REST), `GET /health`.
- **MCP HTTP:** Same tool dispatch as stdio, different transport.
- **CLI binary:** New crate `src-tauri/crates/carbide-cli/`. Clap + reqwest + serde_json + colored + tabled. Core commands first: `read`, `search`, `files`, `tags`, `properties`, `outline`, `create`, `write`, `append`, `rename`, `vault`, `vaults`, `status`.
- **App launch detection:** CLI checks `/health`; launches `Carbide.app` if not running; polls up to 10s.

**Why here:** MCP stdio (Step 1) proves the tool dispatch works. Enriched metadata (Step 3) makes CLI property commands useful. HTTP server serves both MCP clients and CLI — one server, two interfaces.

**Exit criteria:** `carbide read file=<name>` returns note content. `curl localhost:3457/mcp` accepts JSON-RPC. `carbide search query="..."` works. `--json` flag on all commands.

---

### Step 8: Auto-Setup + Shell Integration

**Source:** `mcp_native_gaps_plan.md` Phase 4
**Effort:** ~3 days
**Dependencies:** Step 7 (HTTP server + CLI binary exist)

- Claude Desktop auto-config (`claude_desktop_config.json` merge)
- Claude Code `.mcp.json` generation in vault root
- CLI PATH registration (symlink or PATH export per platform)
- Shell completions (bash, zsh, fish — clap generates for free)
- Settings UI panel (MCP + CLI status, token management, auto-setup button)
- `carbide --install-cli` self-registration command

**Why here:** Configuration layer for what Steps 1 + 7 built.

**Exit criteria:** Zero-friction MCP setup for Claude Desktop/Code. `carbide` command available in PATH after install. Shell completions work.

---

### Step 9: Composite getFileCache Endpoint

**Source:** `metadata_api_surface.md` Phases B1 + B2
**Effort:** ~2 days
**Dependencies:** Steps 2 (headings API), 3 (typed properties), 4 (ctime + note_links)

- New Tauri command `note_get_file_cache(vault_id, path)` returning composite `FileCache` shape
- Assembles from: `note_properties`, `note_inline_tags`, `note_headings`, `note_links`, `get_note_stats`, `ctime_ms`, `mtime_ms`, `size_bytes`
- Single call replaces N+1 round-trips from plugin iframe
- Wire to plugin RPC as `metadata.getFileCache(path)`
- Clean up dead `note_get_metadata` reference in `MetadataTauriAdapter`

**Why here:** All backing data now exists from Steps 2-4. This is assembly, not new data generation.

**Exit criteria:** Single RPC call returns full `FileCache` shape. Plugin iframe can get complete note metadata in one call.

---

### Step 10: Plugin Hardening

**Source:** `mcp_native_gaps_plan.md` Phase 5 (Gaps 2a-2e)
**Effort:** ~1 week
**Dependencies:** None (independent, slotted here as a pace change)

- **10a.** Activation events / lazy loading (`on_startup_finished`, `on_file_type:*`, `vault_contains:*`)
- **10b.** Lifecycle hooks (`activate`, `deactivate`, `on_settings_change`)
- **10c.** RPC timeouts (5s default, 30s for FS) + rate limiting (100 calls/min) + error budget (10 consecutive → auto-disable)
- **10d.** Richer settings schema (`textarea`, `min`/`max`, `placeholder`, `description`)

**Why here:** Independent workstream. Good breather between infrastructure-heavy steps and the next push on embeddings.

**Exit criteria:** Plugins with no matching activation event stay unloaded. RPC calls that exceed timeout return error. Plugin with 10 consecutive errors is auto-disabled.

---

### Step 11: Block Embeddings + Block KNN

**Source:** `2026-04-02_smart_linking_and_block_notes.md` Phase 3
**Effort:** ~5 days
**Dependencies:** Step 6 (smart linking engine to consume results)

- Add `block_embeddings` table: `(path, heading_id, embedding BLOB)`
- Extend embedding pipeline to iterate `note_sections` and embed sections above threshold (20 words OR >10 lines)
- Add `block_knn_search()` to `vector_db.rs`
- Add `block_semantic_similarity` smart link rule — section-level precision
- Backfill runs during normal vault indexing

**Scaling note:** Brute-force linear scan is fine for MVP up to ~10k sections. Consider sqlite-vec or pre-filtering if vaults grow beyond that.

**Exit criteria:** Block embeddings generated for sections above threshold. `block_knn_search()` returns section-level similar content. Smart link suggestions show section-level matches.

---

### Step 12: Extended MCP/CLI Tools (Tier 2/3)

**Source:** `mcp_native_gaps_plan.md` Phase 6
**Effort:** ~1 week
**Dependencies:** Steps 7-8 (HTTP + CLI exist)

- **MCP Tier 2:** `get_backlinks`, `get_outgoing_links`, `list_references`, `search_references`, `list_properties`, `query_notes_by_property`
- **MCP Tier 3:** `git_status`, `git_log`, `rename_note`
- **CLI:** `git:*` commands, `reference:*`, `bases:*`, `tasks`, `plugins`, `dev:*`
- **Plugin bridge:** `mcp.*` RPC namespace (list tools, call tools, register plugin-contributed tools)
- **Slash commands:** Plugin contribution point for editor `/` menu

**Why here:** Breadth expansion. Core platform is stable; this fills out the surface area.

**Exit criteria:** Full CLI command surface works. MCP Tier 2/3 tools available. Plugins can consume and extend MCP.

---

### Step 13: Editor Drag Handles

**Source:** `2026-04-02_smart_linking_and_block_notes.md` Phase 4
**Effort:** ~4 days
**Dependencies:** None (ProseMirror model already block-structured)

- Block detection ProseMirror plugin
- Drag handle UI in gutter on hover (headings, list items, paragraphs > N words)
- Drag-and-drop reordering (updates markdown, triggers re-indexing)
- No database changes

**Exit criteria:** Users can drag blocks to reorder content within a note. Markdown round-trips correctly.

---

### Step 14: Metadata Events + Link Resolution

**Source:** `metadata_api_surface.md` Phases C1, A4, D1
**Effort:** ~3 days
**Dependencies:** Step 4 (populated note_links), Step 9 (getFileCache)

- **C1.** Emit `metadata-changed` events on note upsert/rename/delete via Tauri event system. Plugin bridge subscribes and forwards to iframe.
- **A4.** Resolved/unresolved link map — cross-reference `note_links.target` against known paths. Flag on each link row.
- **D1.** `getFirstLinkpathDest(linkpath, sourcePath)` with vault index lookup — extend existing `resolve_note_link`/`resolve_wiki_link` to search the note index by filename.

**Exit criteria:** Plugins receive `metadata-changed` events. Links have resolution status. Wiki-link resolution searches the vault index.

---

### Step 15: Graph Visualization Layer

**Source:** `2026-04-02_smart_linking_and_block_notes.md` Phase 5
**Effort:** ~4 days
**Dependencies:** Steps 5-6 (smart links exist), Step 11 (block embeddings for section-level edges)

- Smart links rendered as dashed edges with rule provenance on hover
- Block-level (section) edges in graph visualization
- Changes to Rust graph builder, TS graph types, D3 rendering layer

**Exit criteria:** Graph view shows smart link edges. Hovering shows which rules triggered. Section-level edges visible when block embeddings exist.

---

### Step 16: Power Features

**Source:** `mcp_native_gaps_plan.md` Phase 7 + `metadata_api_surface.md` 3d-3e
**Effort:** Ongoing
**Dependencies:** All prior steps

- **Bulk property operations** (`metadata_rename_property`, `metadata_delete_property`) with git checkpoint
- **Nested property flattening** (one-level dot notation: `author.name`)
- **Plugin SDK / scaffolding** (`@carbide/plugin-types`, `create-carbide-plugin`)
- **Plugin-contributed MCP tools**
- **CLI TUI mode** (interactive, autocomplete, history — ratatui/rustyline)

**Exit criteria:** Bulk property rename modifies all matching notes atomically. CLI TUI provides interactive browsing.

---

## Dependency Graph

```
Step 1 (MCP stdio) ─────────────────────────────────┐
    │                                                │
Step 2 (headings cmd) [trivial, parallel-safe]       │
    │                                                │
Step 3 (metadata foundations) ──────┐                │
    │                               │                │
Step 4 (ctime + note_links) ───────┤                │
    │                               │                │
Step 5 (smart linking P1) ◄────────┘                │
    │                                                │
Step 6 (smart linking P2)                            │
                                                     │
Step 7 (HTTP + CLI) ◄───────────────────────────────┘
    │
Step 8 (auto-setup)
    │
Step 9 (getFileCache) ◄──── Steps 2, 3, 4
    │
Step 10 (plugin hardening) [independent]
    │
Step 11 (block embeddings) ◄──── Step 6
    │
Step 12 (extended tools) ◄──── Steps 7, 8
    │
Step 13 (editor drag) [independent]
    │
Step 14 (metadata events + link resolution) ◄──── Steps 4, 9
    │
Step 15 (graph viz) ◄──── Steps 5, 6, 11
    │
Step 16 (power features) ◄──── all prior
```

### Parallelization Opportunities

Steps that can run concurrently if multiple contributors are available:

| Track A (Infrastructure)      | Track B (Features)          |
| ----------------------------- | --------------------------- |
| Step 1 (MCP stdio)            | —                           |
| Step 3 (metadata foundations) | Step 4 (ctime + note_links) |
| Step 7 (HTTP + CLI)           | Steps 5-6 (smart linking)   |
| Step 8 (auto-setup)           | Step 9 (getFileCache)       |
| Step 12 (extended tools)      | Step 11 (block embeddings)  |
| —                             | Step 13 (editor drag)       |

---

## Cross-Reference to Source Documents

| Step | Source Document                                                     | Source Section            |
| ---- | ------------------------------------------------------------------- | ------------------------- |
| 1    | `mcp_native_gaps_plan.md`                                           | Phase 1 (1a-1d)           |
| 2    | `metadata_api_surface.md`                                           | Phase A2                  |
| 3    | `mcp_native_gaps_plan.md`                                           | Phase 2 (Gaps 3a, 3b, 3c) |
| 4    | `metadata_api_surface.md`                                           | Phases A1, A3             |
| 5    | `2026-04-02_smart_linking_and_block_notes.md`                       | Phase 1                   |
| 6    | `2026-04-02_smart_linking_and_block_notes.md`                       | Phase 2                   |
| 7    | `mcp_native_gaps_plan.md`                                           | Phase 3 + `cli_design.md` |
| 8    | `mcp_native_gaps_plan.md`                                           | Phase 4                   |
| 9    | `metadata_api_surface.md`                                           | Phases B1, B2             |
| 10   | `mcp_native_gaps_plan.md`                                           | Phase 5 (Gaps 2a-2e)      |
| 11   | `2026-04-02_smart_linking_and_block_notes.md`                       | Phase 3                   |
| 12   | `mcp_native_gaps_plan.md`                                           | Phase 6                   |
| 13   | `2026-04-02_smart_linking_and_block_notes.md`                       | Phase 4                   |
| 14   | `metadata_api_surface.md`                                           | Phases C1, A4, D1         |
| 15   | `2026-04-02_smart_linking_and_block_notes.md`                       | Phase 5                   |
| 16   | `mcp_native_gaps_plan.md` Phase 7 + `metadata_api_surface.md` 3d-3e |

---

## Success Criteria (Consolidated)

Drawn from all three source documents. Checked per step, not repeated here — see source documents for full checklists:

- `mcp_native_gaps_plan.md` → MCP, CLI, Metadata, Plugin Hardening, Cross-Cutting criteria
- `metadata_api_surface.md` → getFileCache shape, gap closure
- `2026-04-02_smart_linking_and_block_notes.md` → Testing strategy, phase exit criteria

**Global invariants (every step):**

- `pnpm check`, `pnpm lint`, `pnpm test`, `cargo check` pass
- No new frontend dependencies unless justified
- Architecture decision tree in `docs/architecture.md` followed
- Commit after every task completion
