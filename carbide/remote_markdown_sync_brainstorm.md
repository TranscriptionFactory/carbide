# Remote Markdown Document Sync — Brainstorm

**Date:** 2026-06-09

**Question:** How should Carbide centralize and sync markdown documents spread across multiple remote GitHub repositories?

---

## Current Capabilities (What Exists Today)

| Capability | Location | Relevance |
|---|---|---|
| Vault system (local markdown files) | `src/lib/features/vault/` | Destination for synced content |
| Git integration (init, commit, push/pull, remotes) | `src/lib/features/git/` | Sync mechanism |
| Plugin system (iframe + RPC API) | `src/lib/features/plugin/` | Extensibility path |
| Linked sources (scan folders → index content) | `src/lib/features/reference/` | Indexing pipeline, search across external content |
| FTS search (SQLite) | `src/lib/features/search/` | Cross-repo full-text search |
| External MCP / sidecar | `src-tauri/src/features/external_mcp/` | Subprocess-based integrations |
| Plugin network fetch | `plugin_rpc_handler.ts` (`network.*`) | HTTP/API access from plugins |
| Plugin vault CRUD | `plugin_rpc_handler.ts` (`vault.*`) | Read/write notes from plugins |

---

## Options (lightest → deepest integration)

### 1. Plugin: GitHub Read-Only Browser

A plugin that uses `network.*` to call the GitHub API (list repos, fetch file trees, read raw markdown). Renders a browsable tree in a sidebar panel. Clicking a file fetches it through the API and displays it.

**Pros:**
- Zero core changes; entirely plugin
- Works today
- Can use `vault.create` to optionally import selected files

**Cons:**
- No search indexing (no FTS integration from plugins)
- No offline mode
- Rate limiting if many repos
- Content read-only unless explicitly copied to vault
- Polling for updates is expensive and manual

---

### 2. Plugin + Local Clone + FTS

The plugin uses `sidecar.*` to spawn a small Go/Rust binary that manages one or more local git clones. The binary handles clone/pull and file listing. The plugin feeds markdown files into Carbide via `vault.create`, writing shadow copies into an `.external_repos/` folder inside the vault. The search index picks them up automatically.

**Pros:**
- Leverages existing FTS search
- Git auth/private repos work via sidecar binary
- Offline-capable once cloned

**Cons:**
- Duplicates disk space (clone + vault copy)
- Sync is one-way (remote → local)
- Conflict handling: vault git and imported content tracking same repo is messy
- Requires git/SSH on user's PATH

---

### 3. Vault-as-Git-Sources: Remote Repo → Vault Subfolder

A new **`remote` feature** that manages a registry of remote GitHub repos, clones them (shallow) into a designated subfolder of the vault, and periodically pulls. Users edit remote notes in Carbide and commit/push back. Metadata store tracks which folders are remote-sourced so they can be surfaced differently in the UI.

**Feature anatomy:**
```
src/lib/features/remote/
├── ports.ts              # RemoteRepoPort (list, clone, pull, scan_markdown)
├── state/
│   └── remote_store.svelte.ts  # remote sources, sync status
├── application/
│   ├── remote_service.ts       # clone, pull, discover markdown, re-index
│   ├── remote_actions.ts       # add/remove remote, sync now, browse
├── adapters/
│   └── remote_tauri_adapter.ts # delegates to Rust git commands
├── ui/
│   ├── remote_panel.svelte     # sidebar: list of remote sources + status
│   └── add_remote_dialog.svelte
```

**Pros:**
- Deep native integration
- FTS works out of the box (files are in the vault)
- Bidirectional: edit in Carbide, commit, push back to GitHub
- Status indicators in file tree

**Cons:**
- New feature module + Rust commands required
- Opinionated about folder layout (`.remotes/` or configurable)
- Same repo across multiple vaults = duplicated clones
- Auth & credential management adds complexity

---

### 4. Linked Source Extension

Extend the existing `Reference/LinkedSourcePort` to handle URL-based sources in addition to local folders. The existing `scan_folder` → `index_content` pipeline already handles indexing. Add a "Remote Git Source" type that clones/pulls to `.carbide/linked_sources/<name>/`, scans for `*.md`, and indexes into the linked notes search index alongside cited PDFs.

**Pros:**
- Reuses existing infrastructure (scan, index, search)
- `search_linked_notes` already works across sources
- Less new code than a fresh feature
- Fits the "reference" mental model

**Cons:**
- Linked sources today are for cited PDFs/research — repurposing for general markdown may confuse users
- Markdown notes from repos might warrant different UI treatment than academic citations
- Linkage between linked notes and regular notes could be surprising

---

### 5. Plugin + GitHub MCP Server

Run an MCP-compatible GitHub server as a sidecar via `sidecar.*`. The plugin wraps the MCP tool calls (`search_repos`, `list_files`, `read_file`) in a custom UI.

**Pros:**
- Leverages existing MCP community server ecosystem
- Plugin code is thin — mostly UI
- MCP provides tool discovery and structured interaction

**Cons:**
- No local storage / offline
- Chatty protocol for browsing (one call per file read)
- No FTS integration with Carbide's index
- Requires MCP server to be installed by the user

---

### 6. Cross-Vault Federated Index (Most Ambitious)

A first-class feature managing a registry of "remote collections" — each mapped to a GitHub repo, a folder in a repo, or an arbitrary URL. Content is lazily fetched and indexed into a unified FTS index across all collections. The file tree shows a virtual "Remote" section alongside the vault tree. Updates via polling + ETag/`If-None-Match` or optional webhook relay.

**Pros:**
- Polished UX; unified search; feels native
- Could support GitHub, GitLab, HuggingFace, Obsidian Publish, etc.
- Virtual file tree avoids disk duplication

**Cons:**
- Most work; significant Rust + TS surface
- Webhook relay is its own infrastructure component
- Likely overkill for current app state (0 users)

---

## Design Dimensions

| Dimension | Options |
|---|---|
| Sync direction | Read-only vs. bidirectional |
| Scope | Single repo, org-wide, arbitrary URL |
| Update mechanism | Manual, periodic polling, webhooks |
| Storage | Inline copy, linked reference, view-only |
| Search | FTS across everything, repo-scoped only |
| UX | Browse tree, unified search, individual note view |

## Recommendation

**Option 3 (Vault-as-Git-Sources) or a hybrid of 3 + 4:**

1. Carbide already has **git** (push/pull/remote management) — option 3 naturally extends that
2. Carbide already has **linked sources** with scanning + indexing — option 4's pipeline is battle-tested
3. A plugin-only approach (1, 2, 5) inevitably hits walls: no FTS integration, no offline capability, no edit-and-push-back flow
4. A federated index (6) is ambitious but premature without validation

**Hybrid approach:** Extend linked sources to support "Remote Git Source" where the index pipeline is reused and git cloning/updating delegates to the existing `GitPort`. The UI gets a "Remote Docs" tab in the sidebar for browsing, search, and bulk-open.
