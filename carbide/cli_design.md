# Carbide CLI Design

> **Date:** 2026-04-05
> **Status:** Draft
> **Context:** CLI for controlling Carbide from the terminal, modeled after Obsidian CLI but leveraging Carbide's unique capabilities (git, references, bases, AI, linked sources).
> **Dependency:** MCP Server (Phase 1 of `mcp_native_gaps_plan.md`) — CLI and MCP share the same HTTP transport.

---

## Executive Summary

A CLI that lets users (and AI agents) interact with Carbide from the terminal. Unlike Obsidian CLI which is the _only_ programmatic interface, Carbide's CLI is a **thin client** over the same HTTP endpoint that the MCP server exposes. This means:

1. One transport layer serves both MCP clients (Claude, Cursor) and human CLI users
2. CLI is a Rust binary that ships with the app — no Node.js, no Python
3. Every CLI command maps 1:1 to an existing Tauri command or MCP tool

---

## Architecture

```
                          ┌──────────────────────┐
  carbide help            │   carbide CLI binary  │  (Rust, ~2MB)
  carbide read            │   - arg parser        │
  carbide search "foo"    │   - HTTP client       │
                          │   - output formatter  │
                          └──────────┬───────────┘
                                     │ HTTP POST localhost:3457
                                     ▼
                          ┌──────────────────────┐
                          │  Carbide App (Tauri)  │
                          │  ┌────────────────┐   │
                          │  │ HTTP/MCP Server │   │  (axum, from MCP Phase 3)
                          │  │ /cli/*  routes  │   │
                          │  └───────┬────────┘   │
                          │          │             │
                          │  ┌───────▼────────┐   │
                          │  │ Tauri Commands  │   │  (existing Rust functions)
                          │  └────────────────┘   │
                          └──────────────────────┘
```

### Why not a separate IPC mechanism?

The MCP plan already calls for an axum HTTP server on port 3457 with bearer auth. The CLI reuses this — adding `/cli/*` routes alongside `/mcp` costs near-zero. The CLI binary is just an HTTP client with nice argument parsing and output formatting.

### Why not stdio MCP for CLI too?

Stdio MCP requires spawning a sidecar process that communicates via JSON-RPC over stdin/stdout. That's perfect for Claude Desktop but terrible for human users who want `carbide search "foo"` to return plain text in 50ms. The CLI needs direct HTTP request-response, not a persistent JSON-RPC session.

### Binary location

| Platform | Path                                           | Registration                                                        |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| macOS    | `Carbide.app/Contents/MacOS/carbide-cli`       | Symlink to `/usr/local/bin/carbide` or PATH export in `~/.zprofile` |
| Linux    | Alongside AppImage or `/usr/local/bin/carbide` | Symlink                                                             |
| Windows  | `carbide-cli.exe` next to `Carbide.exe`        | Added to PATH during install                                        |

The CLI binary is a separate Rust crate in the workspace (`src-tauri/crates/carbide-cli/`), compiled alongside the main app. It's ~2MB — just `clap` + `reqwest` + `serde_json` + a formatter.

---

## Design Decisions

| Decision                | Choice                                                | Rationale                                                                        |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Argument style**      | `carbide <command> [key=value] [flags]`               | Matches Obsidian CLI. Familiar to Obsidian users migrating. No dashes for params |
| **Output format**       | Plain text default, `--json` flag for structured      | Humans get readable output; scripts/agents get JSON                              |
| **Vault targeting**     | CWD detection first, then `vault=<name\|id>` param    | Same as Obsidian. Carbide's `VaultRegistry` already maps paths to vault IDs      |
| **File targeting**      | `file=<name>` (wiki-link resolution) + `path=<exact>` | Same as Obsidian. Carbide's search index handles name resolution                 |
| **Auth**                | Bearer token from `~/.carbide/mcp-token`              | Shared with MCP server. Single auth mechanism                                    |
| **TUI**                 | Deferred                                              | Obsidian's TUI (autocomplete, history) is nice but not MVP. Plain commands first |
| **App must be running** | Yes, first command launches app if needed             | `carbide` checks HTTP health endpoint; if down, launches `Carbide.app` and waits |

---

## Command Reference

### General

#### `help`

Show list of all available commands.

```
carbide help
carbide help <command>
```

#### `version`

Show Carbide version.

```
carbide version
```

#### `status`

Show app status: running vault, active file, MCP server status.

```
carbide status
```

---

### Vault

#### `vault`

Show active vault info.

```
carbide vault
carbide vault info=name|path|files|folders|size
```

#### `vaults`

List known vaults.

```
carbide vaults
carbide vaults verbose    # include paths
carbide vaults total      # count only
```

#### `vault:open`

Switch to a different vault.

```
carbide vault:open name="My Notes"
carbide vault:open id=<vault_id>
```

---

### Notes

#### `read`

Read note contents (default: active file).

```
carbide read
carbide read file=Recipe
carbide read path="Projects/carbide.md"
```

#### `create`

Create a new note.

```
carbide create name="Meeting Notes"
carbide create name=Note content="# Title\n\nBody" open
carbide create path="Projects/plan.md" content="..." overwrite
```

| Parameter        | Description                    |
| ---------------- | ------------------------------ |
| `name=<name>`    | Note name                      |
| `path=<path>`    | Exact path from vault root     |
| `content=<text>` | Initial content                |
| `overwrite`      | Overwrite if exists            |
| `open`           | Open in Carbide after creating |

#### `write`

Write/update note contents.

```
carbide write path="todo.md" content="new content"
carbide write file=Recipe content="updated recipe"
```

#### `append`

Append content to a note (default: active file).

```
carbide append content="- [ ] Buy groceries"
carbide append file=TODO content="\n## New Section"
```

#### `prepend`

Prepend content after frontmatter.

```
carbide prepend content="**Updated 2026-04-05**"
carbide prepend file=README content="..."
```

#### `rename`

Rename a note. Updates internal links automatically.

```
carbide rename file=OldName name=NewName
carbide rename path="notes/old.md" name="new"
```

#### `move`

Move a note to a different folder. Updates links.

```
carbide move file=Recipe to="Archive/"
carbide move path="inbox/note.md" to="projects/"
```

#### `delete`

Delete a note (default: active file, moves to trash).

```
carbide delete file=OldNote
carbide delete path="scratch.md" permanent
```

#### `open`

Open a file in Carbide.

```
carbide open file=Recipe
carbide open path="Projects/plan.md" newtab
```

---

### Files & Folders

#### `files`

List files in the vault.

```
carbide files
carbide files folder=Projects
carbide files ext=md
carbide files total
```

#### `folders`

List folders in the vault.

```
carbide folders
carbide folders folder=Projects   # children of Projects/
carbide folders total
```

#### `folder`

Show folder info.

```
carbide folder path=Projects
carbide folder path=Projects info=files|size
```

#### `folder:create`

Create a new folder.

```
carbide folder:create path="Projects/New Project"
```

---

### Search

#### `search`

Full-text search across the vault. Returns matching file paths with snippets.

```
carbide search query="meeting notes"
carbide search query="TODO" limit=10
carbide search query="rust async" --json
```

| Parameter      | Description                 |
| -------------- | --------------------------- |
| `query=<text>` | **(required)** Search query |
| `limit=<n>`    | Max results                 |
| `--json`       | Structured output           |

#### `search:context`

Search with matching line context (grep-style output).

```
carbide search:context query="fn main"
```

---

### Tags

#### `tags`

List tags in the vault.

```
carbide tags
carbide tags counts         # include occurrence counts
carbide tags sort=count     # sort by count
carbide tags file=Recipe    # tags for a specific note
carbide tags total
carbide tags format=json
```

#### `tag`

Get info about a specific tag.

```
carbide tag name=project
carbide tag name=project verbose   # include file list
carbide tag name=project total     # occurrence count
```

---

### Metadata / Properties

#### `properties`

List properties in the vault or for a specific note.

```
carbide properties
carbide properties file=Recipe
carbide properties counts          # include occurrence counts
carbide properties sort=count
carbide properties format=yaml|json
```

#### `property:read`

Read a property value from a note.

```
carbide property:read name=status file=Recipe
```

#### `property:set`

Set a property on a note (default: active file).

```
carbide property:set name=status value=done
carbide property:set name=due value="2026-04-10" file=Recipe
carbide property:set name=tags value="[project, active]" type=list
```

#### `property:remove`

Remove a property from a note.

```
carbide property:remove name=draft file=Recipe
```

---

### Outline

#### `outline`

Show headings for a note.

```
carbide outline
carbide outline file=Recipe
carbide outline format=tree|md|json
carbide outline total
```

---

### Links

#### `backlinks`

List notes linking to a file.

```
carbide backlinks
carbide backlinks file=Recipe
carbide backlinks counts
carbide backlinks total
```

#### `links`

List outgoing links from a file.

```
carbide links
carbide links file=Recipe
carbide links total
```

---

### Git

Carbide has built-in git — no need to shell out to `git` separately.

#### `git:status`

Show working tree status for the vault.

```
carbide git:status
```

#### `git:commit`

Stage all changes and commit.

```
carbide git:commit message="daily checkpoint"
```

#### `git:log`

Show commit history.

```
carbide git:log
carbide git:log limit=20
carbide git:log --json
```

#### `git:diff`

Show diff of uncommitted changes.

```
carbide git:diff
carbide git:diff path="notes/recipe.md"
```

#### `git:push`

Push to remote.

```
carbide git:push
```

#### `git:pull`

Pull from remote.

```
carbide git:pull
carbide git:pull strategy=rebase
```

#### `git:restore`

Restore a file to a previous commit.

```
carbide git:restore path="notes/recipe.md" commit=abc123
```

#### `git:init`

Initialize git in the vault.

```
carbide git:init
```

---

### References / Citations

Carbide-unique. No equivalent in Obsidian CLI.

#### `references`

List citation library entries.

```
carbide references
carbide references --json
carbide references total
```

#### `reference`

Get a specific citation entry.

```
carbide reference id=smith2024
```

#### `reference:add`

Add a citation by DOI lookup.

```
carbide reference:add doi="10.1038/nature12373"
```

#### `reference:search`

Search the citation library.

```
carbide reference:search query="machine learning"
```

#### `reference:bbt`

Interact with Zotero Better BibTeX.

```
carbide reference:bbt search="neural networks"
carbide reference:bbt collections
carbide reference:bbt bibliography keys="smith2024,jones2025"
```

---

### Bases (Structured Queries)

Carbide-unique. Query notes as structured data.

#### `bases:query`

Query notes with filters and sorting.

```
carbide bases:query filter="status = done"
carbide bases:query filter="due > 2026-04-01" sort=due
carbide bases:query filter="tags contains project" format=json
```

#### `bases:properties`

List all queryable properties with types.

```
carbide bases:properties
```

#### `bases:views`

List saved bases views.

```
carbide bases:views
```

---

### Tasks

#### `tasks`

List tasks (checkboxes) in the vault.

```
carbide tasks
carbide tasks todo              # incomplete only
carbide tasks done              # completed only
carbide tasks file=Recipe
carbide tasks daily             # today's tasks (if daily note convention)
carbide tasks verbose           # group by file with line numbers
carbide tasks total
```

#### `task`

Show or toggle a task.

```
carbide task file=Recipe line=8
carbide task file=Recipe line=8 toggle
carbide task file=Recipe line=8 done
carbide task file=Recipe line=8 todo
```

---

### Linked Sources

Carbide-unique. Manage PDFs and other linked reference documents.

#### `sources`

List indexed linked source files.

```
carbide sources
carbide sources --json
```

#### `source:scan`

Scan a folder for reference source files.

```
carbide source:scan folder="~/Papers"
```

#### `source:extract`

Extract text/metadata from a source file.

```
carbide source:extract file="~/Papers/smith2024.pdf"
```

---

### AI

#### `ai`

Run an AI prompt against the vault context. Delegates to the configured AI CLI tool.

```
carbide ai prompt="Summarize my meeting notes from this week"
carbide ai prompt="What are my open tasks?" context=vault
```

---

### Plugins

#### `plugins`

List installed plugins.

```
carbide plugins
carbide plugins enabled
```

#### `plugin:enable`

Enable a plugin.

```
carbide plugin:enable id=my-plugin
```

#### `plugin:disable`

Disable a plugin.

```
carbide plugin:disable id=my-plugin
```

#### `plugin:reload`

Reload a plugin (for developers).

```
carbide plugin:reload id=my-plugin
```

---

### Developer Commands

#### `eval`

Execute JavaScript in the app context and return result.

```
carbide eval code="app.vault.getFiles().length"
```

#### `dev:screenshot`

Take a screenshot of the app window.

```
carbide dev:screenshot path=screenshot.png
```

#### `dev:lint`

Run markdown linting on the vault.

```
carbide dev:lint
carbide dev:lint path="notes/recipe.md"
carbide dev:lint fix    # auto-fix
```

#### `dev:format`

Format markdown files.

```
carbide dev:format
carbide dev:format path="notes/recipe.md"
```

#### `dev:index`

Manage the search index.

```
carbide dev:index build
carbide dev:index rebuild
carbide dev:index status
```

---

### Output Control

These flags work with any command:

| Flag             | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `--json`         | Output as JSON                                               |
| `--copy`         | Copy output to clipboard                                     |
| `--quiet`        | Suppress non-essential output                                |
| `--vault=<name>` | Target a specific vault (alternative to positional `vault=`) |

---

## Implementation Plan

### Phase 0: HTTP Server Extension (from MCP plan)

The MCP plan (Phase 3) already builds an axum server on port 3457. Extend it:

- Add `/cli/<command>` route prefix
- CLI routes accept `application/x-www-form-urlencoded` or JSON body
- Response: JSON always (CLI binary formats for human display)
- Same bearer token auth as MCP

This is ~50 lines of axum routing on top of what MCP Phase 3 already builds.

### Phase 1: CLI Binary Scaffold

New crate: `src-tauri/crates/carbide-cli/`

```
carbide-cli/
├── Cargo.toml
├── src/
│   ├── main.rs          # Entry point, arg dispatch
│   ├── client.rs        # HTTP client (reqwest)
│   ├── auth.rs          # Token reader from ~/.carbide/mcp-token
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── notes.rs     # read, create, write, append, prepend, rename, move, delete
│   │   ├── search.rs    # search, search:context
│   │   ├── vault.rs     # vault, vaults, vault:open
│   │   ├── git.rs       # git:status, git:commit, git:log, etc.
│   │   ├── tags.rs      # tags, tag
│   │   ├── metadata.rs  # properties, property:read/set/remove
│   │   ├── tasks.rs     # tasks, task
│   │   ├── references.rs # references, reference:add/search
│   │   ├── bases.rs     # bases:query, bases:properties
│   │   ├── plugins.rs   # plugins, plugin:enable/disable/reload
│   │   ├── dev.rs       # eval, dev:screenshot, dev:lint, dev:index
│   │   └── general.rs   # help, version, status
│   └── format.rs        # Output formatting (table, tree, plain text)
```

Dependencies: `clap` (arg parsing), `reqwest` (HTTP), `serde_json`, `colored` (terminal colors), `tabled` (table formatting).

### Phase 2: Core Commands

Implement in priority order (matches what users do most):

1. `read`, `search`, `files` — read-only, safe, immediately useful
2. `create`, `write`, `append` — note creation/editing
3. `tags`, `properties`, `outline`, `backlinks` — vault exploration
4. `git:*` — version control
5. `tasks` — task management
6. `references`, `bases:query` — power features

### Phase 3: App Launch & Health

- CLI checks `GET http://localhost:3457/health` before every command
- If unhealthy, attempt to launch `Carbide.app` (platform-specific)
- Poll health endpoint for up to 10s, then fail with helpful error
- `carbide status` shows: app running, vault name, MCP status, connected clients

### Phase 4: Shell Integration

- `carbide --install-cli` registers the binary on PATH (same mechanism as Obsidian)
- Shell completions: `carbide --completions bash|zsh|fish` (clap generates these for free)
- Man page generation from clap (optional)

### Phase 5: TUI (Deferred)

Interactive terminal UI with autocomplete and command history. Uses `ratatui` or `rustyline`. Not MVP — the single-command interface covers 90% of use cases, and AI agents don't need a TUI.

---

## Server-Side Route Design

The axum server handles both MCP and CLI requests:

```rust
let app = Router::new()
    // MCP routes (from mcp_native_gaps_plan.md)
    .route("/mcp", post(mcp_jsonrpc_handler))
    .route("/mcp/sse", get(mcp_sse_handler))
    // CLI routes
    .nest("/cli", cli_router())
    // Health
    .route("/health", get(health_handler))
    .layer(auth_layer);

fn cli_router() -> Router {
    Router::new()
        .route("/read", post(cli_read_note))
        .route("/create", post(cli_create_note))
        .route("/search", post(cli_search))
        .route("/files", post(cli_list_files))
        .route("/tags", post(cli_list_tags))
        // ... one route per command
}
```

Each CLI route handler:

1. Deserializes params from the request body
2. Calls the **same Rust function** that the Tauri command calls (service layer)
3. Returns JSON response
4. CLI binary formats JSON into human-readable output

No logic duplication — CLI routes are 5-10 line adapter functions.

---

## Differences from Obsidian CLI

| Aspect             | Obsidian CLI                                  | Carbide CLI                                                                                                   |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Git**            | Not available                                 | First-class (`git:*` commands)                                                                                |
| **References**     | Not available                                 | Citations, DOI lookup, Zotero integration                                                                     |
| **Bases**          | Not available (Bases are new in Obsidian too) | Structured queries with filters                                                                               |
| **Linked sources** | Not available                                 | PDF/document management                                                                                       |
| **AI**             | Not available                                 | AI prompt execution                                                                                           |
| **MCP**            | Separate concern                              | Same HTTP server serves both CLI and MCP                                                                      |
| **Transport**      | Custom IPC (Electron ↔ CLI)                   | HTTP (standard, debuggable with curl)                                                                         |
| **TUI**            | Ships with interactive mode                   | Deferred — single commands first                                                                              |
| **Binary**         | Ships with Electron app                       | Standalone Rust binary (~2MB)                                                                                 |
| **Sync**           | Obsidian Sync commands                        | Git push/pull (Carbide uses git, not proprietary sync)                                                        |
| **Publish**        | Obsidian Publish commands                     | Not applicable (no hosted publishing)                                                                         |
| **Daily notes**    | `daily`, `daily:read`, `daily:append`         | Convention-based — use `read`/`append` with path to daily note. Add `daily` alias if convention is configured |
| **Bookmarks**      | Built-in                                      | Not implemented in Carbide (use tags/properties instead)                                                      |

---

## Vault Resolution Chain

When the CLI receives a command:

```
1. Explicit `vault=<name|id>` parameter?
   → Resolve via VaultRegistry
2. CWD is inside a known vault path?
   → Use that vault
3. Neither?
   → Use the last-opened vault (from VaultRegistry.last_vault_id)
4. No vaults registered?
   → Error: "No vaults found. Open Carbide and add a vault first."
```

This matches Obsidian CLI behavior but uses Carbide's existing `VaultRegistry` and `resolve_file_to_vault` Tauri command.

---

## Example Workflows

### Daily writing workflow

```bash
# Open today's notes
carbide create name="2026-04-05" path="journal/2026-04-05.md" content="# April 5\n\n"

# Append a thought throughout the day
carbide append path="journal/2026-04-05.md" content="- Met with team about CLI design"

# End of day: commit
carbide git:commit message="journal: april 5"
```

### Research workflow

```bash
# Add a paper by DOI
carbide reference:add doi="10.1038/nature12373"

# Search your library
carbide reference:search query="neural"

# Find notes referencing a topic
carbide search query="transformer architecture" --json | jq '.[].path'

# Check what properties exist
carbide bases:properties
```

### AI agent workflow (Claude Code / Cursor)

```bash
# List all notes in a project folder
carbide files folder=Projects/carbide --json

# Read a specific note
carbide read path="Projects/carbide/architecture.md"

# Search for relevant context
carbide search query="MCP server design" limit=5 --json

# Create a summary note
carbide create path="Projects/carbide/mcp-summary.md" content="..." overwrite

# Commit the work
carbide git:commit message="AI-generated MCP summary"
```

### Script integration

```bash
#!/bin/bash
# Export all tasks to a file
carbide tasks todo --json > open_tasks.json

# Count notes per tag
carbide tags counts format=json | jq '.[] | "\(.name): \(.count)"'

# Batch property update (via loop — bulk ops come from metadata gap plan)
for note in $(carbide bases:query filter="status = review" format=paths); do
  carbide property:set path="$note" name=status value=done
done
```

---

## Relationship to MCP

The CLI and MCP server are **complementary interfaces to the same backend**:

|                  | CLI                    | MCP                            |
| ---------------- | ---------------------- | ------------------------------ |
| **Consumer**     | Humans, shell scripts  | AI assistants (Claude, Cursor) |
| **Protocol**     | HTTP REST-ish          | JSON-RPC 2.0                   |
| **Auth**         | Same bearer token      | Same bearer token              |
| **Transport**    | HTTP only              | Stdio + HTTP                   |
| **Output**       | Formatted text or JSON | Always JSON (MCP spec)         |
| **Server**       | Same axum instance     | Same axum instance             |
| **Tool overlap** | ~80% overlap           | ~80% overlap                   |

The 20% non-overlap:

- CLI has `git:*`, `dev:*`, `plugin:*` which are less relevant for MCP tools
- MCP has `resources` (vault structure, config) which aren't useful as CLI commands

---

## Implementation Priority

```
Phase 0: HTTP server extension (with MCP Phase 3)     ← 0 extra effort if MCP ships first
Phase 1: CLI binary scaffold + health/version/status   ← 1 day
Phase 2: Core read-only commands (read, search, files, tags)  ← 2 days
Phase 3: Write commands (create, write, append, property:set) ← 1 day
Phase 4: Git commands                                  ← 1 day
Phase 5: References, bases, tasks                      ← 2 days
Phase 6: Shell integration (PATH, completions)         ← 0.5 day
Phase 7: TUI (deferred)
```

Total for MVP (Phases 0-4): ~5 days of work, assuming MCP HTTP server exists.

---

## Success Criteria

- [ ] `carbide version` returns version when app is running
- [ ] `carbide read file=<name>` returns note content in <100ms
- [ ] `carbide search query="..."` returns results formatted as clean text
- [ ] `carbide --json` flag works on all commands for script consumption
- [ ] `carbide git:status` shows working tree status without opening the app UI
- [ ] `curl http://localhost:3457/cli/read -H "Authorization: Bearer <token>" -d "path=notes/test.md"` works (HTTP is standard)
- [ ] Shell completions work for bash, zsh, and fish
- [ ] First command auto-launches Carbide if not running
- [ ] `carbide` with no args shows help (not TUI in MVP)
