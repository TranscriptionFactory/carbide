# Carbide Native Gaps: MCP, CLI, Plugin & Metadata Parity Plan

> **Date:** 2026-03-31 (updated 2026-04-05)
> **Status:** Draft
> **Context:** Gap analysis against Lokus MCP implementation, plugin system, and metadata surface. Now includes CLI design (modeled after Obsidian CLI).
> **Prerequisite phases:** 0–9 (complete), reference library auto-load (in flight)

---

## Executive Summary

Four categories of gaps identified:

1. **MCP Server** (critical) — Carbide has zero MCP support. Lokus ships 40+ tools with dual-transport, auto-setup, and graceful degradation.
2. **CLI** (critical, ships with MCP) — No way to control Carbide from the terminal. Obsidian ships a full CLI (1.12+). The CLI shares the same HTTP server and auth as MCP — they're two frontends to one backend.
3. **Plugin System Hardening** (high value) — Carbide's plugin system works but lacks activation events (lazy loading), editor contribution points (slash commands), lifecycle hooks, resource quotas, and developer tooling.
4. **Metadata System** (medium value) — Carbide's metadata extraction is string-only with no type inference, no format-preserving write-back, and no bulk property operations. Lokus has rich type detection, smart write-back, and multi-dimensional property indexing.

This plan covers all four, ordered by implementation priority. MCP and CLI are co-developed — they share the HTTP transport, auth layer, and service functions.

---

## Gap 1: MCP Server (Critical)

### Why it matters

MCP is the standard protocol for AI assistants to interact with local tools. Without it, Carbide is invisible to Claude Desktop, Claude Code, Cursor, and other MCP-aware clients. Lokus already ships this — it's table-stakes for a knowledge tool.

### Design Decisions

| Decision          | Choice                                                                                                 | Rationale                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Language**      | Rust-native (no Node.js sidecar)                                                                       | Carbide already bundles Rust. Avoids Node.js runtime dependency that Lokus requires. Use `rmcp` crate or hand-roll JSON-RPC 2.0 over stdio/HTTP    |
| **Transport**     | Stdio (primary) + HTTP/SSE (secondary)                                                                 | Stdio for Claude Desktop. HTTP/SSE for Claude Code CLI and future web clients                                                                      |
| **Architecture**  | New feature module at `src-tauri/src/features/mcp/` + thin frontend feature at `src/lib/features/mcp/` | Follows existing hexagonal pattern. Backend does the heavy lifting; frontend manages config UI                                                     |
| **Tool routing**  | Reuse existing Tauri command logic directly (no shelling out)                                          | Carbide commands are already well-structured Rust functions. MCP tools call the same service functions that Tauri commands call — zero duplication |
| **Vault context** | Active vault from `VaultRegistry` state                                                                | Unlike Lokus's workspace detection chain, Carbide has a managed vault lifecycle. MCP server reads from same state                                  |
| **Auth (HTTP)**   | Bearer token at `~/.carbide/mcp-token` (mode 0o600)                                                    | Matches Lokus pattern. Constant-time comparison. Required for HTTP transport only                                                                  |

---

## Gap 1b: CLI (Critical — co-developed with MCP)

### Why it matters

A CLI lets humans and AI agents control Carbide from the terminal — scripting, automation, piping into other tools. Obsidian 1.12 ships this. Without it, Carbide requires the GUI for every interaction. The CLI is also the natural human-facing counterpart to MCP: MCP serves AI clients via JSON-RPC, CLI serves humans via `carbide search "foo"`.

### Architecture: CLI as HTTP Client

```
                          ┌──────────────────────┐
  carbide help            │   carbide CLI binary  │  (Rust, ~2MB)
  carbide read            │   - clap arg parser   │
  carbide search "foo"    │   - reqwest HTTP      │
                          │   - output formatter  │
                          └──────────┬───────────┘
                                     │ HTTP POST localhost:3457
                                     ▼
                          ┌──────────────────────┐
                          │  Carbide App (Tauri)  │
                          │  ┌────────────────┐   │
                          │  │ axum HTTP Server│   │
                          │  │ /mcp  (JSON-RPC)│  │  ← MCP clients (Claude, Cursor)
                          │  │ /cli/* (REST)   │   │  ← CLI binary
                          │  │ /health         │   │  ← both
                          │  └───────┬────────┘   │
                          │          │             │
                          │  ┌───────▼────────┐   │
                          │  │ Shared Service  │   │  (existing Rust functions)
                          │  │    Functions    │   │
                          │  └────────────────┘   │
                          └──────────────────────┘
```

The CLI is a **separate Rust binary** (`src-tauri/crates/carbide-cli/`) that ships alongside the app. It's just an HTTP client with nice argument parsing and output formatting. Every CLI command maps 1:1 to an existing Tauri command / service function — zero logic duplication.

### Design Decisions (CLI-specific)

| Decision                | Choice                                                       | Rationale                                                                    |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Argument style**      | `carbide <command> [key=value] [flags]`                      | Matches Obsidian CLI. Familiar syntax. No dashes for params                  |
| **Output format**       | Plain text default, `--json` for structured                  | Humans get readable output; scripts/agents get JSON                          |
| **Vault targeting**     | CWD detection → `vault=<name\|id>` param → last-opened vault | Same as Obsidian. Uses existing `VaultRegistry` + `resolve_file_to_vault`    |
| **File targeting**      | `file=<name>` (wiki-link resolution) + `path=<exact>`        | Same as Obsidian. Carbide's search index handles name resolution             |
| **Auth**                | Same bearer token as MCP (`~/.carbide/mcp-token`)            | Single auth mechanism for both interfaces                                    |
| **App must be running** | Yes. First command launches app if needed                    | CLI checks `/health`; if down, launches `Carbide.app` and polls up to 10s    |
| **TUI**                 | Deferred (Phase 7+)                                          | Single-command interface covers 90% of use cases. AI agents don't need a TUI |
| **Binary**              | Standalone Rust crate in workspace                           | `clap` + `reqwest` + `serde_json` + `colored` + `tabled`. ~2MB               |

### CLI Command Surface

The CLI exposes Carbide's full feature set. Commands grouped by area:

**Core (notes + search):**

| Command          | Description                                                        | Maps to                     |
| ---------------- | ------------------------------------------------------------------ | --------------------------- |
| `read`           | Read note (default: active file). `file=` or `path=`               | `read_note`                 |
| `create`         | Create note. `name=`, `path=`, `content=`, `overwrite`, `open`     | `create_note`               |
| `write`          | Update note content. `path=`, `content=`                           | `write_and_index_note`      |
| `append`         | Append to note. `content=` (required), `file=`, `path=`, `inline`  | New thin wrapper            |
| `prepend`        | Prepend after frontmatter. `content=` (required), `file=`, `path=` | New thin wrapper            |
| `rename`         | Rename note. `file=`/`path=`, `name=` (required)                   | `rename_note`               |
| `move`           | Move note. `file=`/`path=`, `to=` (required)                       | `rename_note` (path change) |
| `delete`         | Delete note. `file=`/`path=`, `permanent`                          | `delete_note`               |
| `open`           | Open file in Carbide. `file=`/`path=`, `newtab`                    | Frontend action via event   |
| `search`         | Full-text search. `query=` (required), `limit=`                    | `index_search`              |
| `search:context` | Search with line context (grep-style)                              | `index_search` + context    |

**Vault + files:**

| Command         | Description                                            | Maps to                                        |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `vault`         | Show active vault info. `info=name\|path\|files\|size` | `VaultRegistry` state                          |
| `vaults`        | List known vaults. `verbose`, `total`                  | `list_vaults`                                  |
| `vault:open`    | Switch vault. `name=`/`id=`                            | `open_vault_by_id`                             |
| `files`         | List files. `folder=`, `ext=`, `total`                 | `list_notes` / `list_vault_files_by_extension` |
| `folders`       | List folders. `folder=`, `total`                       | `list_folders`                                 |
| `folder`        | Folder info. `path=`, `info=files\|size`               | `get_folder_stats`                             |
| `folder:create` | Create folder. `path=`                                 | `create_folder`                                |

**Tags + metadata:**

| Command           | Description                                                      | Maps to                         |
| ----------------- | ---------------------------------------------------------------- | ------------------------------- |
| `tags`            | List tags. `counts`, `sort=count`, `file=`, `total`, `format=`   | `tags_list_all`                 |
| `tag`             | Tag info. `name=` (required), `verbose`, `total`                 | `tags_get_notes_for_tag`        |
| `properties`      | List properties. `file=`, `counts`, `sort=count`, `format=`      | `bases_list_properties`         |
| `property:read`   | Read property. `name=` (required), `file=`/`path=`               | Metadata extraction             |
| `property:set`    | Set property. `name=`, `value=`, `type=`, `file=`/`path=`        | Frontmatter writer (Gap 3b)     |
| `property:remove` | Remove property. `name=`, `file=`/`path=`                        | Frontmatter writer (Gap 3b)     |
| `outline`         | Show headings. `file=`/`path=`, `format=tree\|md\|json`, `total` | `markdown_lsp_document_symbols` |
| `backlinks`       | Backlinks to file. `file=`/`path=`, `counts`, `total`            | `markdown_lsp_references`       |
| `links`           | Outgoing links. `file=`/`path=`, `total`                         | Markdown AST scan               |

**Git (Carbide-unique — Obsidian CLI has no git):**

| Command       | Description                                | Maps to                |
| ------------- | ------------------------------------------ | ---------------------- |
| `git:status`  | Working tree status                        | `git_status`           |
| `git:commit`  | Stage all + commit. `message=` (required)  | `git_stage_and_commit` |
| `git:log`     | Commit history. `limit=`                   | `git_log`              |
| `git:diff`    | Uncommitted changes. `path=`               | `git_diff`             |
| `git:push`    | Push to remote                             | `git_push`             |
| `git:pull`    | Pull from remote. `strategy=rebase\|merge` | `git_pull`             |
| `git:restore` | Restore file. `path=`, `commit=`           | `git_restore_file`     |
| `git:init`    | Initialize git in vault                    | `git_init_repo`        |

**References (Carbide-unique):**

| Command            | Description                                            | Maps to                                       |
| ------------------ | ------------------------------------------------------ | --------------------------------------------- |
| `references`       | List citations. `total`, `--json`                      | `reference_load_library`                      |
| `reference:add`    | Add by DOI. `doi=`                                     | `reference_doi_lookup` + `reference_add_item` |
| `reference:search` | Search library. `query=`                               | Library search                                |
| `reference:bbt`    | Zotero BBT ops. `search=`/`collections`/`bibliography` | `reference_bbt_*` commands                    |

**Bases (Carbide-unique):**

| Command            | Description                                     | Maps to                 |
| ------------------ | ----------------------------------------------- | ----------------------- |
| `bases:query`      | Structured query. `filter=`, `sort=`, `format=` | `bases_query`           |
| `bases:properties` | List queryable properties with types            | `bases_list_properties` |
| `bases:views`      | List saved views                                | `bases_list_views`      |

**Tasks:**

| Command | Description                                                | Maps to                    |
| ------- | ---------------------------------------------------------- | -------------------------- |
| `tasks` | List tasks. `todo`/`done`, `file=`, `verbose`, `total`     | Task extraction from notes |
| `task`  | Show/toggle task. `file=`, `line=`, `toggle`/`done`/`todo` | File line manipulation     |

**Plugins:**

| Command          | Description             | Maps to        |
| ---------------- | ----------------------- | -------------- |
| `plugins`        | List plugins. `enabled` | Plugin store   |
| `plugin:enable`  | Enable. `id=`           | Plugin service |
| `plugin:disable` | Disable. `id=`          | Plugin service |
| `plugin:reload`  | Reload (dev). `id=`     | Plugin service |

**Developer:**

| Command          | Description                           | Maps to                             |
| ---------------- | ------------------------------------- | ----------------------------------- |
| `eval`           | Run JS in app. `code=`                | Frontend eval bridge                |
| `dev:screenshot` | Screenshot. `path=`                   | Window capture                      |
| `dev:lint`       | Lint vault. `path=`, `fix`            | `lint_check_vault` / `lint_fix_all` |
| `dev:format`     | Format markdown. `path=`              | `lint_format_vault`                 |
| `dev:index`      | Index ops. `build`/`rebuild`/`status` | `index_build` / `index_rebuild`     |

**General:**

| Command                   | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `help` / `help <command>` | Show help                                                     |
| `version`                 | Show version                                                  |
| `status`                  | App status: running vault, active file, MCP/CLI server status |

**Global flags (work with any command):**

| Flag               | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `--json`           | Output as JSON                                        |
| `--copy`           | Copy output to clipboard                              |
| `--quiet`          | Suppress non-essential output                         |
| `vault=<name\|id>` | Target a specific vault (first param, before command) |

### Vault Resolution Chain

```
1. Explicit vault=<name|id> parameter? → Resolve via VaultRegistry
2. CWD inside a known vault path?      → Use that vault
3. Neither?                             → Use last-opened vault (VaultRegistry.last_vault_id)
4. No vaults registered?               → Error: "No vaults found. Open Carbide first."
```

### CLI Binary Structure

New crate: `src-tauri/crates/carbide-cli/`

```
carbide-cli/
├── Cargo.toml
├── src/
│   ├── main.rs          # Entry point, app launch detection, arg dispatch
│   ├── client.rs        # HTTP client (reqwest blocking)
│   ├── auth.rs          # Token reader from ~/.carbide/mcp-token
│   ├── launch.rs        # Detect + launch Carbide.app if not running
│   ├── vault.rs         # CWD → vault resolution
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── notes.rs     # read, create, write, append, prepend, rename, move, delete
│   │   ├── search.rs    # search, search:context
│   │   ├── vault.rs     # vault, vaults, vault:open
│   │   ├── git.rs       # git:status, git:commit, git:log, etc.
│   │   ├── tags.rs      # tags, tag
│   │   ├── metadata.rs  # properties, property:read/set/remove
│   │   ├── tasks.rs     # tasks, task
│   │   ├── references.rs # references, reference:add/search/bbt
│   │   ├── bases.rs     # bases:query, bases:properties, bases:views
│   │   ├── plugins.rs   # plugins, plugin:enable/disable/reload
│   │   ├── dev.rs       # eval, dev:screenshot, dev:lint, dev:index
│   │   └── general.rs   # help, version, status
│   └── format.rs        # Output formatting (table, tree, plain text, JSON)
```

### Differences from Obsidian CLI

| Aspect             | Obsidian CLI                | Carbide CLI                              |
| ------------------ | --------------------------- | ---------------------------------------- |
| **Git**            | Not available               | First-class (`git:*` commands)           |
| **References**     | Not available               | Citations, DOI lookup, Zotero            |
| **Bases/queries**  | Not available               | Structured queries with filters          |
| **Linked sources** | Not available               | PDF/document management                  |
| **Transport**      | Custom IPC (Electron ↔ CLI) | HTTP (standard, debuggable with curl)    |
| **MCP**            | Separate concern            | Same server serves both CLI and MCP      |
| **Binary**         | Ships with Electron         | Standalone Rust (~2MB)                   |
| **Sync**           | Obsidian Sync commands      | Git push/pull (no proprietary sync)      |
| **Publish**        | Obsidian Publish            | Not applicable                           |
| **Daily notes**    | Dedicated `daily` commands  | Use `read`/`append` with path convention |
| **Bookmarks**      | Built-in                    | Not implemented (use tags/properties)    |
| **TUI**            | Ships with interactive mode | Deferred                                 |

### Phase 1: Core MCP Server (Rust)

**Goal:** Stdio MCP server exposing note CRUD + search + metadata tools.

#### 1a. Backend Module

Create `src-tauri/src/features/mcp/`:

```
mcp/
├── mod.rs              # Module exports
├── server.rs           # MCP server lifecycle (start/stop/status)
├── transport.rs        # Stdio + HTTP transport implementations
├── router.rs           # Tool dispatch (name → handler)
├── tools/
│   ├── mod.rs
│   ├── notes.rs        # list_notes, read_note, create_note, update_note, delete_note
│   ├── search.rs       # search_notes (wraps OmniFind)
│   ├── metadata.rs     # get_note_metadata, list_properties, get_backlinks
│   ├── vault.rs        # list_vaults, get_active_vault
│   └── reference.rs    # list_references, get_reference, search_references
├── resources/
│   ├── mod.rs
│   └── vault_info.rs   # Vault config, structure overview as MCP resources
├── types.rs            # McpRequest, McpResponse, ToolDefinition, etc.
└── setup.rs            # Auto-configure Claude Desktop/Code on first launch
```

#### 1b. Tool Definitions (Priority Order)

**Tier 1 — Ship first (core knowledge ops):**

| Tool                | Input                              | Output                        | Maps to                   |
| ------------------- | ---------------------------------- | ----------------------------- | ------------------------- |
| `list_notes`        | `vault_id?`, `folder?`, `sort_by?` | Note paths + titles           | `list_notes` command      |
| `read_note`         | `path`                             | Full markdown content         | `read_note` command       |
| `create_note`       | `path`, `content`, `frontmatter?`  | Created path                  | `create_note` command     |
| `update_note`       | `path`, `content`                  | Updated path                  | `write_note` command      |
| `delete_note`       | `path`                             | Confirmation                  | `delete_note` command     |
| `search_notes`      | `query`, `limit?`                  | Ranked results with snippets  | `search_omnifind` command |
| `get_note_metadata` | `path`                             | Frontmatter properties + tags | `extract_metadata` logic  |
| `list_vaults`       | —                                  | Vault names + paths           | `VaultRegistry` state     |

**Tier 2 — Follow-up (graph + references):**

| Tool                      | Input                             | Output                        | Maps to                     |
| ------------------------- | --------------------------------- | ----------------------------- | --------------------------- |
| `get_backlinks`           | `path`                            | Incoming link paths + context | Marksman LSP / search index |
| `get_outgoing_links`      | `path`                            | Outgoing link paths           | Markdown AST scan           |
| `list_references`         | `vault_id?`                       | CSL items summary             | `reference_load_library`    |
| `search_references`       | `query`                           | Matching CSL items            | Reference service search    |
| `list_properties`         | —                                 | All property names + types    | Bases query                 |
| `query_notes_by_property` | `property`, `value?`, `operator?` | Matching notes                | Bases query engine          |

**Tier 3 — Power features:**

| Tool          | Input                  | Output                          | Maps to               |
| ------------- | ---------------------- | ------------------------------- | --------------------- |
| `git_status`  | —                      | Modified/staged/untracked files | `git_status` command  |
| `git_log`     | `limit?`               | Recent commits                  | `git_log` command     |
| `rename_note` | `old_path`, `new_path` | Updated path                    | `rename_note` command |

#### 1c. Resource Definitions

| Resource URI                      | Description                        |
| --------------------------------- | ---------------------------------- |
| `carbide://vault/{id}/structure`  | Directory tree of the vault        |
| `carbide://vault/{id}/config`     | Vault settings                     |
| `carbide://vault/{id}/properties` | All metadata properties with types |

#### 1d. Tauri Commands (lifecycle management)

```rust
#[tauri::command]
#[specta::specta]
pub async fn mcp_start(state: State<'_, McpState>) -> Result<McpStatus, String>

#[tauri::command]
#[specta::specta]
pub async fn mcp_stop(state: State<'_, McpState>) -> Result<(), String>

#[tauri::command]
#[specta::specta]
pub async fn mcp_status(state: State<'_, McpState>) -> Result<McpStatus, String>

#[tauri::command]
#[specta::specta]
pub async fn mcp_restart(state: State<'_, McpState>) -> Result<McpStatus, String>
```

### Phase 2: Auto-Setup & Configuration

**Goal:** Zero-friction setup for Claude Desktop and Claude Code.

#### 2a. Claude Desktop Auto-Config

On first launch (or when user enables MCP):

1. Generate stdio launcher script at `~/.carbide/mcp-server/carbide-mcp` (shell script that invokes the Tauri sidecar or communicates via named pipe)
2. Write to `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "carbide": {
         "command": "~/.carbide/mcp-server/carbide-mcp",
         "args": ["--stdio"]
       }
     }
   }
   ```
3. Respect existing config (merge, don't overwrite)

#### 2b. Claude Code Auto-Config

1. Create `.mcp.json` in vault root:
   ```json
   {
     "mcpServers": {
       "carbide": {
         "type": "http",
         "url": "http://localhost:3457/mcp",
         "headers": { "Authorization": "Bearer <token>" }
       }
     }
   }
   ```
2. Optionally call `claude mcp add -t http carbide http://localhost:3457/mcp` if CLI is available

#### 2c. Frontend Settings UI

`src/lib/features/mcp/ui/mcp_settings.svelte`:

- Toggle MCP server on/off
- Show connection status (stdio/HTTP)
- Regenerate auth token
- Show registered tools (read-only, from server)
- Auto-setup button for Claude Desktop/Code

### Phase 3: HTTP Server + CLI Binary

**Goal:** HTTP transport serving both MCP clients and the CLI binary. Single axum server, two interfaces.

- Axum-based HTTP server (Carbide already uses `reqwest`; `axum` is tokio-native)
- Port: `3457` (avoid Lokus's `3456` conflict)
- Endpoints:
  - `POST /mcp` — JSON-RPC 2.0 (tools/list, tools/call, resources/list, resources/read)
  - `GET /mcp/sse` — Server-Sent Events for streaming (future)
  - `POST /cli/<command>` — CLI command dispatch (accepts JSON body, returns JSON)
  - `GET /health` — Health check (used by CLI to detect running app)
- Bearer token auth from `~/.carbide/mcp-token`
- CORS restricted to localhost origins

#### 3a. Shared Service Layer

Extract core logic from Tauri command handlers into service functions callable from both Tauri IPC and HTTP routes:

```rust
// src-tauri/src/features/notes/service.rs — already exists
// These functions are called by both:
//   1. #[tauri::command] handlers (GUI)
//   2. /mcp JSON-RPC tool handlers (AI clients)
//   3. /cli/* HTTP route handlers (CLI binary)
```

Most Tauri commands already call internal service functions — the HTTP routes just need access to the same `AppState`. The axum server receives the Tauri `AppHandle` at startup and uses it to access managed state.

#### 3b. CLI Route Handlers

Each CLI route is a thin adapter (~5-10 lines):

```rust
async fn cli_read_note(
    State(state): State<AppState>,
    Json(params): Json<ReadNoteParams>,
) -> Result<Json<NoteContent>, ApiError> {
    let content = notes_service::read_note(&state, &params.vault_id, &params.path).await?;
    Ok(Json(content))
}
```

#### 3c. CLI Binary (carbide-cli crate)

Build the standalone binary as described in Gap 1b. Ships alongside the app:

| Platform | Binary location                          | Symlink / PATH                                        |
| -------- | ---------------------------------------- | ----------------------------------------------------- |
| macOS    | `Carbide.app/Contents/MacOS/carbide-cli` | `/usr/local/bin/carbide` or `~/.zprofile` PATH export |
| Linux    | Next to AppImage                         | `/usr/local/bin/carbide` symlink                      |
| Windows  | Next to `Carbide.exe`                    | Added to PATH during install                          |

#### 3d. App Launch Detection

CLI binary startup sequence:

```
1. Read token from ~/.carbide/mcp-token
2. GET http://localhost:3457/health
3. If healthy → proceed with command
4. If unhealthy → launch Carbide.app (platform-specific)
5. Poll /health every 500ms for up to 10s
6. If still unhealthy → error: "Could not connect to Carbide"
```

### Phase 4: Plugin Bridge

**Goal:** Expose MCP tools to plugins, and let plugins register MCP tools.

Add `mcp` namespace to `plugin_rpc_handler.ts`:

```typescript
case "mcp":
  require_permission(plugin_id, "mcp:access");
  return this.handle_mcp(action, params);
```

Actions:

- `mcp.list_tools()` — enumerate available MCP tools
- `mcp.call_tool(tool_name, args)` — invoke an MCP tool (permission-gated per tool)
- `mcp.register_tool(definition)` — plugin contributes a tool to the MCP surface

This lets plugins both consume and extend MCP capabilities.

---

## Gap 2: Plugin System Hardening

### Why it matters

Carbide's plugin system (Phase 8) ships iframe sandbox, RPC bridge, permission checking, and 3 demo plugins. But it lacks the primitives that make plugins _useful_ beyond background data processing. Without lazy activation, plugins bloat startup. Without slash commands, plugins can't integrate into the editing experience. Without lifecycle hooks, plugins can't manage state.

### 2a. Activation Events (Lazy Loading)

**Current:** 4 event types (`on_startup`, `on_command:*`, `on_file_open:*`, `on_settings_open`). Every plugin loads at startup.

**Adopt:**

| Event                 | Pattern                                | Purpose                                            |
| --------------------- | -------------------------------------- | -------------------------------------------------- |
| `on_startup_finished` | —                                      | Defer non-critical plugins until after app renders |
| `on_file_type:*`      | `on_file_type:bib`, `on_file_type:csv` | Activate when specific file types open             |
| `vault_contains:*`    | `vault_contains:.zotero-connector`     | Activate only if vault has matching files          |

**Implementation:**

- Add pattern matching to `PluginService.should_activate()` (already has activation event checking)
- `on_startup_finished`: emit after `AppContext` initialization completes
- `on_file_type:*`: hook into existing `active-file-changed` event, check extension
- `vault_contains:*`: scan vault once on open, cache results, check against manifest patterns
- Plugins not matching any activation event stay unloaded until triggered

**Effort:** Low. 1-2 files changed in plugin service + manifest type update.

### 2b. Lifecycle Hooks

**Current:** No `activate()`/`deactivate()` hooks. Host controls plugin entirely via RPC. Plugins can't initialize state, clean up, or react to settings changes.

**Adopt:**

| Hook                          | When                          | Purpose                                    |
| ----------------------------- | ----------------------------- | ------------------------------------------ |
| `activate(context)`           | Plugin iframe loaded          | Initialize state, register disposables     |
| `deactivate()`                | Before unload                 | Clean up timers, subscriptions, temp state |
| `on_settings_change(changed)` | User modifies plugin settings | Re-configure without full reload           |

**Implementation:**

- Host sends `{ type: "lifecycle", hook: "activate", context: {...} }` via postMessage after iframe load
- Plugin responds with `{ type: "lifecycle_response", hook: "activate", disposables: [...] }`
- On unload, host sends `deactivate`, waits up to 2s, then destroys iframe
- Settings change: host sends `on_settings_change` with diff of changed keys

**Effort:** Low. RPC message types + host_adapter changes.

### 2c. Slash Command Contribution Point

**Current:** Plugins can register commands (command palette only) and add status bar/sidebar/ribbon UI. No way to integrate into the editor's typing flow.

**Adopt:**

- Plugins declare slash commands in manifest `contributes.slash_commands`:
  ```json
  {
    "contributes": {
      "slash_commands": [
        {
          "name": "cite",
          "description": "Insert a citation",
          "permission": "editor:modify"
        }
      ]
    }
  }
  ```
- When user types `/` in editor, ProseMirror extension shows plugin-contributed commands alongside built-in ones
- Selection triggers RPC: `commands.execute_slash(command_name, { cursor_position, selection })`
- Plugin responds with text/markdown to insert at cursor

**Implementation:**

- New contribution registry in `PluginStore` for slash commands
- Hook into existing ProseMirror slash command extension (or create one)
- RPC handler delegates to plugin iframe, returns insertion text

**Effort:** Medium. Requires ProseMirror extension + plugin store + RPC handler.

### 2d. Resource Quotas & RPC Timeouts

**Current:** No resource limits. A plugin can spin CPU or allocate unbounded memory.

**Adopt:**

| Quota          | Limit                                | Enforcement                                                     |
| -------------- | ------------------------------------ | --------------------------------------------------------------- |
| RPC timeout    | 5s per call (30s for fs operations)  | Host kills pending RPC, returns error                           |
| API rate limit | 100 calls/minute per plugin          | Counter in `PluginRpcHandler`, reject with `rate_limited` error |
| Error budget   | 10 consecutive errors → auto-disable | Counter in plugin store, emit warning at 5                      |

Skip memory/CPU quotas (not reliably enforceable in iframes without `performance.measureUserAgentSpecificMemory()` which requires cross-origin isolation). The error budget and timeouts catch runaway plugins in practice.

**Implementation:**

- Wrap all RPC dispatch in `Promise.race([handler, timeout])` in `plugin_host_adapter.ts`
- Add `call_count` and `error_count` fields to plugin store entries
- Rate limiter: sliding window counter, reset every 60s

**Effort:** Low. ~50 lines in host adapter + store.

### 2e. Richer Settings Schema

**Current:** 4 types: `string`, `number`, `boolean`, `select`.

**Adopt:**

| Addition                | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `textarea` type         | Multiline text (prompt templates, custom CSS) |
| `min`/`max` for numbers | Validation constraints                        |
| `placeholder` field     | Hint text for string/textarea inputs          |
| `description` field     | Help text below the input                     |

Skip conditional `when` clauses and scoped settings — not needed for local plugins.

**Implementation:** Extend `PluginSettingDefinition` type, update settings tab renderer.

**Effort:** Low. Type changes + UI component updates.

### 2f. Plugin SDK / Scaffolding (Deferred)

**Current:** No SDK. Plugin authors work from a single example.

**When ready (after MCP, after 2a-2e):**

1. `@carbide/plugin-types` npm package — RPC types, manifest schema, event types
2. `create-carbide-plugin` template — generates manifest + main.js + index.html scaffold
3. Skip full SDK classes, decorators, testing utilities — premature

---

## Gap 3: Metadata System

### Why it matters

Carbide's metadata extraction stores everything as strings with no type inference. Property values aren't queryable by type (can't filter "due date > today" because dates are strings). Write-back to frontmatter isn't implemented in the metadata layer. Bulk property operations (rename a property across all notes) don't exist. These are the operations that make bases views, MCP tools, and plugins actually powerful.

### 3a. Property Type Inference

**Current:** `typeof value === "string" ? value : JSON.stringify(value)` — everything becomes a string. Type field is `typeof` result, not semantic.

**Lokus has:** 8-type system with heuristics — detects dates (ISO, MM/DD/YYYY), booleans (`yes`/`no`/`true`/`false`), numbers, arrays, tags (short string arrays). `inferCommonType()` unifies types across a property's values vault-wide.

**Adopt:**

```typescript
type PropertyType = "string" | "number" | "boolean" | "date" | "array" | "tags";

function infer_property_type(value: unknown): PropertyType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value instanceof Date) return "date";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
    if (/^(true|false|yes|no)$/i.test(value)) return "boolean";
    if (!isNaN(Number(value)) && value.trim() !== "") return "number";
    return "string";
  }
  if (Array.isArray(value)) {
    // Tags: short strings, no nested objects
    if (value.every((v) => typeof v === "string" && v.length < 50))
      return "tags";
    return "array";
  }
  return "string";
}
```

**Where this lives:**

- `src/lib/features/metadata/domain/infer_property_type.ts` — pure function, unit-testable
- Called from `extract_metadata.ts` during frontmatter parsing
- Type stored in `NoteProperty.type` field (currently exists but populated naively)
- Backend SQLite `note_properties.property_type` column updated to store inferred type

**Impact:**

- Bases queries become type-aware (`date > "2026-01-01"` works correctly)
- MCP `query_notes_by_property` tool can do numeric/date comparisons
- Metadata panel renders type-appropriate editors (already partially built)

**Effort:** Low. Pure function + update extraction call + SQLite column semantics.

### 3b. Format-Preserving Frontmatter Write-Back

**Current:** Metadata panel can edit properties in-memory but write-back to the file's YAML frontmatter is not implemented in the metadata layer. Changes rely on external note save which rewrites the entire document.

**Lokus has:** `FrontmatterWriter` with `updateProperty()`, `addProperty()`, `removeProperty()` — preserves indentation, comments, blank lines. Short arrays inline, long arrays multi-line. Quoted strings only when needed.

**Adopt:**

Create `src/lib/features/metadata/domain/frontmatter_writer.ts`:

```typescript
function update_frontmatter_property(
  markdown: string,
  key: string,
  value: unknown,
): string;
function add_frontmatter_property(
  markdown: string,
  key: string,
  value: unknown,
): string;
function remove_frontmatter_property(markdown: string, key: string): string;
function ensure_frontmatter(markdown: string): string;
```

**Design rules:**

- Operate on raw markdown string (not AST) — preserves formatting the AST would strip
- Find YAML block boundaries (`---` delimiters), modify only within
- `update_frontmatter_property`: find existing key line, replace value portion, preserve indentation
- Array formatting: inline `[a, b, c]` for ≤3 items, multi-line with `-` prefix for more
- Quote strings only when they contain `:`, `#`, `{`, `[`, or look like booleans/numbers
- If no frontmatter exists, `ensure_frontmatter` creates empty `---\n---\n` block

**Integration:**

- `MetadataService.update_property()` calls writer, then saves note via `NotePort.write()`
- ProseMirror FrontmatterWidget uses this for inline edits
- MCP `update_note_metadata` tool wraps this

**Effort:** Medium. ~150 lines of string manipulation + tests. This is the kind of code that needs thorough edge-case testing.

### 3c. Vault-Wide Property Enumeration with Types

**Current:** `BasesPort.list_properties(vault_id)` returns `{ name, property_type, count }` from SQLite. But `property_type` is the naive `typeof` result, and there's no value enumeration (what are the unique values for a given property?).

**Adopt:**

Extend the backend `list_properties` response:

```rust
struct PropertyInfo {
    name: String,
    property_type: String,      // Now uses inferred type from 3a
    count: u32,                 // Number of notes with this property
    unique_values: Option<Vec<String>>,  // Top N unique values (for select/filter UI)
}
```

- `unique_values`: return top 20 unique values for properties with ≤100 distinct values (skip for free-text fields)
- Enables autocomplete in bases filter UI and metadata panel
- Enables MCP `list_properties` tool to return meaningful type info

**Effort:** Low. SQL query extension + type update.

### 3d. Bulk Property Operations

**Current:** No way to rename or delete a property across all notes in a vault. Users must manually edit each file.

**Adopt:**

Two operations, implemented as backend Tauri commands:

```rust
#[tauri::command]
#[specta::specta]
pub async fn metadata_rename_property(
    vault_id: String,
    old_key: String,
    new_key: String,
) -> Result<u32, String>  // Returns count of files modified

#[tauri::command]
#[specta::specta]
pub async fn metadata_delete_property(
    vault_id: String,
    key: String,
) -> Result<u32, String>  // Returns count of files modified
```

**Implementation:**

1. Query SQLite for all notes containing the property
2. For each note: read file → use `frontmatter_writer` to rename/remove → write atomically
3. Update SQLite index
4. Emit file change events for watcher

**Safety:**

- Git commit before bulk operation (automatic, with descriptive message)
- Return count of modified files for user confirmation
- Action gated behind confirmation dialog in UI

**Effort:** Medium. Backend command + frontmatter writer integration + UI confirmation.

### 3e. Nested Property Handling

**Current:** Complex YAML (objects, arrays of objects) gets `JSON.stringify()`'d into opaque strings. Not queryable, not editable in metadata panel.

**Lokus approach:** Custom simple YAML parser handles nesting, but still flattens for indexing.

**Adopt (pragmatic):**

Don't try to make arbitrary nested objects queryable. Instead:

- **Flatten one level** using dot notation: `{ author: { name: "Jane", affiliation: "MIT" } }` → properties `author.name = "Jane"`, `author.affiliation = "MIT"`
- Store flattened keys in SQLite (queryable via bases)
- Display nested properties with indentation in metadata panel
- Write-back preserves original nested YAML structure

Skip deeper nesting — it's rare in note frontmatter and the complexity isn't justified.

**Effort:** Low-medium. Flattening logic in `extract_metadata.ts` + display update in metadata panel.

### Metadata Gaps to Skip

| Lokus Feature                                     | Why Skip                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Multi-dimensional client-side indexes (5 indexes) | Carbide uses SQLite backend — better for scale. Don't duplicate                           |
| LRU metadata cache (1000 entries)                 | SQLite handles caching. Frontend store caches active note                                 |
| Custom YAML parser                                | Carbide uses `js-yaml` / remark — more correct, better maintained                         |
| Type conversion/coercion functions                | Infer types at extraction time, let UI editors handle display. No runtime coercion needed |
| Client-side filter evaluation (10+ operators)     | Bases queries run in SQLite — more efficient, already supports operators                  |

---

## Gap 4 (Deferred): Task Management

### Current State

Carbide extracts tasks from markdown (checkbox syntax) but has no dedicated task store, no task IDs, no status tracking beyond checked/unchecked.

### What Lokus Has

- Dedicated SQLite task table with IDs, status (todo/in-progress/done/blocked), priority, due dates, labels
- Tauri commands: `create_task`, `update_task`, `bulk_update_task_status`, `get_tasks_by_status`
- Tasks linked to source notes via `note_path`
- MCP tools for AI-driven task management

### Recommendation: Defer

Carbide's philosophy is markdown-first. Tasks-as-frontmatter-properties + bases queries can cover most use cases without a separate task DB. If needed later, implement as:

1. A `task` property type in the metadata system (status, due, priority)
2. Bases views filtered to task properties
3. MCP tools that query tasks via the bases engine

**Do not build a separate task database.** It duplicates state and creates sync problems with the markdown source of truth.

---

## Gap 5 (Deferred): Kanban Boards

### Recommendation: Defer

Kanban is a view layer over tasks/notes. If task management is built via bases + metadata properties, kanban becomes a UI component that reads from bases queries with status-column mapping. Not a backend concern.

---

## Gap 6 (Deferred): Plugin Distribution

### Current State

Carbide: local-only plugin discovery from `.carbide/plugins/`.
Lokus: npm package registry (`lokus-plugin-cli`), install/uninstall commands, auto-update.

### Recommendation: Phase after MCP

Plugin distribution is important but not blocking. When ready:

1. Simple Git-based registry (GitHub releases as plugin zips)
2. `plugin_install(url)` Tauri command that fetches + validates + extracts
3. Manifest checksum verification
4. No custom registry server — use GitHub API

---

## Gap 7 (Deferred): Clipboard API

### Current State

Carbide uses browser clipboard API (limited in Tauri context).
Lokus has dedicated Tauri commands for text, HTML, and clear operations.

### Recommendation: Add if needed

Low effort. If any feature (paste-as-markdown, paste-image) needs enhanced clipboard:

```rust
#[tauri::command]
pub async fn clipboard_read_html() -> Result<String, String>
#[tauri::command]
pub async fn clipboard_write_html(html: String) -> Result<(), String>
```

Not a priority. Build when a feature requires it.

---

## Implementation Order

```
Phase 1: MCP Core Server (Rust)                      ← START HERE
  ├── 1a. Feature module scaffold + types
  ├── 1b. Stdio transport + JSON-RPC handler
  ├── 1c. Tier 1 tools (notes, search, metadata, vault)
  └── 1d. Tauri commands for lifecycle

Phase 2: Metadata Foundations                         ← Unlocks better MCP + CLI + bases
  ├── 2a. Property type inference (Gap 3a)
  ├── 2b. Format-preserving frontmatter write-back (Gap 3b)
  └── 2c. Vault-wide property enumeration with types (Gap 3c)

Phase 3: HTTP Server + CLI Binary                    ← MCP HTTP + CLI ship together
  ├── 3a. Axum HTTP server + bearer auth + /health
  ├── 3b. /mcp JSON-RPC route (MCP over HTTP)
  ├── 3c. /cli/* REST routes (notes, search, vault, tags, metadata)
  ├── 3d. carbide-cli crate scaffold (clap + reqwest + formatter)
  ├── 3e. CLI core commands: read, search, files, tags, properties, outline
  ├── 3f. CLI write commands: create, write, append, prepend, rename, move, delete
  ├── 3g. CLI vault commands: vault, vaults, vault:open, status
  └── 3h. App launch detection (CLI → launch Carbide.app if not running)

Phase 4: Auto-Setup + Shell Integration              ← Configure MCP + CLI paths
  ├── 4a. Claude Desktop config generation (stdio)
  ├── 4b. Claude Code .mcp.json generation (HTTP)
  ├── 4c. CLI PATH registration (symlink / PATH export per platform)
  ├── 4d. Shell completions (bash, zsh, fish — clap generates for free)
  ├── 4e. Settings UI panel (MCP + CLI status, token management)
  └── 4f. `carbide --install-cli` self-registration command

Phase 5: Plugin Hardening                             ← Makes plugins useful
  ├── 5a. Activation events / lazy loading (Gap 2a)
  ├── 5b. Lifecycle hooks (Gap 2b)
  ├── 5c. RPC timeouts + rate limiting (Gap 2d)
  └── 5d. Richer settings schema (Gap 2e)

Phase 6: Extended Tools + Integration                ← Tier 2/3 for both MCP and CLI
  ├── 6a. Tier 2 MCP tools (references, graph, properties)
  ├── 6b. CLI git commands (git:status, git:commit, git:log, git:diff, git:push, git:pull)
  ├── 6c. CLI reference commands (references, reference:add, reference:search, reference:bbt)
  ├── 6d. CLI bases commands (bases:query, bases:properties, bases:views)
  ├── 6e. CLI task commands (tasks, task toggle/done/todo)
  ├── 6f. CLI plugin commands (plugins, plugin:enable/disable/reload)
  ├── 6g. CLI dev commands (eval, dev:screenshot, dev:lint, dev:format, dev:index)
  ├── 6h. Tier 3 MCP tools (git_status, git_log, rename_note)
  ├── 6i. Slash command contribution point (Gap 2c)
  └── 6j. MCP RPC namespace for plugins (Gap 1 Phase 4)

Phase 7: Power Features                              ← After core stabilizes
  ├── 7a. Bulk property operations (Gap 3d)
  ├── 7b. Nested property flattening (Gap 3e)
  ├── 7c. Plugin SDK / scaffolding (Gap 2f)
  ├── 7d. Plugin-contributed MCP tools
  └── 7e. CLI TUI mode (interactive, autocomplete, history — ratatui/rustyline)
```

**Rationale for ordering:**

- Phase 1 (MCP stdio) ships the highest-value feature independently — Claude Desktop works immediately
- Phase 2 (metadata) is pulled forward because it makes MCP tools, CLI property commands, and bases views meaningfully better
- Phase 3 (HTTP + CLI) ships the HTTP server for both MCP and CLI simultaneously — one axum instance, two interfaces. CLI core commands (read, search, tags) ship here because they're read-only and immediately useful
- Phase 4 (auto-setup) configures both MCP clients and CLI shell integration in one pass
- Phase 5 (plugins) is independent and can be interleaved
- Phase 6 (extended tools) adds the full breadth — git, references, bases, tasks for CLI; tier 2/3 for MCP. These are lower-priority commands that build on the core from Phase 3
- Phase 7 (power features + TUI) deferred until foundations prove stable. TUI is last because single-command CLI covers 90% of use cases

---

## Dependency Considerations

### Rust Crates (Tauri app)

| Crate   | Purpose                              | Notes                                                    |
| ------- | ------------------------------------ | -------------------------------------------------------- |
| `rmcp`  | MCP protocol types + stdio transport | Check if mature enough; fallback to hand-rolled JSON-RPC |
| `axum`  | HTTP server for Phase 3              | Tokio-native, minimal footprint                          |
| `tower` | Middleware (auth, CORS) for axum     | Already in tokio ecosystem                               |
| `rand`  | Token generation                     | Already available via other deps                         |

### Rust Crates (CLI binary — `src-tauri/crates/carbide-cli/`)

| Crate        | Purpose                        | Notes                                        |
| ------------ | ------------------------------ | -------------------------------------------- |
| `clap`       | Argument parsing + completions | Derive API. Generates shell completions free |
| `reqwest`    | HTTP client (blocking)         | Blocking client for CLI simplicity           |
| `serde_json` | JSON serialization             | Already in workspace                         |
| `colored`    | Terminal colors                | Lightweight, no deps                         |
| `tabled`     | Table formatting               | For `files`, `tags`, `properties` output     |

### Frontend

| Package  | Purpose                                     | Notes       |
| -------- | ------------------------------------------- | ----------- |
| None new | Settings UI uses existing shadcn components | No new deps |

---

## Architecture Alignment Check

| Rule                               | Compliance                                                    |
| ---------------------------------- | ------------------------------------------------------------- |
| Decision tree: IO → Port + Adapter | MCP server is IO; wrapped in `McpPort` + `McpTauriAdapter`    |
| Services cannot import adapters    | MCP service calls port interface only                         |
| Stores are sync-only               | `McpStore` holds status/config, no async                      |
| Reactors for auto-triggers         | `mcp_autostart.reactor.svelte.ts` starts server on vault open |
| specta for type generation         | All Tauri commands annotated with `#[specta::specta]`         |
| Layering enforced                  | `pnpm lint:layering` validates all imports                    |
| CLI is a separate binary           | `carbide-cli` crate has no dependency on Tauri; only HTTP     |
| No logic duplication               | CLI routes and MCP tools both call shared service functions   |

---

## Anti-Patterns to Avoid (Lessons from Lokus)

1. **No Node.js sidecar.** Lokus spawns a Node.js process for MCP. Carbide should run MCP natively in the Tauri Rust process — fewer moving parts, no runtime dependency, no process lifecycle bugs.

2. **No in-memory-only indexing.** Lokus indexes metadata in JS memory with LRU cache. Carbide already has SQLite — use it.

3. **No workspace detection heuristics.** Lokus walks CWD, checks env vars, falls back to defaults. Carbide has a vault registry with an explicit active vault. Use it directly.

4. **No emoji-heavy tool responses.** MCP tool output should be clean markdown consumable by any LLM, not decorated with status emojis.

5. **No manual TypeScript bindings.** Lokus hand-writes IPC wrappers. Carbide uses specta — all MCP lifecycle commands get auto-generated types for free.

---

## Success Criteria

### MCP (Phases 1, 3, 6)

- [ ] `claude mcp list` shows `carbide` as available server
- [ ] Claude Desktop can `list_notes`, `read_note`, `search_notes` for active vault
- [ ] Claude Code can interact via HTTP transport with bearer auth
- [ ] MCP server auto-starts when Carbide launches (configurable)
- [ ] Settings panel shows MCP + CLI status and allows token regeneration
- [ ] All MCP tools have input validation and clean error responses

### CLI (Phases 3, 4, 6)

- [ ] `carbide version` returns version when app is running
- [ ] `carbide read file=<name>` returns note content in <100ms
- [ ] `carbide search query="..."` returns results formatted as clean text
- [ ] `carbide --json` flag works on all commands for script consumption
- [ ] `carbide git:status` shows working tree status without opening the app UI
- [ ] `curl localhost:3457/cli/read -H "Authorization: Bearer <token>" -d '{"path":"test.md"}'` works (HTTP is standard, debuggable)
- [ ] Shell completions work for bash, zsh, and fish
- [ ] First command auto-launches Carbide if not running
- [ ] CWD-based vault detection works (run `carbide files` inside a vault directory)
- [ ] `carbide` with no args shows help

### Metadata (Phases 2, 7)

- [ ] `infer_property_type` correctly classifies dates, booleans, numbers, arrays, tags
- [ ] Bases queries on date/number properties use type-aware comparison (not string sort)
- [ ] Editing a property in metadata panel writes back to YAML without corrupting formatting
- [ ] `list_properties` returns inferred types and top unique values
- [ ] Bulk rename/delete property modifies all matching notes atomically with git checkpoint
- [ ] Nested frontmatter `{ author: { name: "Jane" } }` indexed as `author.name`

### Plugin Hardening (Phases 4, 6)

- [ ] Plugins with `on_startup_finished` don't block app boot
- [ ] Plugin with no matching activation event stays unloaded until triggered
- [ ] Plugins receive `activate`/`deactivate` lifecycle messages
- [ ] RPC calls that exceed 5s timeout return error (not hang)
- [ ] Plugin with 10 consecutive errors is auto-disabled with user notification
- [ ] Slash commands from plugins appear in editor `/` menu
- [ ] Plugin settings support `textarea` type with multiline input

### Cross-Cutting

- [ ] Zero new frontend dependencies
- [ ] CLI binary adds no dependencies to the Tauri app (separate crate)
- [ ] `pnpm check`, `pnpm lint`, `pnpm test`, `cargo check` all pass
- [ ] CLI and MCP share the same HTTP server, auth token, and service functions — zero logic duplication
