# Integration Architecture Assessment: LSPs, Linters, AST, Database, and Extensibility

> Status: **Draft** (§12.7 native route + §12.2 Phase C in progress)\
> Last updated: 2026-03-23

This document assesses how Carbide's existing subsystems — IWE (LSP), rumdl (linter LSP), AST-indexed SQLite schema, semantic search, plugin system, and editor plugins — can be unified into a coherent, efficient, and extensible architecture.

---

## 1\. Current State: Five Parallel Intelligence Pipelines

Carbide currently has five independent subsystems that understand vault content, each with its own lifecycle, transport, and data model:

| Pipeline               | Backend                    | Transport      | Index                                                          | Strengths                                                                | Blind Spots                                                           |
| ---------------------- | -------------------------- | -------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| **AST-indexed schema** | Comrak (Rust)              | Tauri IPC      | SQLite tables (tags, sections, links, code blocks, properties) | Structured queries, relational joins, property filtering                 | No live buffer awareness; stale until save                            |
| **IWE** (`iwes`)       | Standalone Rust LSP        | stdio JSON-RPC | In-memory on startup walk                                      | Hover, definition, references, rename, symbols, completions, inlay hints | No file watcher; restart required for new files; no query composition |
| **rumdl**              | Standalone Rust LSP        | stdio JSON-RPC | Per-document on change                                         | 71 lint rules, diagnostics, code actions, formatting                     | Content-blind (no semantic understanding); no cross-file analysis     |
| **FTS5**               | SQLite                     | Tauri IPC      | FTS5 virtual table                                             | Full-text content search                                                 | No structural queries (tags, links, sections)                         |
| **Semantic search**    | `bge-small-en-v1.5` (ONNX) | Tauri IPC      | `sqlite-vec` KNN                                               | Meaning-based similarity                                                 | No exact match; no structural queries; index lag                      |

**Core problem:** These pipelines don't compose. A user cannot ask "find notes in `[[Projects]]` that reference `[[API Design]]` and contain 'deadline'" — that query spans IWE references, AST links, and FTS5 content search. Each pipeline answers one dimension; no orchestration layer combines them.

---

## 2\. Architectural Consolidation Opportunities

### 2.1 Shared LSP Client Infrastructure

**Previous duplication (resolved):** IWE and rumdl each maintained separate LSP client wiring with duplicated lifecycle management, restart logic, and JSON-RPC dispatch. Lint now uses the shared `RestartableLspClient`; IWE uses the shared `LspClient` directly.

**Toolchain Manager** (implemented, `20260323_toolchain_manager_CRITICAL.md`) addresses this:

| Phase   | What                                                | Impact                                                                                   | Status  |
| ------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------- |
| Phase 1 | `ToolSpec` registry + auto-download                 | Any LSP tool becomes a first-class citizen without build-time bundling                   | ✅ Done |
| Phase 2 | `RestartableLspClient` wrapper                      | Eliminated \~445 lines of duplicated restart logic in lint                               | ✅ Done |
| Phase 3 | Lint refactored to shared `RestartableLspClient`    | `lint/lsp.rs` 690 → 270 lines                                                            | ✅ Done |
| Phase 4 | IWE uses toolchain resolver                         | Removed manual binary path configuration                                                 | ✅ Done |
| Phase 5 | Frontend toolchain feature + "Tools" settings panel | Lifecycle reactor, DI wiring, settings UI (all tool config consolidated under Tools tab) | ✅ Done |
| Phase 6 | Build pipeline cleanup                              | Sidecar removed from build/CI                                                            | ✅ Done |

**Status:** Toolchain manager is fully implemented and operational. The `RestartableLspClient` is the entry point for lint's LSP lifecycle. IWE still uses bare `LspClient` (its restart logic is frontend-managed). Adding a future LSP tool (Markdown Oxide, ltex-ls, custom query LSP) now requires only a `ToolSpec` registry entry + a thin service wrapper.

**Design constraint (validated by implementation):** The shared LSP client is generic over tool capabilities. `ToolSpec` declares binary name, platform variants, and download metadata. LSP-specific config (initialization options, args, restart policy) is handled by each tool's service wrapper (`LintLspSession`, IWE's `LspClient` usage). The `RestartableConfig` wraps `LspClientConfig` + max_restarts + backoff. This separation keeps the toolchain layer tool-agnostic.

**Remaining gap (resolved §12.1):** `ToolSpec` now declares `capabilities: &'static [ToolCapability]` — each tool advertises which LSP features it provides (`DocumentSync`, `Diagnostics`, `Completion`, etc.). The sync reactor can query this metadata to discover sync-eligible tools. Full auto-registration of callbacks deferred to §12.6.

### 2.2 Unified Document Sync Reactor

**Current state:** Two independent reactors sync document changes to two LSP servers:

- `iwe_document_sync.reactor.svelte.ts` → IWE (`did_open`/`did_change`, 500ms debounce)
- `lint.reactor.svelte.ts` → rumdl (`notify_file_opened`/`notify_file_changed`/`notify_file_closed`, embedded in lifecycle reactor)

Both watch the same editor state (`EditorStore`) and send equivalent `textDocument/didOpen`, `textDocument/didChange`, `textDocument/didClose` notifications via their respective service layers. Adding a third LSP tool would mean a third reactor doing the same thing.

**Proposed: `lsp_document_sync.reactor.svelte.ts`**

A single reactor that fans out document sync events to all active LSP clients:

```
EditorStore (buffer changes)
       │
       ▼
lsp_document_sync.reactor
       │
       ├──► IWE client (didOpen/didChange/didSave)
       ├──► rumdl client (didOpen/didChange/didSave)
       └──► [future tool] client (didOpen/didChange/didSave)
```

**Key design decisions:**

- **Per-tool debounce:** Each tool registration includes its own debounce interval. IWE stays at 500ms; rumdl at 300ms. The reactor manages independent debounce timers per client.
- **Registration API:** `lsp_sync_reactor.register(client_id, lsp_client, { debounce_ms })` — tools register when their lifecycle reactor starts them.
- **Deregistration:** On tool stop/crash, the reactor stops sending to that client. No error propagation to the editor.
- **Document URI normalization:** Centralize the URI encoding workaround (currently IWE-specific) into the shared sync layer with a per-tool URI strategy.

**Status:** ✅ Implemented as `lsp_document_sync.reactor.svelte.ts`. IWE and lint register as clients in `reactors/index.ts`. `iwe_document_sync.reactor.svelte.ts` removed; lint reactor slimmed to lifecycle + format-on-save only.

**Impact:** Eliminates reactor duplication, centralizes the document sync contract, and makes adding new LSP tools a one-line registration rather than a new reactor.

### 2.3 AST Parse Pipeline: Single Parse, Multiple Consumers

**Current flow:**

1. User edits in ProseMirror → markdown buffer
2. On save: `write_and_index_note` → Comrak parse → SQLite upsert (tags, sections, links, code blocks, properties)
3. Separately: `didChange` → IWE re-parses the same markdown
4. Separately: `didChange` → rumdl re-parses the same markdown

Three independent parses of the same content. The Comrak parse is authoritative for structured data; IWE and rumdl parse for their own purposes (which is correct — they need different AST representations). But the **Comrak parse results** could be shared more broadly.

**Proposed: Expose `ParsedNote` to the frontend**

Currently `ParsedNote` (headings, tags, sections, links, code blocks, stats) is computed in Rust and immediately flattened into SQL. Instead:

1. Return `ParsedNote` as a structured JSON payload alongside the SQL upsert
2. Store it in a frontend `ParsedNoteCache` (keyed by `file_path + generation`)
3. Consumers that need structural data (tag sidebar, outline panel, frontmatter widget, future query solver) read from this cache instead of re-querying SQLite

**Why:** Reduces IPC round-trips for structural queries. The outline panel currently re-derives heading structure from ProseMirror; the tag sidebar queries SQLite. Both could read directly from the cached parse result.

**Constraint:** This is a performance optimization, not a correctness change. SQLite remains the authoritative persistent store. The cache is ephemeral and invalidated on each save cycle.

---

## 3\. Composable Query Language: The Missing Orchestration Layer

### 3.1 Why This Is the Highest-Value Integration

The Tangent research (`carbide/research/tangent.md`) identifies the core gap: Carbide's five intelligence pipelines don't compose. A query language that orchestrates across them transforms isolated capabilities into a unified retrieval system.

**What each pipeline contributes to a unified query:**

| Query Clause            | Solver Backend                           | Existing Port         |
| ----------------------- | ---------------------------------------- | --------------------- |
| `named "pattern"`       | Omnibar fuzzy search (SkimMatcherV2)     | `SearchPort`          |
| `with "text"`           | FTS5 full-text search                    | `SearchPort`          |
| `with #tag`             | `note_inline_tags` table (AST schema)    | `TagsPort`            |
| `in [[Folder]]`         | Vault file tree                          | `VaultPort`           |
| `linked from [[Note]]`  | IWE references (`iwe_port.references()`) | `IwePort`             |
| `with property = value` | `notes_by_property_filter` (AST schema)  | `BasesPort`           |
| `similar to "concept"`  | Semantic search (embeddings)             | `SearchPort` (future) |

**Every backend already exists.** The query language is pure orchestration — parse the query, dispatch clauses to existing ports, compose results with AND/OR/NOT logic.

### 3.2 Recommended Architecture (Option C from Tangent research, refined)

```
src/lib/features/query/
├── ports.ts                         # QueryPort interface
├── types.ts                         # Query AST, QueryResult, QueryClause
├── domain/
│   ├── query_parser.ts              # Recursive descent parser (~700 LOC)
│   └── query_solver.ts              # Clause dispatch + composition (~400 LOC)
├── application/
│   ├── query_service.ts             # Parse → solve → cache orchestration
│   └── query_actions.ts             # Command palette + omnibar integration
├── state/
│   └── query_store.svelte.ts        # Results, saved queries, active query
├── adapters/
│   └── query_composite_adapter.ts   # Wires to existing ports (not Tauri directly)
└── ui/
    ├── query_panel.svelte           # Results display (reuse IWE panel patterns)
    └── query_input.svelte           # Syntax-highlighted input with autocomplete
```

**Critical design decision:** The `query_composite_adapter.ts` does NOT call Tauri commands directly. It composes existing ports:

```typescript
interface QueryBackends {
  search: SearchPort; // FTS5 + fuzzy
  tags: TagsPort; // AST-indexed tags
  vault: VaultPort; // File tree
  iwe: IwePort; // References, symbols
  bases: BasesPort; // Property queries
}
```

This means the query feature inherits all existing error handling, caching, and lifecycle management from those ports. No new Tauri commands needed for v1.

**Solver composition logic:**

- `AND`: Sequential filter — first clause produces candidate set, subsequent clauses narrow it
- `OR`: Union — each clause produces candidates, merge with dedup
- `NOT`: Negate — exclude matches from the candidate set
- **Optimization:** Start with the most selective clause (property filter or tag query, which hit indexed SQLite tables) before falling back to FTS5 or IWE references

### 3.3 Omnibar Integration

The omnibar already has a prefix system. Add `?` prefix for query mode:

```
? Notes with #project/carbide and linked from [[Architecture]]
```

Or a dedicated "Query" command palette entry that opens the query panel with a full editor.

### 3.4 Saved Queries as Vault Entities

**Status:** ✅ Implemented as Phase 5.1.

- `.query` files stored as plain text in the vault (one query per file, file name = query name)
- `SavedQueryPort` + `saved_query_tauri_adapter.ts` for CRUD via `read_vault_file`/`write_vault_file` + `list_vault_files_by_extension`/`delete_vault_file` (new Rust commands)
- Query panel shows saved queries as a tag-like chip list with load (click) and delete (×) actions
- Save dialog with name validation (no invalid filesystem chars, no dots, max 200 chars)
- Save/delete errors surfaced through `OpStore` per architecture conventions
- Saved queries resync from disk after save (no optimistic metadata)
- Future: lens views (Cards/Feed/List) render query results — aligns with the Tangent lens system

---

## 4\. Markdown Oxide: Complementary or Redundant?

### 4.1 Capability Overlap Analysis

Markdown Oxide is another markdown LSP server (Rust-based) with features that overlap significantly with IWE:

| Capability                  | IWE (`iwes`)           | Markdown Oxide     | Verdict             |
| --------------------------- | ---------------------- | ------------------ | ------------------- |
| Hover on wiki links         | Yes                    | Yes                | Overlap             |
| Go-to-definition            | Yes                    | Yes                | Overlap             |
| Find references             | Yes                    | Yes                | Overlap             |
| Workspace symbols           | Yes                    | Yes                | Overlap             |
| Completions                 | Yes (dynamic triggers) | Yes (`[[` trigger) | Overlap             |
| Rename                      | Yes                    | Yes                | Overlap             |
| Formatting                  | Yes                    | No                 | IWE only            |
| Code actions                | Yes                    | Limited            | IWE stronger        |
| Inlay hints                 | Yes                    | No                 | IWE only            |
| Tag completion              | No                     | Yes (`#` trigger)  | Markdown Oxide only |
| Footnote support            | No                     | Yes                | Markdown Oxide only |
| Daily note integration      | No                     | Yes                | Markdown Oxide only |
| Unresolved link diagnostics | No                     | Yes                | Markdown Oxide only |

### 4.2 Integration Strategy

**Do not run both simultaneously as general-purpose LSPs.** The overlap is too large — duplicate hovers, duplicate completions, conflicting rename behavior.

**Instead, consider Markdown Oxide for gap-filling only:**

1. **Tag completion via `#` trigger:** IWE's completion is server-defined (currently `+` for iwes). If tag completion is high-value, either:
   - Request it as an iwes feature (preferred — single LSP)
   - Run Markdown Oxide in a restricted mode (completion-only, no hover/definition/references)
2. **Unresolved link diagnostics:** rumdl handles markdown linting but not semantic link validation. This is a genuine gap. Options:
   - Add a custom diagnostic rule to rumdl (Rust change, but rumdl is extensible)
   - Add link validation as a post-save check in the AST pipeline (compare `note_links.target` against known files)
   - Run Markdown Oxide as a diagnostics-only server
3. **Daily note / footnote support:** These are editor-level features, not LSP-level. Better implemented as ProseMirror plugins or AST pipeline extensions.

**Recommendation:** Invest in iwes feature requests rather than running a second general-purpose markdown LSP. The toolchain manager makes it _easy_ to add Markdown Oxide later if iwes doesn't evolve, but running two overlapping LSPs adds complexity (conflict resolution, double diagnostics, confusing UX) that outweighs the gap-filling value.

---

## 5\. Diagnostics Unification: Single Problems Panel, Multiple Sources

### 5.1 Current State (Implemented)

**Status:** ✅ Diagnostics unification is implemented. All diagnostic sources push to a single `DiagnosticsStore`.

- **rumdl diagnostics** → `LintService` → `DiagnosticsStore` (source: `"lint"`) → Problems panel + gutter markers
- **IWE diagnostics** → `IweService` → `DiagnosticsStore` (source: `"iwe"`) → Problems panel + gutter markers
- **AST parse errors** → Not yet surfaced (deferred; requires Rust-side `write_and_index_note` changes)
- **Future: query parse errors** → Can push to `DiagnosticsStore` with source `"query"` when needed

### 5.2 `DiagnosticsStore` Implementation

```typescript
type DiagnosticSource = "lint" | "iwe" | "ast" | "plugin";
type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

type Diagnostic = {
  source: DiagnosticSource;
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  severity: DiagnosticSeverity;
  message: string;
  rule_id: string | null;
  fixable: boolean;
};
```

**All diagnostic sources push to a single `DiagnosticsStore`:**

```
rumdl LSP ──────► DiagnosticsStore ◄────── IWE LSP
                       ▲       │
[future: AST errors] ──┘       ▼
                       Problems Panel
                       (source filter: All | Lint | IWE)
```

**Key design:** Two-level `SvelteMap<DiagnosticSource, SvelteMap<file_path, Diagnostic[]>>` — diagnostics from different sources for the same file don't overwrite each other (fixing a bug in the previous `LintStore`-based approach).

**What changed:**

- `LintStore` slimmed to status-only (no more `diagnostics_by_file`)
- `IweService` no longer depends on `LintStore` — eliminated cross-feature coupling
- Problems panel has source filter dropdown (All / Lint / IWE)
- Unified severity counts in status bar read from `DiagnosticsStore`
- Single gutter/decoration pipeline in CodeMirror via `Diagnostic` type
- Plugins can push diagnostics through `diagnostics_store.push("plugin", ...)` when Plugin API Phase 2b is implemented

---

## 6\. Plugin System as the Extensibility Surface

### 6.1 Current Plugin Capabilities

The plugin system (Phase 1a complete, 1b in progress) already provides:

- iframe sandbox with postMessage RPC
- Permission-gated access to vault, editor, commands, UI, events, settings
- Command palette registration
- Status bar items
- Sidebar panels

### 6.2 Missing Plugin API Surface for Integration Features

| Capability                              | Current Status | Needed For                                    |
| --------------------------------------- | -------------- | --------------------------------------------- |
| `diagnostics.push(file, diagnostics[])` | ✅ Available   | Plugin-authored lint rules, custom validators |
| `search.fts(query, limit?)`             | ✅ Available   | Plugin-driven FTS5 search                     |
| `search.tags(tag?)`                     | ✅ Available   | Plugin-driven tag queries                     |
| `events.on("note-indexed")`             | ✅ Available   | React to vault index changes                  |
| `lsp.register(tool_spec)`               | Not available  | Third-party LSP tools via plugins             |
| `ast.get_parsed(file)`                  | Not available  | Plugin access to structural metadata          |
| `ui.add_panel_tab(panel_id, component)` | Not available  | Custom tabs in Problems/IWE panels            |

### 6.3 Phased Plugin API Extension

**Phase 2a (alongside query language):** ✅ Done

- `search.fts(query, limit?)` — FTS5 through plugin RPC, permission-gated by `search:read`
- `search.tags(tag?)` — list all tags or notes for a specific tag
- `events.on("note-indexed")` — emitted when vault indexing completes

**Phase 2b (alongside diagnostics unification):** ✅ Done

- `diagnostics.push(file, diagnostics[])` — plugins contribute diagnostics with source `plugin:<plugin_id>`
- `diagnostics.clear(file?)` — per-plugin cleanup (all files or specific file), permission-gated by `diagnostics:write`

**Phase 3 (advanced):**

- `lsp.register(tool_spec)` — plugins declare their own LSP tools; toolchain manager downloads and manages them
- `ast.get_parsed(file)` — expose `ParsedNote` cache to plugins
- `query.register_clause(clause_type, solver_fn)` — plugins extend the query language with custom clause types

**Phase 3 is speculative and should only proceed if user demand materializes.**

---

## 7\. Efficiency: Reducing Redundant Work

### 7.1 Parse Deduplication

| Event                | Current Parses                                                    | Optimized Parses                                                          |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| User saves note      | Comrak (Rust, SQLite index) + IWE (in-memory) + rumdl (in-memory) | Comrak (Rust) → cache + IWE (separate, needed) + rumdl (separate, needed) |
| User edits (unsaved) | IWE (didChange) + rumdl (didChange)                               | Same (both need live buffer)                                              |
| Vault open           | Comrak (full walk) + IWE (full walk)                              | Comrak first → IWE can use cached results (if protocol allows)            |

**Realistic optimization:** The three parsers serve different purposes (structured indexing, code intelligence, linting) and need different AST representations. Full deduplication is not feasible without tightly coupling the tools. The practical wins are:

- **Cache `ParsedNote` on save** (eliminates frontend re-queries to SQLite for structural data)
- **Unified document sync** (eliminates reactor duplication, not parse duplication)
- **Lazy IWE startup** (defer IWE initialization until first LSP feature is used, not on vault open)

### 7.2 SQLite Query Efficiency

The AST-indexed schema already provides efficient structural queries. Key optimization for the query language solver:

- **Tag queries:** `note_inline_tags` table with `(tag, source)` index → O(log n) lookup
- **Section queries:** `note_sections` table with `(note_path, heading_id)` index → section-scoped filtering
- **Property queries:** `notes_by_property_filter` with operator push-down → SQL does the filtering, not the frontend
- **Link queries:** `note_links` table with `(source_path, target_path)` index → efficient backlink resolution

**For the query solver:** Prefer SQLite-backed clauses as the initial filter (tags, properties, links) before IWE-backed clauses (references, which require per-file LSP calls) or FTS5 (which scans the full-text index).

### 7.3 IPC Round-Trip Reduction

| Current Pattern                                 | Round Trips   | Proposed Pattern                          | Round Trips  |
| ----------------------------------------------- | ------------- | ----------------------------------------- | ------------ |
| Save → write file → re-read → parse → 7 SQL ops | 2 IPC         | `write_and_index_note` (done)             | 1 IPC        |
| Query: tag filter + FTS + references            | 3+ IPC        | Batch query command with composite result | 1 IPC        |
| Diagnostics: lint + IWE + AST                   | 3 push events | Unified diagnostics event                 | 1 push event |

**Batch query command:** For the query solver, consider a Rust-side `query_execute` command that handles SQL-backed clauses (tags, properties, links, FTS) in a single transaction and returns a unified result set. Only IWE-backed clauses (references) require separate IPC.

---

## 8\. Integration Roadmap

### Phase 1: Foundation (Toolchain Manager + Unified Sync)

| Step | What                                                                                | Depends On | Status                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Toolchain Manager Phase 1-2 (ToolSpec + RestartableLspClient)                       | Nothing    | ✅ Done                                                                                                                                                             |
| 1.2  | Unified `lsp_document_sync.reactor`                                                 | 1.1        | ✅ Done — `lsp_document_sync.reactor.svelte.ts` with per-client registration; lint reactor slimmed from 149 → 85 LOC; `iwe_document_sync.reactor.svelte.ts` removed |
| 1.3  | Toolchain Manager Phase 3-6 (refactor lint + IWE, frontend settings, build cleanup) | 1.1        | ✅ Done                                                                                                                                                             |

### Phase 2: Query Language (The Orchestration Layer)

| Step | What                                              | Depends On | Status                                                                                                                                                              |
| ---- | ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | Query parser (recursive descent, Tangent grammar) | Nothing    | ✅ Done — `query_parser.ts`, supports forms, clauses (named/with/in/linked from/with_property), joins (and/or), negation, values (text/regex/wikilink/tag/subquery) |
| 2.2  | Query solver (dispatch to existing ports)         | 2.1        | ✅ Done — `query_solver.ts`, dispatches to SearchPort, TagPort, WorkspaceIndexPort, BasesPort; AND/OR/NOT composition                                               |
| 2.3  | Query feature module (store, service, actions)    | 2.2        | ✅ Done — QueryStore, QueryService, query_actions, action IDs, DI wiring, barrel index                                                                              |
| 2.4  | Query panel UI (results display, input)           | 2.3        | ✅ Done — Query tab in bottom panel with input, results list, status/error display                                                                                  |
| 2.5  | Omnibar `?` prefix integration                    | 2.3        | ✅ Done — `?` prefix in omnibar opens query panel and executes query on Enter                                                                                       |
| 2.6  | Batch query Rust command (SQL-backed clauses)     | 2.2        | **Deferred** — current frontend-only solver is sufficient for v1; Rust batch optimization can be added when performance requires it                                 |

### Phase 3: Diagnostics Unification

| Step | What                                  | Depends On | Status                                                                                                                                                                               |
| ---- | ------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1  | `DiagnosticsStore` with unified type  | Nothing    | ✅ Done — `diagnostics_store.svelte.ts` with `Diagnostic` type (source, severity, position, message, rule_id, fixable); two-level `SvelteMap<source, SvelteMap<file, Diagnostic[]>>` |
| 3.2  | Lint adapter → DiagnosticsStore       | 3.1        | ✅ Done — `LintService` accepts optional `DiagnosticsStore`, maps `LintDiagnostic` → `Diagnostic` with `source: "lint"`; `LintStore` slimmed to status-only                          |
| 3.3  | IWE adapter → DiagnosticsStore        | 3.1        | ✅ Done — `IweService` takes `DiagnosticsStore` instead of `LintStore`; pushes with `source: "iwe"`; eliminated cross-feature deep import of `lint/types/lint`                       |
| 3.4  | Problems panel reads DiagnosticsStore | 3.1        | ✅ Done — Problems panel reads from `stores.diagnostics`; source filter dropdown (All/Lint/IWE) added; bottom panel and status bar wired to `DiagnosticsStore` counts                |
| 3.5  | AST parse error surfacing             | 3.1        | **Deferred** — requires Rust-side changes to return parse errors from `write_and_index_note`; can be added incrementally by pushing to `diagnostics_store.push("ast", ...)`          |

### Phase 4: Plugin API Extension

| Step | What                                            | Depends On   | Status                                                                                                                                                                                       |
| ---- | ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | Plugin search RPC (`search.fts`, `search.tags`) | Phase 2      | ✅ Done — `search.fts(query, limit?)` dispatches to SearchPort FTS5; `search.tags()` lists all tags; `search.tags(tag)` returns notes for tag. Permission: `search:read`                     |
| 4.2  | Plugin diagnostics RPC                          | Phase 3      | ✅ Done — `diagnostics.push(file, diags[])` pushes to DiagnosticsStore with source `plugin:<plugin_id>`; `diagnostics.clear(file?)` clears per-plugin. Permission: `diagnostics:write`       |
| 4.3  | Plugin `note-indexed` event                     | AST pipeline | ✅ Done — `note-indexed` event emitted when `SearchStore.index_progress` transitions to `completed`; reactor in `mount_reactors` watches status and calls `plugin_service.emit_plugin_event` |

### Phase 5: Advanced (Only If Demand Materializes)

| Step | What                                           | Rationale                                                  | Status                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | Saved queries as `.query` files                | Enables "smart folders"                                    | ✅ Done — `.query` files stored as plain text in vault; `SavedQueryPort` + Tauri adapter; Rust `list_vault_files_by_extension` + `delete_vault_file` commands; save/load/delete via OpStore; query panel UI with saved queries list, save dialog, delete button; domain validation (`validate_query_name`, `query_path_from_name`); 3 test suites (26 new tests)  |
| 5.2  | Lens views (Cards/Feed/List) for query results | Tangent-inspired browsing                                  | ✅ Done — Three switchable views: List (compact, default), Cards (grid with title, path, date, size, matched clauses), Feed (expanded with relative timestamps, folder paths, clauses). View mode is component-local `$state`. Toggle via lucide icon buttons in results header. Each view is a separate Svelte component (`query_result_list/cards/feed.svelte`) |
| 5.3  | Sliding panel UX (thread navigation)           | Spatial context preservation                               | Not started                                                                                                                                                                                                                                                                                                                                                       |
| 5.4  | Plugin LSP registration                        | Third-party LSP tools via plugins                          | Not started                                                                                                                                                                                                                                                                                                                                                       |
| 5.5  | Markdown Oxide as gap-fill LSP                 | Only if iwes doesn't add tag completion / link diagnostics | Not started                                                                                                                                                                                                                                                                                                                                                       |

---

## 9\. Key Design Principles

### 9.1 Compose Existing Ports, Don't Create New Backends

The query language succeeds because it wires existing ports together. Every clause maps to an existing backend. The temptation to build a "unified index" that replaces SQLite + IWE + FTS5 should be resisted — each backend is optimized for its domain.

### 9.2 One Reactor Per Concern, Not Per Tool

Document sync is one concern. Diagnostics display is one concern. Don't multiply reactors by the number of tools. Fan-out inside the reactor.

### 9.3 Tools Are Opaque; Capabilities Are Typed

The toolchain manager should treat tools as opaque binaries with typed capability declarations. IWE and rumdl happen to be LSP servers, but a future tool might be a CLI formatter or a WASM module. The `ToolSpec` should declare what the tool provides (diagnostics, completions, formatting, etc.), not how it provides it.

### 9.4 Frontend Orchestration, Backend Execution

Keep the orchestration logic (query solving, diagnostics merging, document sync fan-out) in the frontend where it's testable with Vitest and reactive with Svelte 5. Keep the execution (SQL queries, file I/O, LSP transport) in the Rust backend. This aligns with Carbide's existing thin-backend architecture.

### 9.5 Progressive Enhancement Over Big-Bang Integration

Each phase is independently valuable:

- Toolchain manager is valuable even without query language
- Query language is valuable even without diagnostics unification
- Diagnostics unification is valuable even without plugin extensions
- No phase blocks on another phase (except 1.1 → 1.2)

---

## 10\. Risk Assessment

| Risk                                                    | Likelihood | Impact | Mitigation                                                                               |
| ------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------- |
| Query solver performance with large vaults (10k+ notes) | Medium     | Medium | Start with SQL-backed clauses (indexed); defer IWE-backed clauses to user-triggered mode |
| IWE and rumdl conflict on diagnostics for same range    | Low        | Low    | DiagnosticsStore deduplicates by (file, range, source); UI groups by source              |
| Unified sync reactor introduces latency for one tool    | Low        | Medium | Per-tool debounce timers; independent send paths; failure isolation                      |
| Markdown Oxide adoption pressure from users             | Medium     | Low    | Toolchain manager makes it trivial to add later; no architectural commitment needed now  |
| Plugin API surface grows uncontrollably                 | Medium     | High   | Gate every new RPC behind a permission; version the plugin API; deprecation policy       |
| Query language grammar diverges from Tangent            | Low        | Low    | Tangent's grammar is a starting point, not a contract; Carbide can extend/modify freely  |

---

## 11\. What NOT to Build

| Anti-Pattern                                                      | Why Not                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Unified AST that replaces Comrak + IWE + rumdl parsers            | Each parser serves a different purpose; tight coupling would prevent independent tool upgrades     |
| Custom LSP protocol extensions for cross-tool queries             | Violates LSP's per-tool design; query composition belongs in the frontend orchestration layer      |
| Running Markdown Oxide alongside IWE as dual general-purpose LSPs | Duplicate hovers, completions, references; confusing UX; conflict resolution complexity            |
| Building a query language that bypasses existing ports            | Defeats the composition principle; creates a parallel data path that must be maintained separately |
| Plugin-authored LSP tools before Phase 5                          | Over-engineering; no user demand; toolchain manager handles internal tools first                   |
| Eager indexing on every keystroke                                 | IWE and rumdl handle live buffer; SQLite index is save-time only; this split is correct            |

---

## 12\. Implementation Plans: Deferred Items & Architectural Gaps

> Added: 2026-03-23

This section provides concrete implementation plans for items identified as deferred, not started, or architectural gaps in the roadmap above.

---

### 12.2 ParsedNote Frontend Cache (Gap from §2.3)

**Problem:** On save, Comrak parses the note and flattens results into SQLite. Consumers like the outline panel, tag sidebar, and frontmatter widget then re-query SQLite via separate IPC calls to reconstruct structural data that was _just computed_.

**Goal:** Return `ParsedNote` as a JSON payload from the save operation and cache it in the frontend, eliminating redundant IPC round-trips for structural queries.

**Phase A — Return ParsedNote from save (Rust):**

Modify `write_and_index_note` (or its successor) to return `ParsedNote` alongside the existing success response:

```rust
#[derive(Serialize)]
pub struct WriteAndIndexResult {
    pub success: bool,
    pub parsed: Option<ParsedNoteDto>,  // new
}

#[derive(Serialize)]
pub struct ParsedNoteDto {
    pub title: Option<String>,
    pub headings: Vec<HeadingDto>,
    pub links: NoteLinksDto,
    pub tasks: Vec<TaskDto>,
    pub inline_tags: Vec<InlineTagDto>,
    pub sections: Vec<SectionDto>,
    pub code_blocks: Vec<CodeBlockMetaDto>,
    pub word_count: i64,
    pub reading_time_secs: i64,
}
```

The `ParsedNote` struct already exists in `shared/markdown_doc.rs`. This adds a DTO layer with `#[derive(Serialize)]` (the existing struct may already derive it — verify). The SQL upsert continues unchanged; the DTO is an additional return value.

**Phase B — Frontend cache (`src/lib/features/note/state/parsed_note_cache.svelte.ts`):**

```typescript
export class ParsedNoteCache {
  private cache = new SvelteMap<string, ParsedNoteDto>();

  set(file_path: string, parsed: ParsedNoteDto): void;
  get(file_path: string): ParsedNoteDto | undefined;
  invalidate(file_path: string): void;
  clear(): void;
}
```

Keyed by `file_path`. Invalidated on vault close. Updated on every save via the enriched `WriteAndIndexResult`.

**Phase C — Wire consumers:**

| Consumer                  | Current data source             | New data source                                               | Fallback                        |
| ------------------------- | ------------------------------- | ------------------------------------------------------------- | ------------------------------- |
| Outline panel             | Re-derives from ProseMirror DOM | `parsed_note_cache.get(path).headings`                        | Existing ProseMirror derivation |
| Tag sidebar (active note) | SQLite `note_inline_tags` query | `parsed_note_cache.get(path).inline_tags`                     | SQLite query                    |
| Frontmatter widget        | SQLite `note_properties` query  | `parsed_note_cache.get(path)` (frontmatter is on `NoteMeta`)  | SQLite query                    |
| Query solver              | SQLite via ports                | No change (queries span multiple notes; cache is single-note) | —                               |

Each consumer checks cache first, falls back to existing port call. This is a progressive enhancement — no breaking change.

**Effort:** Medium (~100 LOC Rust DTO + ~80 LOC TypeScript cache + ~50 LOC per consumer wire-up). Two-phase: Phase A+B can land together; Phase C is incremental per consumer.

**Depends on:** Nothing. Pure optimization.

**Status:** ✅ Phase A+B complete. Phase C deferred for incremental adoption.

- **Phase A (Rust):** `ParsedNoteDto` added to `markdown_doc.rs` with `From<ParsedNote>` conversion. `WriteAndIndexResult` enriched with `parsed: Option<ParsedNoteDto>`. `handle_upsert_with_content` returns `ParsedNote` through the DB command channel. All sub-types (`Heading`, `InlineTag`, `Section`, `CodeBlockMeta`, `NoteLinks`, `ParsedInternalLink`) derive `specta::Type` for auto-generated TS bindings.
- **Phase B (Frontend):** `ParsedNoteCache` (SvelteMap-backed) in `note/state/`. Wired into `AppStores`, `ActionRegistrationInput`. `NoteService.write_existing_note` populates cache on save. Cache cleared on vault switch via `vault_actions.ts`.
- **Phase C (Consumers):** 🔄 In progress. The outline panel requires ProseMirror `pos` (not available in `Heading.line`), making it a poor candidate. Tag sidebar queries vault-wide, not per-note. Best initial candidates: document metadata display (word count, reading time from cache instead of separate IPC) and property panels when they land. Cache is ready for consumers when shape requirements align.

---

### 12.4 Batch Query Rust Command (Deferred §2.6)

**Problem:** The frontend query solver dispatches clauses to individual ports sequentially — each tag query, property filter, or FTS search is a separate IPC round-trip. For simple queries this is fine, but complex queries with 3+ SQL-backed clauses incur unnecessary latency.

**Goal:** A single Rust command that executes all SQL-backed query clauses in one transaction, returning a composed result set. IWE-backed clauses (references) remain frontend-dispatched since they require LSP calls.

**When to build:** When profiling shows query execution exceeds ~200ms for common multi-clause queries on vaults with 5k+ notes. The current frontend solver is correct and sufficient for smaller vaults.

**Rust command (`src-tauri/src/features/query/`):**

New feature module (following architecture decision tree: new capability = new feature module):

```
src-tauri/src/features/query/
├── mod.rs
├── types.rs        # QueryClauseDto, BatchQueryRequest, BatchQueryResult
└── service.rs      # batch_query_execute command
```

**Request/Response types:**

```rust
#[derive(Deserialize)]
pub struct BatchQueryRequest {
    pub clauses: Vec<QueryClauseDto>,
    pub composition: String,  // "and" | "or"
}

#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum QueryClauseDto {
    WithTag { tag: String, negated: bool },
    WithText { text: String, negated: bool },
    Named { pattern: String, is_regex: bool, negated: bool },
    InFolder { path: String, negated: bool },
    WithProperty { key: String, operator: String, value: String, negated: bool },
}

#[derive(Serialize)]
pub struct BatchQueryResult {
    pub note_paths: Vec<String>,
    pub matched_clauses_by_path: HashMap<String, Vec<String>>,
    pub elapsed_ms: f64,
}
```

**Execution strategy:**

1. Open single read transaction on SQLite
2. For each clause, produce a `HashSet<String>` of matching note paths:
   - `WithTag` → `SELECT source FROM note_inline_tags WHERE tag = ?`
   - `WithText` → `SELECT path FROM fts5_notes WHERE content MATCH ?`
   - `Named` → `SELECT path FROM notes WHERE path LIKE ?` (or regex via `REGEXP`)
   - `InFolder` → `SELECT path FROM notes WHERE path LIKE ?/%`
   - `WithProperty` → delegate to existing `notes_by_property_filter`
3. Compose sets: AND = intersection, OR = union
4. Apply negation per-clause before composition
5. Return paths + per-path matched clause descriptions

**Frontend solver integration:**

The `query_solver.ts` gains a fast path:

```typescript
async function solve_query(vault_id, query, backends): Promise<QueryResult> {
  const { sql_clauses, lsp_clauses } = partition_clauses(query);

  if (sql_clauses.length > 1 && lsp_clauses.length === 0) {
    // Fast path: batch all SQL clauses in one IPC call
    return await backends.batch_query(vault_id, sql_clauses, query.composition);
  }

  // Existing path: sequential dispatch (or hybrid for mixed SQL+LSP queries)
  // ...
}
```

**Port/Adapter:**

- New `QueryBatchPort` interface with `execute(vault_id, request): Promise<BatchQueryResult>`
- `query_batch_tauri_adapter.ts` wraps `invoke("batch_query_execute", ...)`
- Injected into `QueryBackends` as an optional field: `batch?: QueryBatchPort`

**Effort:** Medium (~250 LOC Rust + ~80 LOC TypeScript). The SQL queries already exist in their respective modules; this composes them under a single transaction.

**Depends on:** Nothing (uses existing SQL schema). Gated on performance need.

---

### 12.5 Sliding Panel UX — Thread Navigation (Not Started §5.3)

**Problem:** Carbide uses a single-note editor with a tab bar. Navigating between related notes (e.g., following a wiki link chain) loses spatial context — the user can't see where they came from or maintain a reading "thread."

**Goal:** Horizontal sliding panel system inspired by Tangent's thread navigation. Notes open as panels that slide in from the right; previous notes collapse to narrow stubs. The user sees their navigation path as a spatial trail.

**Design (from Tangent research `carbide/research/tangent.md`):**

```
┌──────────┬──────────────────────────────────┬──────────────────────────────────┐
│ 32px     │          Previous Note           │          Current Note            │
│ stub     │        (partially visible)        │          (full width)            │
│ ≡ Title  │                                  │                                  │
└──────────┴──────────────────────────────────┴──────────────────────────────────┘
```

**Data model (`src/lib/features/thread/`):**

New feature module:

```
src/lib/features/thread/
├── ports.ts                    # ThreadPort (persistence, optional)
├── types.ts                    # Thread, ThreadItem, ThreadNavigation
├── state/
│   └── thread_store.svelte.ts  # Thread state, navigation stack
├── application/
│   └── thread_service.ts       # Push/pop/navigate operations
├── actions/
│   └── thread_actions.ts       # Action IDs: thread.push, thread.back, thread.forward
└── ui/
    ├── thread_container.svelte # Horizontal flex layout with animated panels
    ├── thread_stub.svelte      # 32px collapsed note stub
    └── thread_panel.svelte     # Full note panel (wraps existing editor)
```

**Core types:**

```typescript
type ThreadItem = {
  note_path: string;
  scroll_position: number; // preserve scroll on collapse
  cursor_position?: { line: number; ch: number };
};

type ThreadState = {
  items: ThreadItem[];
  active_index: number; // which panel is "current"
  max_visible: number; // how many panels fit (responsive)
};
```

**Store:**

```typescript
class ThreadStore {
  items = $state<ThreadItem[]>([]);
  active_index = $state(0);

  get active_item(): ThreadItem | undefined; // derived
  get visible_items(): ThreadItem[]; // derived: items around active_index
  get stub_items(): ThreadItem[]; // derived: collapsed items

  push(note_path: string): void; // add to right of active, trim forward history
  navigate_to(index: number): void; // shift active
  close(index: number): void; // remove item, adjust active_index
  clear(): void;
}
```

**Integration with existing navigation:**

- Wiki link clicks (`[[Note]]`) call `thread_service.push(target_path)` instead of (or in addition to) `editor_service.open_note(target_path)`
- Back button / `Alt+Left` calls `thread_service.back()`
- Thread mode is opt-in: a toggle in the view menu or toolbar switches between tab mode (existing) and thread mode
- `UIStore` gains `navigation_mode: "tabs" | "threads"` to control which system handles note opens

**CSS approach (from Tangent research):**

- Horizontal `display: flex` container with `overflow-x: hidden`
- Active panel: `flex: 1 0 auto; width: clamp(400px, 60%, 800px)`
- Stubs: `flex: 0 0 32px; writing-mode: vertical-lr` for rotated title
- Transitions: Svelte `fly` for panel enter/exit; CSS `transition: width 200ms ease` for collapse/expand

**Persistence (optional, Phase B):**

Thread state can persist to `ThreadPort` → localStorage adapter (per-vault). On vault reopen, restore the last thread. This is a nice-to-have, not a launch requirement.

**Effort:** Large (~800 LOC). This is a new feature module touching navigation, layout, and editor integration. Recommend implementing in sub-phases:

| Sub-phase | What                                            | LOC est. |
| --------- | ----------------------------------------------- | -------- |
| A         | ThreadStore + ThreadService + basic types       | ~200     |
| B         | thread_container.svelte + stub/panel components | ~300     |
| C         | Wire wiki link clicks to thread push            | ~100     |
| D         | Back/forward navigation + keyboard shortcuts    | ~100     |
| E         | Tab ↔ Thread mode toggle in UIStore             | ~100     |

**Depends on:** Nothing. Orthogonal to all other items. Can land incrementally.

---

### 12.6 Plugin LSP Registration (Not Started §5.4)

**Problem:** Plugins cannot bring their own LSP tools. A plugin that wants to integrate ltex-ls (grammar checking), Markdown Oxide (tag completion), or a custom LSP server has no API surface to declare, download, and wire an LSP tool.

**Goal:** `lsp.register(tool_spec)` plugin RPC method that lets plugins declare an LSP tool, with the toolchain manager handling download, lifecycle, and document sync registration.

**When to build:** Only when a concrete plugin needs this. The toolchain manager's static `ToolSpec` registry handles internal tools (rumdl, iwes). Plugin LSP registration is for third-party extensibility.

**Design:**

Plugin declares in its manifest:

```json
{
  "permissions": ["lsp:register"],
  "contributes": {
    "lsp_tools": [
      {
        "id": "ltex-ls",
        "display_name": "LTeX Grammar Checker",
        "github_repo": "valentjn/ltex-ls",
        "version": "16.0.0",
        "binary_name": "ltex-ls",
        "capabilities": ["diagnostics"],
        "platform_binaries": {
          "darwin-aarch64": {
            "asset_pattern": "ltex-ls-*-mac-arm64.tar.gz",
            "sha256": "..."
          },
          "darwin-x86_64": {
            "asset_pattern": "ltex-ls-*-mac-x64.tar.gz",
            "sha256": "..."
          },
          "linux-x86_64": {
            "asset_pattern": "ltex-ls-*-linux-x64.tar.gz",
            "sha256": "..."
          },
          "windows-x86_64": {
            "asset_pattern": "ltex-ls-*-windows-x64.zip",
            "sha256": "..."
          }
        }
      }
    ]
  }
}
```

**RPC API:**

```typescript
// Plugin calls:
await carbide.lsp.register({
  tool_id: "ltex-ls",
  capabilities: ["diagnostics"],
  init_options: { language: "en-US" },
  debounce_ms: 1000,
});

// Carbide responds: downloads binary (if needed), starts LSP, registers for document sync
// Diagnostics automatically flow to DiagnosticsStore with source "plugin:ltex-ls"
```

**Implementation layers:**

1. **Plugin RPC handler** (`plugin_rpc_handler.ts`): New `lsp.register` method, gated by `lsp:register` permission
2. **ToolchainService extension**: `register_dynamic_tool(spec: DynamicToolSpec)` — adds to runtime registry (not static `TOOLS` array)
3. **Rust ToolSpec enhancement**: `DynamicToolSpec` struct that mirrors `ToolSpec` but is runtime-constructed from plugin manifest JSON
4. **Lifecycle management**: Plugin-registered tools are started/stopped with the plugin lifecycle. Plugin unload → tool stop + deregister from sync reactor
5. **Document sync**: Auto-register with `lsp_document_sync.reactor` using capabilities from the registration (reads `DocumentSync` capability per §12.1)
6. **Diagnostics routing**: Diagnostics from plugin-registered LSPs push to `DiagnosticsStore` with source `plugin:<plugin_id>:<tool_id>`

**Security considerations:**

- SHA256 verification required for all plugin-declared binaries
- Plugin cannot register tools without explicit `lsp:register` permission grant
- Download URLs must match the declared `github_repo` (no arbitrary URL downloads)
- Binary execution is sandboxed to the toolchain directory

**Effort:** Large (~500 LOC Rust + ~300 LOC TypeScript). Requires extending the toolchain manager from static to dynamic registration, which is the most complex change.

**Depends on:** §12.1 (ToolSpec capability metadata). The capability metadata makes auto-wiring possible.

---

### 12.7 Markdown Oxide as Gap-Fill LSP (Not Started §5.5)

**Problem:** IWE lacks tag completion (`#` trigger) and unresolved link diagnostics. Markdown Oxide provides both, but running two full-featured markdown LSPs creates conflict.

**Goal:** If iwes doesn't add these features, run Markdown Oxide in a restricted mode that provides only the missing capabilities.

**When to build:** Only if iwes development stalls on tag completion and link diagnostics. Monitor iwes releases for 2-3 months before investing.

**Restricted mode strategy:**

Markdown Oxide supports `initializationOptions` that can disable features. The approach:

1. **Add `ToolSpec` for Markdown Oxide** in the registry with restricted capabilities:

   ```rust
   ToolSpec {
       id: "markdown-oxide",
       capabilities: &[
           ToolCapability::Completion,  // only tag completion
           ToolCapability::Diagnostics, // only unresolved link diagnostics
           // NO Hover, References, Definition, Rename, etc.
       ],
   }
   ```

2. **LSP initialization options** to disable overlapping features:

   ```json
   {
     "hover": false,
     "references": false,
     "definition": false,
     "rename": false,
     "workspaceSymbols": false,
     "completion": {
       "triggerCharacters": ["#"]
     }
   }
   ```

   (Actual options depend on Markdown Oxide's configuration surface — needs verification.)

3. **Completion merge strategy:** When the editor requests completions, the completion handler must merge results from IWE (wiki links, commands) and Markdown Oxide (tags). The merge is by `triggerCharacter`: `#` → Markdown Oxide, `[[`/`+` → IWE. No overlap.

4. **Diagnostics deduplication:** Markdown Oxide's unresolved link diagnostics push to `DiagnosticsStore` with `source: "markdown-oxide"`. The Problems panel shows them alongside rumdl and IWE diagnostics. No dedup needed — the diagnostic types are distinct.

**Alternative (preferred):** Before adding Markdown Oxide, implement unresolved link diagnostics natively:

- Post-save check in the AST pipeline: compare `note_links.target` against known files in `notes` table
- Push unresolved links as `source: "ast"` diagnostics (complements §12.3)
- This avoids a third LSP server entirely

For tag completion, consider a ProseMirror input rule that triggers on `#` and queries the `note_inline_tags` table via `TagsPort`. This is ~100 LOC and doesn't require an LSP server.

**Effort (Markdown Oxide route):** Medium (~200 LOC) if Markdown Oxide cooperates with restricted init options. Unknown risk on whether feature disabling is granular enough.

**Effort (native route):** Small (~150 LOC) — link validation in AST pipeline + ProseMirror `#` autocomplete.

**Recommendation:** Pursue the native route first. Only fall back to Markdown Oxide if the native solution proves inadequate (e.g., Markdown Oxide's link diagnostics are significantly more sophisticated than a simple file-existence check).

**Depends on:** §12.1 (capability metadata for Markdown Oxide ToolSpec). Native route depends on §12.3 (AST error surfacing infrastructure).

**Status:** ✅ Done (native route).

- **Tag completion:** ProseMirror suggest plugin (`tag_suggest_plugin.ts`) following the `wiki_suggest_plugin.ts` pattern. Triggers on `#`, queries `note_inline_tags` via `TagsPort` for vault-wide tag list, renders dropdown with suggest utilities. Fully wired into editor via `prosemirror_adapter.ts` and `editor_service.ts`. CSS styles added to `editor.css`.
- **Unresolved link diagnostics:** Post-save check in `search/service.rs` (`handle_upsert_with_content`) comparing parsed link targets against `notes_cache`. Pushed to `DiagnosticsStore` with source `"ast"` and `rule_id: "link/unresolved"`. Frontend delivery via `note_service.ts` `push_ast_diagnostics()`. Full pipeline operational end-to-end.

---

### 12.8 Plugin ParsedNote Access (Gap from §6.3 Phase 3)

**Problem:** Plugins cannot access structural metadata (headings, links, tags, sections) for a note without making multiple search/tag RPC calls and reconstructing the structure themselves.

**Goal:** `ast.get_parsed(file_path)` plugin RPC method that returns the cached `ParsedNoteDto` for a given note.

**Implementation:**

1. **Depends on §12.2** (ParsedNote frontend cache). The cache must exist before plugins can read from it.

2. **Plugin RPC handler** adds `ast.get_parsed` method:

   ```typescript
   case "ast.get_parsed": {
       check_permission(plugin_id, "ast:read");
       const path = read_string(params, "file_path");
       const parsed = parsed_note_cache.get(path);
       if (!parsed) {
           // Fallback: trigger a parse via the port
           const result = await note_port.get_parsed_note(vault_id, path);
           return result;
       }
       return parsed;
   }
   ```

3. **Permission:** New `ast:read` permission. Low risk — this is read-only access to structural metadata that's already in SQLite.

4. **Fallback path:** If the note isn't in the cache (not opened/saved this session), fall back to a new Rust command `get_parsed_note` that parses on demand and returns `ParsedNoteDto`. This is a read-only parse, no SQL upsert.

**Effort:** Small (~80 LOC TypeScript + ~40 LOC Rust for the fallback command).

**Depends on:** §12.2 (ParsedNote cache).

---

### 12.9 Plugin Query Clause Extension (Gap from §6.3 Phase 3)

**Problem:** The query language has a fixed set of clause types. Plugins cannot add custom clause types (e.g., `with_status "done"` from a task-tracking plugin, or `similar to "concept"` from a semantic search plugin).

**Goal:** `query.register_clause(clause_type, solver_fn)` — plugins register custom clause types that the query solver dispatches to.

**When to build:** Only if the query language sees adoption and users request custom clauses. This is the most speculative item.

**Design:**

1. **Registration API:**

   ```typescript
   await carbide.query.register_clause({
     type: "with_status", // clause keyword
     description: "Filter by task status",
     value_type: "text", // what the clause value looks like
     solver: async (value, vault_id) => {
       // Plugin-side: query its own data and return matching note paths
       const notes = await my_task_db.query_by_status(value);
       return notes.map((n) => n.path);
     },
   });
   ```

2. **Parser extension:** The query parser needs to accept unknown clause types. Currently it's a hardcoded `switch` on clause keywords. Change to:
   - Known clauses: parsed as today
   - Unknown clause type: parsed as `{ type: "custom", custom_type: string, value: QueryValue }`
   - The solver checks the custom clause registry before throwing "unknown clause"

3. **Solver dispatch for custom clauses:**

   ```typescript
   case "custom": {
       const handler = custom_clause_registry.get(clause.custom_type);
       if (!handler) throw new Error(`Unknown clause type: ${clause.custom_type}`);
       // RPC call to the plugin that registered this clause
       const paths = await plugin_rpc.call(handler.plugin_id, "solve_clause", {
           clause_type: clause.custom_type,
           value: clause.value,
           vault_id
       });
       return new Set(paths);
   }
   ```

4. **Permission:** `query:extend` permission. Medium risk — a poorly-performing plugin solver can slow down queries. Mitigate with a per-clause timeout (5s default).

**Effort:** Medium (~200 LOC). Requires parser modification, solver extension, and plugin RPC round-trip.

**Depends on:** Plugin system Phase 1b completion. Query language (already done).

---

## 13\. Implementation Priority & Sequencing

> Updated: 2026-03-23 — Re-prioritized after §12.1–§12.3 completion.

### Completed

| Item                               | Effort    | Status              |
| ---------------------------------- | --------- | ------------------- |
| §12.1 ToolSpec Capability Metadata | Small     | ✅ Done             |
| §12.3 AST Parse Error Surfacing    | Small-Med | ✅ Done             |
| §12.2 ParsedNote Frontend Cache    | Medium    | ✅ Done (Phase A+B) |

### Tier 1 — Build Next

| Priority | Item                                           | Effort | Value                                  | Depends On   | Status         |
| -------- | ---------------------------------------------- | ------ | -------------------------------------- | ------------ | -------------- |
| 1        | §12.7 Native tag completion + link diagnostics | Small  | Medium (user-facing, no 3rd-party LSP) | §12.3 ✅     | ✅ Done        |
| 2        | §12.2 Phase C — Wire consumers                 | Small  | Medium (progressive perf win)          | §12.2 A+B ✅ | 🔄 In progress |

### Tier 2 — Build When Triggered

| Priority | Item                           | Effort | Value                    | Trigger                         |
| -------- | ------------------------------ | ------ | ------------------------ | ------------------------------- |
| 3        | §12.5 Sliding Panel UX         | Large  | High (differentiated UX) | When core features stabilize    |
| 4        | §12.4 Batch Query Command      | Medium | Medium (perf at scale)   | When queries slow on 5k+ vaults |
| 5        | §12.8 Plugin ParsedNote Access | Small  | Low-Med                  | When plugin authors request it  |

### Tier 3 — Speculative / Defer

| Priority | Item                          | Effort | Value             | Trigger                           |
| -------- | ----------------------------- | ------ | ----------------- | --------------------------------- |
| 6        | §12.6 Plugin LSP Registration | Large  | Low (speculative) | When a plugin needs it            |
| 7        | §12.9 Plugin Query Clauses    | Medium | Low (speculative) | When users request custom clauses |

**Critical path:** §12.1 ✅ → §12.2 A+B ✅ → §12.3 ✅ → §12.7 ✅ → §12.2 Phase C (in progress).

**Gated items:** §12.4, §12.5, §12.6, §12.8, §12.9 remain gated on their trigger conditions. Do not build proactively.
