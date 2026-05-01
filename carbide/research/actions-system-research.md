# Carbide Actions System: Research & Implementation Notes

## Status: Research Complete | 2026-04-30

---

## 1. What Exists Today

### Plugin System (iframe-based, sandboxed)

Carbide has a **full plugin architecture** modeled after Obsidian's `.obsidian/plugins/` pattern. Each plugin lives in `.carbide/plugins/<id>/` with:

- `manifest.json` — declares permissions, activation events, contributed commands/settings
- `index.html` — the runtime, loaded in a sandboxed iframe

**Communication:** plugins talk to the host app exclusively via `postMessage` RPC. Two API surfaces exist:

| API Style | Used By | Notes |
|---|---|---|
| Raw RPC (`rpc.send("method", ...)`) | hello-world, word-count, plugin-tester, html-to-markdown, auto-tag | Older, manual |
| `carbide.*` global object | smart-templates, slides | Injected by host at runtime via `carbide-plugin-api.js` |

### Available Plugin APIs

```
carbide.commands.register({ id, label, description, keywords, icon })
carbide.editor.getValue() / getInfo() / getSelection() / replaceSelection(text)
carbide.vault.list() / read(path) / modify(path, content) / create(path, content) / readAsset(path)
carbide.metadata.getFileCache(path)    → { frontmatter, tags, headings, links, stats }
carbide.metadata.getBacklinks(path)
carbide.ui.showNotice(message) / addSidebarPanel({ id, label, icon })
carbide.events.on("active-file-changed" | "file-created" | "file-modified" | "file-deleted" | "editor-selection-changed", cb)
carbide.settings.get(key) / registerTab({ label, settings })
carbide.export.saveBinary(bytes, filename, fileTypes)
```

### Command System

Plugins register commands → they appear in the app's command palette. When invoked, the host sends `{ method: "command.execute", params: ["plugin-id:command-id"] }` to the plugin iframe.

**Currently active commands** (from `smart-templates`):
- `smart-templates:open-panel`
- `smart-templates:insert-template`
- `smart-templates:create-template`
- `smart-templates:create-from-note`

### Template System (via `smart-templates` plugin)

Full Handlebars-compatible engine with:
- Context: `current_note`, `selection`, `fileCache` (frontmatter/tags/headings/links), `backlinks`, `date`, `time`
- Helpers: `date`, `time`, `slugify`, `truncate`, `split`, `join`, `sort`, `uniq`, `uppercase`, `lowercase`, math ops
- Templates stored as markdown files with YAML frontmatter in a configurable vault folder

### Built-in AI/Semantic Features (host-app, not plugins)

```json
"semantic_omnibar_enabled": true,
"semantic_graph_edges_per_note": 2,
"semantic_related_notes_limit": 10,
"semantic_similarity_threshold": 0.65,
"semantic_suggested_links_limit": 5
```

These are host-level features — no plugin API exposes them yet.

### Smart Links (rule-based, not plugin)

`.carbide/smart-links/rules.json` scores note connections by metadata (shared tags: 0.9, shared creation day: 0.6) and semantic similarity (0.9).

---

## 2. What's Missing: "Programmable Actions"

### No External Automation

There is **no MCP server, no CLI, no HTTP API, no filesystem-watch automation hook**. The plugin system is strictly in-app — plugins only run when Carbide is open and only communicate via iframe postMessage. There is no way to:

- Trigger a plugin action from the terminal or another app
- Run a plugin headlessly (without the UI)
- Invoke Carbide commands from MCP tools
- Automate vault operations from Claude Code or any external process

### No Action Composition

Plugins can't call each other's commands. There's no pipeline/workflow/action-chaining mechanism. Each plugin is an island.

### No Scripting Layer

Unlike Obsidian's Templater (which runs arbitrary JS) or QuickAdd (which chains actions), Carbide's template system is declarative only — no `await` calls, no vault mutations from within a template, no prompt-for-input.

---

## 3. Implementation Paths

### Path A: External CLI/MCP Bridge (highest value, most effort)

**Goal:** Let Claude Code (or any MCP client) perform vault operations.

**Approach:** A standalone MCP server that operates directly on the vault filesystem.

```
claude-code  ──MCP──▶  carbide-vault-mcp  ──fs──▶  vault/
```

**What it would expose:**
- `vault.list(glob?)` — list notes
- `vault.read(path)` — read note content
- `vault.create(path, content)` — create note (with optional template expansion)
- `vault.modify(path, content)` — update note
- `vault.search(query)` — full-text search
- `vault.metadata(path)` — parse frontmatter/links/tags
- `template.list()` / `template.apply(name, context)` — use smart-templates
- `organize.by_tag()` / `organize.by_date()` — bulk file operations

**Pros:** Works headlessly, composable with Claude Code, no app dependency.
**Cons:** Bypasses Carbide's index — metadata cache, semantic features, and plugin state won't update until the app re-indexes. No editor interaction.

**Effort:** Medium. The vault is just markdown files on disk. Template expansion can reuse the Handlebars logic from the smart-templates plugin. The MCP server would be a ~300-line Node.js or Python script.

### Path B: In-App Action Runner Plugin

**Goal:** A plugin that accepts action definitions (JSON/YAML) and executes them as sequences of API calls.

```yaml
# .carbide/actions/daily-setup.yaml
name: Daily Setup
steps:
  - action: vault.create
    path: "journal/{{date 'YYYY-MM-DD'}}.md"
    template: daily-journal
  - action: vault.modify
    path: "index.md"
    append: "- [[journal/{{date 'YYYY-MM-DD'}}]]"
  - action: ui.showNotice
    message: "Daily note created"
```

**Pros:** Runs inside the app, has full API access, can use editor/UI features.
**Cons:** Still requires the app to be open. Action definitions are a new DSL to maintain. No external trigger.

**Effort:** Medium. Would need: YAML parser, template expansion in action params, sequential step runner, error handling.

### Path C: Hybrid — MCP Server + Plugin WebSocket Bridge

**Goal:** External automation that can also reach the app's live state.

```
claude-code ──MCP──▶ carbide-mcp-server ──ws──▶ bridge-plugin (in Carbide) ──postMessage──▶ host app
                          │
                          └──fs──▶ vault/  (for headless ops)
```

The MCP server handles filesystem ops directly and routes app-specific ops (editor, metadata, semantic search) through a WebSocket to a plugin running inside Carbide.

**Pros:** Best of both worlds. Full automation when app is closed (filesystem), full app integration when open (WebSocket bridge).
**Cons:** Most complex. Requires the plugin to act as a relay.

**Effort:** High. But most of it is plumbing.

### Path D: Filesystem-Only Automation (simplest)

**Goal:** Just operate on the vault as files. No Carbide integration.

This is what Claude Code can already do today — read/write markdown files, parse frontmatter, create notes from templates. The gap is just convenience tooling.

**What would help:**
- A `create-note` script that applies a template and writes to the right folder
- A `tag-notes` script that bulk-adds/removes frontmatter tags
- A `reorganize` script that moves files by metadata criteria
- Hook these into Claude Code via MCP or just call them as bash scripts

**Pros:** Zero Carbide dependency. Works now.
**Cons:** Carbide won't see changes until it re-indexes. No editor integration.

**Effort:** Low. A few shell/Python scripts.

---

## 4. Recommended Approach

**Start with Path D (filesystem scripts), then build toward Path A (MCP server).**

### Phase 1: Immediate (filesystem scripts)

Write a small Python module (or MCP server) that can:
1. Create notes from templates (reuse smart-templates syntax)
2. Parse/modify frontmatter
3. Search notes by content/tags/metadata
4. Bulk organize (move/rename by rules)

This works today, with zero changes to Carbide.

### Phase 2: MCP Server

Wrap Phase 1 in an MCP server so Claude Code can call it naturally:
```
User: "Create a meeting note for today's lab meeting"
Claude: [calls carbide-vault MCP tool] → creates note from template → done
```

### Phase 3: App Bridge (optional, only if needed)

If we need live app features (semantic search, editor manipulation), build a WebSocket bridge plugin. But this is likely unnecessary — most "action" use cases are vault-level, not editor-level.

---

## 5. Plugin Development Quick Reference

To create a new Carbide plugin:

```
.carbide/plugins/<plugin-id>/
  manifest.json    # permissions, commands, settings
  index.html       # runtime (sandboxed iframe)
```

**Minimal manifest:**
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "me",
  "description": "...",
  "api_version": "1",
  "permissions": ["commands:register", "fs:read", "fs:write", "ui:panel"],
  "activation_events": ["on_startup"]
}
```

**Enable in** `plugin_settings.json`:
```json
{ "my-plugin": { "enabled": true, "permissions": { "commands:register": true, "fs:read": true, "fs:write": true, "ui:panel": true } } }
```

**Available permissions:**
`editor:read`, `editor:modify`, `metadata:read`, `search:read`, `events:subscribe`, `commands:register`, `ui:panel`, `ui:statusbar`, `fs:read`, `fs:write`, `settings:register`, `export:save`

---

## 6. Key Observations

1. **The plugin API is capable but isolated.** Plugins can do a lot inside the app but can't be triggered externally.
2. **The vault is just markdown on disk.** Most automation doesn't need the app — filesystem access is sufficient.
3. **Smart-templates already solves note-from-template** inside the app. External automation just needs to replicate its Handlebars expansion.
4. **Semantic features are host-only.** No plugin API exposes embeddings, similarity, or the semantic graph. This is the main thing you'd lose going filesystem-only.
5. **No `contributes.slash_commands` API is documented** — the `slides` plugin declares them in its manifest, suggesting the host supports inline slash-command completion, but the mechanism isn't exposed in the plugin API docs.
