# Programmable Actions System — Research & Design

## Status: Phase 1 Complete, Remaining Phases Deferred | 2026-04-30

**Question:** Can a user (or external tool) programmatically trigger Carbide actions — e.g., create a note from a template, run an AI action, organize files via MCP/CLI?

---

## 1. What Exists Today

Carbide already has a deep, layered execution architecture. The pieces are all there — they just aren't fully connected to each other or to the outside world.

### 1.1 Action Registry (internal dispatch surface)

**`src/lib/app/action_registry/`**

Every triggerable behavior goes through `ActionRegistry`. ~420 named action IDs organized by namespace: `note.*`, `vault.*`, `folder.*`, `editor.*`, `tab.*`, `git.*`, `ai.*`, `search.*`, `omnibar.*`, `ui.*`, `theme.*`, `canvas.*`, `graph.*`, `bases.*`, `query.*`, `lint.*`, `lsp.*`, `task.*`, `daily_notes.*`, `document.*`, etc.

```typescript
class ActionRegistry {
  register(action: AppAction)        // { id, label, shortcut?, when?, execute }
  execute(id: string, ...args)       // dispatch by ID, respects when() guard
  get_all(): AppAction[]
  get_available(): AppAction[]       // filtered by when() predicate
}
```

Each feature registers its own actions via `register_<feature>_actions()`, wired together at boot in `register_actions()` → called from `create_app_context()`.

### 1.2 Command Palette (Omnibar)

**`src/lib/features/search/`**

~70 built-in commands mapped to action IDs via `COMMAND_TO_ACTION_ID`. Prefix `>` in the omnibar to enter command mode. Commands have `when()` guards for contextual availability and `keywords` for fuzzy matching.

Plugin commands merge into the same palette. When a plugin command is invoked:
```
omnibar → window.dispatchEvent("carbide:plugin-command") → PluginIframeHost → postMessage to iframe
```

### 1.3 Plugin System

**`src/lib/features/plugin/`** | Docs: `docs/plugin_howto.md`

Iframe-sandboxed, permission-gated, communicates via `postMessage` RPC. Full API surface:

| Capability | Permission | SDK |
|---|---|---|
| Read/write vault files | `fs:read`, `fs:write` | `carbide.vault.*` |
| Read/modify editor | `editor:read`, `editor:modify` | `carbide.editor.*` |
| Register commands | `commands:register` | `carbide.commands.register()` |
| Register slash commands | `commands:register` | RPC `commands.register_slash` |
| UI (sidebar, statusbar, ribbon, toasts) | `ui:panel`, `ui:statusbar` | `carbide.ui.*` |
| Subscribe to vault events | `events:subscribe` | `carbide.events.on()` |
| Full-text search | `search:read` | `carbide.search.fts()` |
| Metadata / property queries | `metadata:read` | `carbide.metadata.query()` |
| Run AI prompts | `ai:execute` | `carbide.ai.execute()` |
| HTTP requests (proxied) | `network:fetch` | `carbide.network.fetch()` |
| Push diagnostics | `diagnostics:write` | `carbide.diagnostics.push()` |
| Access MCP tools | `mcp:access` | RPC `mcp.list_tools / call_tool` |
| **Register MCP tools** | `mcp:register` | RPC `mcp.register_tool` |
| Save binary exports | `export:save` | RPC `export.save_binary` |
| **Execute app actions** | `actions:execute` | `carbide.actions.*` |

Activation events: `on_startup`, `on_command:<id>`, `on_file_open:<glob>`, `on_settings_open`.

### 1.4 Plugin Event Bus

**`src/lib/features/plugin/application/plugin_event_bus.ts`**

Pub/sub with debouncing (50ms), back-pressure (64 pending/plugin), and permission gating.

Events: `file-created`, `file-modified`, `file-deleted`, `file-renamed`, `active-file-changed`, `editor-selection-changed`, `vault-opened`, `layout-changed`, `note-indexed`, `metadata-changed`.

### 1.5 Reactor System

**`src/lib/reactors/`** — ~45 persistent `$effect.root()` observers that watch store changes and trigger side effects. Notable:

- `autosave.reactor` — save on edit debounce
- `git_autocommit.reactor` — auto-commit on save
- `plugin_lifecycle.reactor` — init/teardown plugins on vault open/close
- `mcp_autostart.reactor` — starts MCP server when vault opens

This is the internal automation backbone — hooks/triggers, but not exposed to plugins or externally.

### 1.6 MCP Server

**Frontend:** `src/lib/features/mcp/` | **Rust:** `src-tauri/src/features/mcp/`

Local HTTP MCP server (JSON-RPC, protocol `2024-11-05`), auto-started by reactor when enabled. Exposes ~16 tools:

| Tool | Category |
|---|---|
| `list_notes`, `read_note`, `create_note`, `update_note`, `delete_note` | CRUD |
| `search_notes`, `reindex` | Search |
| `get_note_metadata` | Metadata |
| `list_vaults` | Vault |
| `get_backlinks`, `get_outgoing_links`, `list_properties`, `query_notes_by_property` | Graph |
| `list_references`, `search_references` | References |
| `git_status`, `git_log`, `rename_note` | Git |

Setup utilities auto-configure Claude Desktop and Claude Code configs. Token auth in place.

**Plugin-registered MCP tools** (via `mcp:register` permission) are merged into the same server — plugins can extend what external agents see.

### 1.7 Smart Templates

**`plugins/smart-templates/`** — Bundled first-party plugin. Handlebars engine with context-aware variables (`current_note`, `selection`, `fileCache`, `backlinks`, `date`, `time`). Templates are markdown files with YAML frontmatter. Triggered via slash commands or command palette.

---

## 2. The Gaps

Despite the rich infrastructure, there are clear seams where the layers don't connect:

### ~~Gap 1: No plugin access to the action registry~~ ✅ Resolved (Phase 1)

~~Plugins cannot call `action_registry.execute("note.create")`.~~ Plugins now have full access via `carbide.actions.{list, available, execute}` with `actions:execute` permission. See Phase 1 below.

### Gap 2: No MCP access to the action registry

External agents (Claude Code, Claude Desktop) can CRUD notes via MCP, but cannot trigger any of the 420 UI/app actions. No "open this note," "run lint," "switch to graph view," "create daily note."

**Impact:** MCP is vault-level automation only, not app-level.

### Gap 3: No action composition or chaining

No way to define "when X happens, do Y then Z." The reactor system does this internally (e.g., autosave → auto-commit), but it's not exposed to plugins or users. There's no workflow engine, no action sequencing, no conditional logic.

**Impact:** Every action is a one-shot. Multi-step workflows require manual orchestration.

### Gap 4: No cross-plugin communication

Plugins can't invoke each other's commands or share data. Each plugin is an island. A "daily setup" plugin can't invoke smart-templates to create a note.

**Impact:** Plugin ecosystem can't compose.

### Gap 5: No AI-driven actions

Plugins can call `carbide.ai.execute()` for individual prompts, but there's no concept of a reusable, parameterized AI action — e.g., "organize these notes by topic," "summarize this folder into an index note," "tag all untagged notes based on content." These are multi-step operations that combine vault access + AI reasoning + vault mutations, and there's no framework for defining or invoking them.

**Impact:** The most powerful automation use cases (AI-powered vault operations) require building everything from scratch per-plugin, and can't be triggered externally via MCP/CLI.

---

## 3. Design: Programmable Actions

### 3.1 Principle

The action registry already exists and works. The design should be: **expose it, don't replace it.** Every new automation surface should dispatch through the same `ActionRegistry.execute()` path.

### 3.2 Layer Diagram

```
                          ┌─────────────────────────────┐
                          │     Action Registry          │
                          │   (420+ named actions)       │
                          └──────────┬──────────────────┘
                                     │ execute(id, ...args)
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
    ┌─────────▼──────┐    ┌─────────▼──────┐    ┌─────────▼──────┐
    │  Keyboard /    │    │  Plugin RPC    │    │  MCP Server    │
    │  Menu / UI     │    │  (new bridge)  │    │  (new bridge)  │
    │  (exists)      │    │                │    │                │
    └────────────────┘    └────────────────┘    └────────────────┘
                                                        ▲
                                                        │
                                                ┌───────┴────────┐
                                                │  Claude Code / │
                                                │  CLI / External│
                                                └────────────────┘
```

### 3.3 Proposed Changes

#### A. Plugin → Action Registry bridge

Add an `actions` RPC namespace to `PluginRpcHandler`:

```typescript
// New permission: "actions:execute"
carbide.actions.list()                    // → AppAction[] (id, label, shortcut)
carbide.actions.available()               // → filtered by when() guards
carbide.actions.execute(id, ...args)      // → dispatch through registry
```

This is the single highest-leverage change. Plugins can now orchestrate the entire app.

**Permission gating:** A new `actions:execute` permission. Consider an allowlist in the manifest so plugins declare which action namespaces they need (e.g., `"action_scopes": ["note.*", "editor.*"]`).

#### B. MCP → Action Registry bridge

Add an `execute_action` MCP tool:

```json
{
  "name": "execute_action",
  "description": "Execute a Carbide app action by ID",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action_id": { "type": "string", "description": "e.g. note.create, daily_notes.open_today" },
      "args": { "type": "array", "description": "Action arguments" }
    },
    "required": ["action_id"]
  }
}
```

Also add `list_actions` to let agents discover what's available. This requires routing the MCP call from the Rust backend through to the frontend's action registry via existing IPC.

**Consideration:** Some actions are UI-only (open dialog, focus editor). These make sense when the app is in the foreground but are meaningless headlessly. Tag actions with a `headless_safe` flag, and have the MCP tool filter or warn accordingly.

#### C. AI Actions Framework

The high-value use case: reusable, parameterized AI operations on the vault. Examples:

- **"Organize my inbox"** — read all notes in `inbox/`, use AI to classify by topic, move to appropriate folders, update links
- **"Tag untagged notes"** — find notes without tags, use AI to infer tags from content, write frontmatter
- **"Summarize folder into index"** — read all notes in a folder, AI-generate a summary index note with links
- **"Extract tasks"** — scan notes for action items, consolidate into a tasks note

These combine vault CRUD + AI reasoning + vault mutations in a loop. The building blocks already exist (`carbide.vault.*`, `carbide.ai.execute()`, `carbide.metadata.*`), but there's no framework for defining and invoking them.

**Proposed: AI Action definition**

```typescript
interface AIAction {
  id: string;
  label: string;
  description: string;
  // What the action needs from the user
  params: AIActionParam[];
  // The execution logic — a plugin function that uses vault + AI APIs
  execute: (params: Record<string, unknown>, context: ActionContext) => Promise<AIActionResult>;
}

interface AIActionParam {
  name: string;
  type: "string" | "path" | "folder" | "select";
  description: string;
  default?: unknown;
  options?: string[];  // for select type
}
```

**Registration:** Plugins register AI actions via `carbide.actions.registerAI(action)`. These show up in:
1. The command palette (with a param input step if needed)
2. The MCP server as callable tools (enabling Claude Code / Claude Desktop to invoke them)

**MCP exposure:** Each registered AI action becomes an MCP tool automatically:

```json
{
  "name": "ai_action:organize_inbox",
  "description": "Read all notes in a folder, classify by topic, move to subfolders",
  "inputSchema": {
    "properties": {
      "source_folder": { "type": "string", "default": "inbox/" }
    }
  }
}
```

This means an external agent can say: "call `ai_action:organize_inbox`" and the plugin handles the AI loop internally — reading notes, prompting the AI, writing results.

**Why plugin-hosted, not MCP-native:** The AI action runs inside the app where it has access to the full plugin API (metadata, search, editor, semantic features). An external MCP-only approach would be limited to filesystem-level operations and couldn't leverage the index, embeddings, or backlink graph.

#### D. Action Sequences (future, not MVP)

A declarative format for multi-step workflows:

```yaml
# .carbide/actions/daily-setup.yaml
name: Daily Setup
trigger: command  # or: on_startup, on_schedule, on_file_created
steps:
  - action: daily_notes.open_today
  - action: apply_template
    args:
      template_name: daily-journal
      output_path: "journal/{{date 'YYYY-MM-DD'}}.md"
  - action: ui.show_notice
    args: ["Daily note created"]
```

This builds on (A) and (B) — once actions are programmatically invokable, sequencing is straightforward. The action-runner plugin would be a simple loop over steps, calling `carbide.actions.execute()` for each.

**Not MVP.** This is valuable but the ROI comes from A/B/C first.

---

## 4. Implementation Plan

### Phase 1: Plugin → Action Registry ✅ Complete

1. ✅ Added `actions:execute` permission to the permission system (`plugin_permission_dialog.svelte`)
2. ✅ Added `PluginRpcActionsBackend` type and `handle_actions()` to `PluginRpcHandler` with `list`, `available`, `execute` methods
3. ✅ Exposed via `carbide.actions.*` in the plugin SDK (`carbide_plugin_api.js`)
4. ✅ Wired `ActionRegistry` into RPC context (`create_app_context.ts`)
5. ✅ 11 tests covering permission grants, denials, invalid args, backend errors (`plugin_rpc_actions.test.ts`)
6. ⏳ Scope-gate by action namespace in manifest (deferred — simple permission gate for now)

**Enables:** Plugins that orchestrate the full app. A "daily setup" plugin. A "project workspace" plugin that opens specific notes + graph + canvas on startup.

### Phase 2: MCP → Action Registry — Deferred

**Rationale:** External agents primarily need vault data, not UI control. The existing MCP server already provides comprehensive CRUD/search/metadata tools. Most of the 420 action registry entries are UI-bound (open dialog, focus editor, toggle sidebar) and meaningless to headless agents. The headless-safe subset largely overlaps with existing MCP tools. The engineering cost (Rust → Tauri IPC → frontend routing) isn't justified by the marginal gain. Revisit if plugin-registered actions (Phase 1) create demand for external invocation.

### Phase 2.5: AI Actions Framework — Deferred

**Rationale:** No plugin currently needs this. The API shape should emerge from a concrete use case rather than abstract design. When a plugin needs to expose a multi-step AI operation, build the framework around that real need.

### Phase 3: Cross-Plugin Communication — Deferred

**Rationale:** Only one first-party plugin exists (smart-templates). Build when a second plugin needs to call the first.

### Phase 4: Action Sequences — Deferred

**Rationale:** Coding agents (Claude Code, etc.) already do action sequencing natively via multi-step MCP calls with reasoning. A declarative YAML format adds a second, less flexible way to do the same thing.

---

## 5. Key Decisions to Make

| Decision | Options | Recommendation |
|---|---|---|
| Action scoping for plugins | Per-action allowlist vs. namespace wildcard | Namespace wildcard (`note.*`, `editor.*`) — simpler UX, adequate security for local-first app |
| MCP action execution | Frontend-routed (IPC) vs. Rust-native | Frontend-routed — actions live in the frontend, no point duplicating |
| AI action hosting | Plugin-side vs. MCP-native | Plugin-side — needs full API access (metadata, search, semantic features) |
| AI action MCP exposure | Auto-register as tools vs. explicit opt-in | Auto-register — every AI action should be externally callable by default |
| Action sequences format | YAML vs. JSON vs. JS | YAML — readable, declarative, no security concerns. JS only if scripting is explicitly requested later |
| Headless action behavior | Filter out UI actions vs. warn vs. no-op | Filter from `list_actions`, return error with reason from `execute_action` |

---

## 6. Relation to Existing Systems

- **Reactors** remain internal — they're infra, not user-facing automation. Action sequences would be the user-facing equivalent.
- **Event bus** stays as-is for plugin subscriptions. Action sequences could optionally trigger on events (Phase 4), but that's composition on top, not a replacement.
- **Omnibar** remains the primary UI entry point. Action sequences would register as omnibar commands.
- **MCP server** gains new tools but the protocol and auth stay the same.
