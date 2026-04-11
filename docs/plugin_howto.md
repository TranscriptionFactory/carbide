# Carbide Plugin How-To

## Quick Start

1. Create a folder at `<vault>/.carbide/plugins/<your-plugin-id>/`
2. Add a `manifest.json` (plugin metadata + permissions)
3. Add an `index.html` (plugin code, runs in a sandboxed iframe)
4. Open the plugin manager (sidebar > Blocks icon) and enable your plugin

---

## manifest.json

Every plugin needs a `manifest.json` in its folder:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "What your plugin does.",
  "api_version": "1",
  "permissions": ["editor:read", "commands:register"],
  "activation_events": ["on_startup"],
  "contributes": {
    "settings": [
      {
        "key": "some_option",
        "type": "string",
        "label": "Some Option",
        "description": "Configures something.",
        "default": "default value",
        "placeholder": "Enter a value..."
      },
      {
        "key": "api_key",
        "type": "textarea",
        "label": "API Key",
        "description": "Paste your key here.",
        "default": "",
        "placeholder": "sk-..."
      },
      {
        "key": "max_results",
        "type": "number",
        "label": "Max Results",
        "description": "Number of results to show.",
        "default": 10,
        "min": 1,
        "max": 100
      }
    ]
  }
}
```

### Required Fields

| Field         | Type       | Description                     |
| ------------- | ---------- | ------------------------------- |
| `id`          | `string`   | Unique plugin ID (kebab-case)   |
| `name`        | `string`   | Display name                    |
| `version`     | `string`   | Semver version                  |
| `author`      | `string`   | Author name                     |
| `description` | `string`   | Short description               |
| `api_version` | `string`   | Plugin API version (use `"1"`)  |
| `permissions` | `string[]` | Permissions the plugin requires |

### Optional Fields

| Field               | Type       | Description                                          |
| ------------------- | ---------- | ---------------------------------------------------- |
| `activation_events` | `string[]` | When the plugin loads. Default: `["on_startup"]`     |
| `contributes`       | `object`   | Static contributions (settings schema, ribbon icons) |

### Activation Events

- `"on_startup"` — load when vault opens (default)
- `"on_command:<id>"` — load when a specific command is invoked
- `"on_file_open:<glob>"` — load when a matching file is opened
- `"on_settings_open"` — load when user opens plugin settings

---

## Permissions

Declare all permissions your plugin needs in `manifest.json`. Users must approve them before the plugin activates.

| Permission          | Grants                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| `fs:read`           | Read files in the vault (`vault.read`, `vault.list`)                          |
| `fs:write`          | Create, modify, delete files (`vault.create`, `vault.modify`, `vault.delete`) |
| `editor:read`       | Read active editor content (`editor.get_value`, `editor.get_selection`)       |
| `editor:modify`     | Modify editor content (`editor.set_value`, `editor.replace_selection`)        |
| `commands:register` | Add commands to the command palette                                           |
| `ui:statusbar`      | Add/update status bar items                                                   |
| `ui:panel`          | Add sidebar panels                                                            |
| `ui:ribbon`         | Add ribbon icons                                                              |
| `events:subscribe`  | Receive vault/editor event notifications                                      |
| `metadata:read`     | Query bases, list properties, get backlinks, get note stats                   |
| `diagnostics:write` | Push/clear diagnostics for files                                              |
| `search:read`       | Full-text search and tag queries                                              |

`settings.get`, `settings.set`, `settings.get_all`, and `ui.show_notice` require no permission.

---

## TypeScript SDK

Instead of writing raw `postMessage` RPC calls, use the built-in SDK. Add this to your `index.html`:

```html
<script src="carbide-plugin-api.js"></script>
```

The SDK is served automatically — no file needed on disk. It exposes a global `carbide` object:

```js
// Lifecycle
carbide.onload(() => {
  /* plugin activated */
});
carbide.onunload(() => {
  /* plugin deactivating */
});

// Vault
await carbide.vault.read("path/to/note.md");
await carbide.vault.list();
await carbide.vault.create("new.md", "# Title");
await carbide.vault.modify("note.md", "updated content");
await carbide.vault.delete("note.md");

// Editor
const md = await carbide.editor.getValue();
const sel = await carbide.editor.getSelection();
await carbide.editor.replaceSelection("inserted text");

// Commands
await carbide.commands.register({ id: "do-thing", label: "Do Thing" });
await carbide.commands.remove("do-thing");

// UI
await carbide.ui.addStatusBarItem({
  id: "my-item",
  priority: 100,
  initial_text: "Ready",
});
await carbide.ui.updateStatusBarItem("my-item", "Updated");
await carbide.ui.addSidebarPanel({
  id: "my-panel",
  label: "My Panel",
  icon: "layout-dashboard",
});
await carbide.ui.showNotice("Done!", 3000);

// Search
const hits = await carbide.search.fts("query", 10);
const tags = await carbide.search.tags();

// Metadata
const results = await carbide.metadata.query({
  filters: [],
  sort: [],
  limit: 50,
  offset: 0,
});
const props = await carbide.metadata.listProperties();
const backlinks = await carbide.metadata.getBacklinks("note.md");
const stats = await carbide.metadata.getStats("note.md");

// Settings
const val = await carbide.settings.get("my_key");
await carbide.settings.set("my_key", "value");

// Events
const cbId = await carbide.events.on("file-created", (data) => {
  /* ... */
});
await carbide.events.off(cbId);

// Diagnostics
await carbide.diagnostics.push("file.md", [
  {
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
    message: "issue",
    severity: "warning",
  },
]);
await carbide.diagnostics.clear("file.md");
```

See `docs/example-plugins/latex-snippets/` for a complete example using the SDK.

---

## RPC API Reference

Plugins communicate with the host through `postMessage` RPC. Every call sends a JSON message to `window.parent` and receives a response. The SDK (above) wraps this — use it instead of raw RPC when possible.

### RPC Client Boilerplate

If you prefer not to use the SDK, paste this into your `index.html` `<script>` block:

```js
const rpc = {
  _pending: new Map(),
  send(method, ...params) {
    const id = crypto.randomUUID();
    window.parent.postMessage({ id, method, params }, "*");
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
    });
  },
  _handle(event) {
    const { id, result, error } = event.data;
    if (!id || !this._pending.has(id)) return;
    const { resolve, reject } = this._pending.get(id);
    this._pending.delete(id);
    if (error) reject(new Error(error));
    else resolve(result);
  },
};
window.addEventListener("message", (e) => rpc._handle(e));
```

### vault.\*

Requires `fs:read` and/or `fs:write`.

```js
// Read a note's markdown content
const content = await rpc.send("vault.read", "path/to/note.md");

// List all note paths in the vault
const paths = await rpc.send("vault.list");

// Create a new note (fs:write)
await rpc.send("vault.create", "path/to/new.md", "# Title\n\nContent");

// Overwrite a note (fs:write)
await rpc.send("vault.modify", "path/to/note.md", "new content");

// Delete a note (fs:write)
await rpc.send("vault.delete", "path/to/note.md");
```

### editor.\*

Requires `editor:read` and/or `editor:modify`. Only works when a note is open.

```js
// Get full markdown of active note
const markdown = await rpc.send("editor.get_value");

// Get selected text
const selection = await rpc.send("editor.get_selection");

// Replace entire note content (editor:modify)
await rpc.send("editor.set_value", "# Replaced\n\nNew content");

// Replace current selection with text (editor:modify)
await rpc.send("editor.replace_selection", "inserted text");
```

### commands.\*

Requires `commands:register`.

```js
// Register a command (appears in command palette)
await rpc.send("commands.register", {
  id: "do-thing", // becomes "<plugin-id>:do-thing"
  label: "Do the Thing",
  description: "Optional longer description",
  keywords: ["thing", "do"],
  icon: "sparkles", // Lucide icon name (optional)
});

// Remove a command
await rpc.send("commands.remove", "do-thing");
```

Commands are executed via pushed messages from the host:

```js
window.addEventListener("message", (event) => {
  if (event.data.method === "command.execute") {
    const command_id = event.data.params[0]; // e.g. "my-plugin:do-thing"
    // handle it
  }
});
```

### ui.\*

```js
// Status bar (ui:statusbar)
await rpc.send("ui.add_statusbar_item", {
  id: "my-item",
  priority: 100,
  initial_text: "Ready",
});
await rpc.send("ui.update_statusbar_item", "my-item", "Updated text");
await rpc.send("ui.remove_statusbar_item", "my-item");

// Sidebar panel (ui:panel)
await rpc.send("ui.add_sidebar_panel", {
  id: "my-panel",
  label: "My Panel",
  icon: "layout-dashboard",
});
await rpc.send("ui.remove_sidebar_panel", "my-panel");

// Ribbon icon (ui:ribbon) — triggers a command on click
await rpc.send("ui.add_ribbon_icon", {
  id: "my-icon",
  icon: "star",
  tooltip: "Do something",
  command: "do-thing", // references your registered command
});
await rpc.send("ui.remove_ribbon_icon", "my-icon");

// Toast notification (no permission required)
await rpc.send("ui.show_notice", { message: "Done!", duration: 3000 });
```

### settings.\*

No permission required (scoped to your plugin's own settings).

```js
// Get a single setting
const value = await rpc.send("settings.get", "some_option");

// Set a setting
await rpc.send("settings.set", "some_option", "new value");

// Get all settings for this plugin
const all = await rpc.send("settings.get_all");
```

### events.\*

Requires `events:subscribe`. Subscribe to vault/editor events pushed by the host.

```js
// Subscribe to an event
await rpc.send("events.on", "file-created", "my-callback-id");
await rpc.send("events.on", "active-file-changed", "file-switch-cb");

// Unsubscribe
await rpc.send("events.off", "my-callback-id");
```

Events arrive as pushed messages:

```js
window.addEventListener("message", (event) => {
  if (event.data.type === "event") {
    const { event: event_name, data, timestamp } = event.data;
    // handle event
  }
});
```

Available events:

| Event                      | Data                       |
| -------------------------- | -------------------------- |
| `file-created`             | `{ path }`                 |
| `file-modified`            | `{ path }`                 |
| `file-deleted`             | `{ path }`                 |
| `file-renamed`             | `{ old_path, new_path }`   |
| `active-file-changed`      | `{ path }`                 |
| `editor-selection-changed` | `{ selection }`            |
| `vault-opened`             | `{ vault_id, vault_path }` |
| `layout-changed`           | `{ active_tabs }`          |
| `note-indexed`             | `{ path }`                 |

### search.\*

Requires `search:read`.

```js
// Full-text search
const hits = await rpc.send("search.fts", "query string", 10);
// hits = [{ path: "note.md", score: 0.95 }, ...]

// List all tags (with counts)
const tags = await rpc.send("search.tags");
// tags = [{ tag: "project", count: 12 }, ...]

// Get notes for a specific tag
const notes = await rpc.send("search.tags", "project");
// notes = ["path/to/note.md", ...]
```

### metadata.\*

Requires `metadata:read`. Query the vault's indexed metadata without parsing files yourself.

```js
// Query notes by frontmatter properties (same as Bases query engine)
const results = await rpc.send("metadata.query", {
  filters: [{ property: "status", operator: "eq", value: "active" }],
  sort: [{ property: "title", descending: false }],
  limit: 50,
  offset: 0,
});
// results = { rows: [...], total: 123 }

// List all frontmatter properties across the vault
const props = await rpc.send("metadata.list_properties");
// props = [{ name: "status", property_type: "string", count: 45 }, ...]

// Get backlinks for a note
const backlinks = await rpc.send("metadata.get_backlinks", "path/to/note.md");
// backlinks = [{ path: "other-note.md" }, ...]

// Get stats for a note
const stats = await rpc.send("metadata.get_stats", "path/to/note.md");
// stats = { word_count, char_count, heading_count, outlink_count, reading_time_secs, last_indexed_at }
```

### diagnostics.\*

Requires `diagnostics:write`. Push code diagnostics (warnings, errors) for files.

```js
await rpc.send("diagnostics.push", "path/to/file.md", [
  {
    range: {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 10 },
    },
    message: "Broken link",
    severity: "warning",
  },
]);

// Clear diagnostics for a file (or all if no path)
await rpc.send("diagnostics.clear", "path/to/file.md");
```

---

## Lifecycle Messages

The host sends lifecycle messages to your iframe:

```js
window.addEventListener("message", (event) => {
  if (event.data.method === "lifecycle.activate") {
    // Plugin is being loaded — initialize
  }
  if (event.data.method === "lifecycle.deactivate") {
    // Plugin is being unloaded — clean up
  }
});
```

---

## Plugin Manager Controls

The plugin manager sidebar provides these controls per plugin:

- **Enable/Disable** — toggles the plugin on/off (persisted across sessions)
- **Load** (play icon) — loads an enabled-but-idle plugin
- **Unload** (stop icon) — unloads a running plugin without disabling it
- **Reload** (rotate icon) — unloads and re-loads, useful during development

---

## File Layout

```
<vault>/.carbide/plugins/<id>/
  manifest.json    — metadata, permissions, contributions
  index.html       — plugin entry point (runs in iframe)
  styles.css       — optional styles (for sidebar panels, etc.)
  assets/          — optional static files
```

All files are served via the `carbide-plugin://<id>/` URI scheme.

---

## Tips

- **IDs are namespaced.** When you register command `"do-thing"`, it becomes `"<plugin-id>:do-thing"` in the host. Command execution messages use the full namespaced ID.
- **No ambient network access.** The iframe sandbox blocks `fetch`, `XMLHttpRequest`, and WebSocket. Network access requires `network:fetch` (not yet implemented).
- **Settings in manifest.** Declare `contributes.settings` in your manifest to let users configure your plugin. Read them at runtime via `settings.get`. Available setting types: `"string"`, `"number"`, `"boolean"`, `"select"`, `"textarea"`. Optional fields: `placeholder` (hint text for string/number/textarea), `min`/`max` (numeric bounds — values are clamped on save), `options` (for select type).
- **Event backpressure.** The host queues up to 64 events per plugin. High-frequency events like `editor-selection-changed` are debounced (50ms).
- **RPC timeouts.** Every RPC call has a timeout. Most calls time out after 5 seconds; filesystem-heavy vault calls (`vault.read`, `vault.list`, `vault.create`, `vault.modify`, `vault.delete`) get 30 seconds. If a call exceeds its timeout, the host rejects it with `RpcTimeoutError`. Design your plugin to handle timeout rejections gracefully.
- **RPC rate limiting.** Each plugin is limited to 100 RPC calls per minute (sliding window). Exceeding the limit rejects calls with a rate-limit error until the window advances. Batch your operations where possible to stay within the budget.
- **Error auto-disable.** The host tracks errors in two ways: burst-based (5+ errors in 15 seconds → auto-disable) and consecutive (10 consecutive RPC errors without a success → auto-disable). A successful RPC call resets the consecutive counter. If your plugin is auto-disabled, fix the issue and re-enable it from the plugin manager.
- **Console debugging.** Your plugin runs in a hidden iframe. Use the browser devtools (Tauri's webview inspector) to see `console.log` output from your plugin.
