# Markdown Linting & Formatting Support

> Status: **Draft**
> Priority: Editor Polish & Power Features

---

## Problem

Carbide is a markdown-first knowledge-work app, but has zero awareness of markdown quality. Users writing notes encounter:

1. **Inconsistent formatting** — mixed heading styles (ATX vs setext), inconsistent list markers, trailing whitespace, irregular blank lines. No enforcement of a canonical style.
2. **Structural errors** — skipped heading levels (h1 → h3), duplicate H1s, broken link syntax, unclosed code fences. These silently degrade the ProseMirror parse, search indexing, and export quality.
3. **No feedback loop** — users discover problems only when the rendered output looks wrong. There's no inline, real-time signal that something is off.
4. **No format-on-save** — every other content type in modern editors auto-formats. Markdown in Carbide does not.

Other vault-based apps (Obsidian via community plugins, Zed via LSP) have addressed this. Carbide should ship it as a first-party, integrated feature — not an afterthought plugin.

## Solution

Integrate **rumdl** (Rust-based markdown linter + formatter, 71 rules, built-in LSP, autofix) as the linting/formatting engine. Expose lint diagnostics inline in both source and WYSIWYG editors, and offer format-on-save with configurable rules.

### Why rumdl

| Criterion         | rumdl                              | markdownlint (JS)           | quickmark              | dprint-plugin-markdown |
| ----------------- | ---------------------------------- | --------------------------- | ---------------------- | ---------------------- |
| Language          | Rust                               | JS                          | Rust                   | Rust                   |
| Rules             | 71                                 | 60+                         | 50+                    | 0 (formatter only)     |
| Autofix           | Yes (`fmt` + `check --fix`)        | Yes (via `fixInfo`)         | No                     | Yes                    |
| LSP server        | Built-in (`rumdl server`)          | Separate (markdownlint-lsp) | Built-in               | No                     |
| Config format     | TOML                               | JSON/YAML                   | TOML                   | JSON                   |
| Markdown flavors  | GFM, MkDocs, MDX, Quarto           | CommonMark + GFM            | CommonMark + GFM       | CommonMark             |
| Performance       | ~8x faster than JS on large vaults | Baseline                    | ~8x faster             | N/A                    |
| Library embedding | No (binary-first)                  | Yes                         | Yes (`quickmark-core`) | Yes                    |

**Decision: CLI/LSP integration over library embedding.** rumdl has the broadest rule set, active maintenance, autofix, and a built-in LSP — but no public library API. We integrate via subprocess (CLI for batch ops, LSP for real-time editor diagnostics). This is the same pattern VS Code uses for all linters, and avoids coupling our Rust build to rumdl's internals.

**Rejected alternatives:**

- **quickmark-core as library**: Fewer rules (50 vs 71), no autofix, less mature. Library embedding is nice but not worth the rule gap.
- **dprint-plugin-markdown**: Formatter only, no linting rules. Would need to pair with a separate linter anyway.
- **markdownlint (JS)**: Would require bundling Node or a JS runtime. Contradicts our Rust-first, single-binary architecture.
- **Custom rules on comrak/pulldown-cmark**: High effort to replicate 71 rules. Not justified when a mature tool exists.
- **WASM embedding of rumdl**: rumdl doesn't publish a WASM target. Would require forking.

## Architecture

### Integration Strategy

Two integration modes, serving different use cases:

```
┌──────────────────────────────────────────────────────┐
│                    Carbide App                        │
│                                                      │
│  ┌─────────────┐    ┌───────────────────────────┐    │
│  │ Source Editor│◄──►│  rumdl LSP client          │    │
│  │ (CodeMirror) │    │  (real-time diagnostics,  │    │
│  └─────────────┘    │   code actions, format)    │    │
│                     └───────────┬───────────────┘    │
│  ┌─────────────┐               │                     │
│  │ WYSIWYG     │◄─── diagnostic overlay              │
│  │ (ProseMirror)│    (mapped to source positions)     │
│  └─────────────┘               │                     │
│                     ┌──────────▼───────────────┐     │
│  ┌─────────────┐    │  Rust Lint Service        │     │
│  │ Settings UI │───►│  (Tauri feature module)   │     │
│  └─────────────┘    │  - manages rumdl process  │     │
│                     │  - LSP client protocol     │     │
│                     │  - CLI batch operations    │     │
│                     └──────────┬───────────────┘     │
│                                │                     │
└────────────────────────────────┼─────────────────────┘
                                 │
                      ┌──────────▼───────────────┐
                      │  rumdl binary             │
                      │  (bundled in resources)   │
                      │  - `rumdl server` (LSP)   │
                      │  - `rumdl check` (batch)  │
                      │  - `rumdl fmt` (format)   │
                      └──────────────────────────┘
```

### Decision: LSP for real-time, CLI for batch

- **LSP mode** (`rumdl server`): Long-running process, started on vault open. Provides real-time diagnostics as the user types, code actions for quick fixes, and document formatting. The Tauri backend acts as the LSP client.
- **CLI mode** (`rumdl check`, `rumdl fmt`): For vault-wide operations — lint all files, format all files, CI integration. Invoked on-demand via Tauri commands.

This separation keeps the editor responsive (LSP is incremental) while supporting batch workflows.

### Layer Placement (per architecture.md decision tree)

| Component          | Layer      | Rationale                                                                                                          |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `LintPort`         | Port       | IO contract for lint operations (process management, LSP communication)                                            |
| `LintTauriAdapter` | Adapter    | Spawns rumdl process, implements LSP client protocol, invokes CLI                                                  |
| `LintStore`        | Store      | Holds diagnostics per-file, lint status, configuration state                                                       |
| `LintService`      | Service    | Orchestrates: start/stop LSP, request diagnostics, apply fixes, format                                             |
| `LintReactor`      | Reactor    | Watches `EditorStore` active file changes → triggers lint; watches `SettingsStore` → restarts LSP on config change |
| `lint_actions`     | Actions    | `LINT_FILE`, `LINT_VAULT`, `FORMAT_FILE`, `FORMAT_VAULT`, `FIX_DIAGNOSTIC`, `TOGGLE_LINT`                          |
| Diagnostic UI      | Components | Gutter markers, inline underlines, status bar count, problems panel                                                |

### Rust Backend

The Tauri backend manages the rumdl process lifecycle and acts as an LSP client. This keeps process management native (proper signal handling, resource cleanup) and avoids the frontend needing to speak LSP directly.

```
src-tauri/src/features/lint/
├── mod.rs              # Module registration
├── service.rs          # Process lifecycle, LSP client, CLI invocation
├── commands.rs         # Tauri commands exposed to frontend
└── config.rs           # rumdl config generation/management
```

## Implementation

### Phase 1: Backend — rumdl Process Management

**New feature module:** `src-tauri/src/features/lint/`

#### `service.rs` — Core Process Management

Responsibilities:

- Spawn `rumdl server` as a child process with stdio pipes
- Implement LSP client protocol (JSON-RPC over stdin/stdout) for: `initialize`, `textDocument/didOpen`, `textDocument/didChange`, `textDocument/didSave`, `textDocument/didClose`, `textDocument/publishDiagnostics` (notification handler), `textDocument/formatting`, `textDocument/codeAction`
- Spawn `rumdl check` / `rumdl fmt` for batch operations
- Graceful shutdown on vault close / app exit
- Auto-restart on crash (max 3 retries, then degrade gracefully)

State managed via Tauri:

```rust
pub struct LintServiceState {
    inner: Mutex<Option<LintServiceInner>>,
}

struct LintServiceInner {
    child: Child,
    stdin: ChildStdin,
    pending_requests: HashMap<u64, oneshot::Sender<Value>>,
    next_id: u64,
}
```

#### `commands.rs` — Tauri Commands

| Command             | Args                               | Returns                                     |
| ------------------- | ---------------------------------- | ------------------------------------------- |
| `lint_start`        | `vault_id, vault_path`             | `()` — starts LSP server for vault          |
| `lint_stop`         | `vault_id`                         | `()` — stops LSP server                     |
| `lint_open_file`    | `vault_id, path, content`          | `()` — sends `didOpen`                      |
| `lint_update_file`  | `vault_id, path, content, version` | `()` — sends `didChange`                    |
| `lint_close_file`   | `vault_id, path`                   | `()` — sends `didClose`                     |
| `lint_format_file`  | `vault_id, path`                   | `Vec<TextEdit>` — formatting edits          |
| `lint_fix_all`      | `vault_id, path`                   | `String` — fixed content                    |
| `lint_check_vault`  | `vault_path`                       | `Vec<FileDiagnostics>` — batch lint results |
| `lint_format_vault` | `vault_path`                       | `Vec<String>` — list of formatted files     |
| `lint_get_status`   | `vault_id`                         | `LintStatus` — running, stopped, error      |

Diagnostics are pushed from the LSP server to the frontend via Tauri events (`lint_diagnostics`), not pulled via commands. This matches the LSP push model.

#### `config.rs` — Configuration Management

Generates `.rumdl.toml` in the vault root based on Carbide's lint settings. This lets rumdl pick up vault-specific config naturally.

Default config tuned for Obsidian-flavored markdown:

```toml
[global]
markdown_flavor = "gfm"

[rules]
# Relax rules that conflict with Obsidian conventions
MD013 = false          # Line length — vault notes are free-form
MD033 = false          # Inline HTML — needed for callouts, embeds
MD041 = false          # First line heading — frontmatter comes first
MD024 = { siblings_only = true }  # Duplicate headings OK in different sections

# Enable useful structural checks
MD001 = true           # Heading increment
MD003 = { style = "atx" }  # Consistent heading style
MD004 = { style = "dash" } # Consistent list marker
MD009 = true           # Trailing spaces
MD010 = true           # Hard tabs
MD012 = true           # Multiple blank lines
MD018 = true           # Missing space after #
MD019 = true           # Multiple spaces after #
MD022 = true           # Blank lines around headings
MD023 = true           # Headings must start at BOL
MD025 = true           # Single H1
MD032 = true           # Blank lines around lists
MD034 = true           # Bare URLs
MD037 = true           # Spaces inside emphasis
MD038 = true           # Spaces inside code spans
MD039 = true           # Spaces inside link text
MD040 = true           # Fenced code language
MD046 = { style = "fenced" }  # Code block style
MD047 = true           # File ends with newline
MD049 = { style = "underscore" }  # Emphasis style
MD050 = { style = "underscore" }  # Strong style
```

### Phase 2: Frontend — Lint Feature Module

**New feature module:** `src/lib/features/lint/`

```
src/lib/features/lint/
├── index.ts                  # Public API
├── ports.ts                  # LintPort interface
├── adapters/
│   └── lint_tauri_adapter.ts # Tauri IPC implementation
├── stores/
│   └── lint_store.svelte.ts  # Reactive lint state
├── services/
│   └── lint_service.ts       # Orchestration
├── actions/
│   └── lint_actions.ts       # Action registry entries
├── domain/
│   └── types.ts              # Diagnostic types, severity, etc.
└── ui/
    ├── diagnostic_gutter.svelte      # Source editor gutter markers
    ├── diagnostic_underline.svelte   # Inline squiggly underlines
    ├── lint_status_indicator.svelte  # Status bar widget
    └── problems_panel.svelte         # Full diagnostics list panel
```

#### `domain/types.ts`

```typescript
type LintDiagnostic = {
  rule: string; // e.g., "MD001"
  message: string;
  severity: "error" | "warning" | "info";
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  fix_available: boolean;
};

type FileDiagnostics = {
  path: string;
  diagnostics: LintDiagnostic[];
};

type LintStatus = "running" | "stopped" | "error" | "disabled";

type LintConfig = {
  enabled: boolean;
  format_on_save: boolean;
  show_inline: boolean;
  severity_filter: ("error" | "warning" | "info")[];
  rules: Record<string, boolean | Record<string, unknown>>;
};
```

#### `stores/lint_store.svelte.ts`

```typescript
class LintStore {
    // Per-file diagnostics, keyed by relative path
    diagnostics_by_file = $state<Map<string, LintDiagnostic[]>>(new Map());

    // Currently active file's diagnostics (derived)
    active_diagnostics = $derived<LintDiagnostic[]>(...);

    // Aggregate counts
    error_count = $derived<number>(...);
    warning_count = $derived<number>(...);

    // Service status
    status = $state<LintStatus>("stopped");

    // User configuration
    config = $state<LintConfig>({
        enabled: true,
        format_on_save: false,
        show_inline: true,
        severity_filter: ["error", "warning"],
        rules: {},
    });
}
```

#### `services/lint_service.ts`

Key methods:

- `start_linting(vault_id, vault_path)` — invokes `lint_start` command, subscribes to `lint_diagnostics` events
- `stop_linting(vault_id)` — invokes `lint_stop`, clears diagnostics
- `notify_file_opened(path, content)` — sends `didOpen` to LSP
- `notify_file_changed(path, content, version)` — sends `didChange` to LSP (debounced 300ms)
- `notify_file_closed(path)` — sends `didClose` to LSP
- `format_file(path)` — requests formatting, applies edits to editor
- `fix_diagnostic(path, diagnostic)` — requests code action, applies fix
- `lint_vault()` — batch lint via CLI, populates store
- `format_vault()` — batch format via CLI
- `update_config(config)` — writes `.rumdl.toml`, restarts LSP if needed

#### `actions/lint_actions.ts`

| Action ID              | Trigger                   | Behavior                                    |
| ---------------------- | ------------------------- | ------------------------------------------- |
| `lint.toggle`          | Command palette, settings | Enable/disable linting                      |
| `lint.format_file`     | `Cmd+Shift+F`, save hook  | Format current file                         |
| `lint.format_vault`    | Command palette           | Format all markdown files                   |
| `lint.fix_all`         | Command palette           | Auto-fix all fixable issues in current file |
| `lint.next_diagnostic` | `F8`                      | Jump to next diagnostic                     |
| `lint.prev_diagnostic` | `Shift+F8`                | Jump to previous diagnostic                 |
| `lint.toggle_problems` | `Cmd+Shift+M`             | Toggle problems panel                       |

#### Reactor: `lint.reactor.svelte.ts`

Watches:

1. **`EditorStore.active_file`** → calls `notify_file_opened` / `notify_file_closed` on tab switches
2. **`EditorStore.content`** → debounced `notify_file_changed` on edits (source mode only; WYSIWYG serializes to markdown first)
3. **`SettingsStore.lint`** → restarts LSP when config changes
4. **`VaultStore.active_vault`** → starts/stops LSP on vault open/close
5. **`EditorStore.save` event** → triggers `format_file` if `format_on_save` is enabled

### Phase 3: Source Editor Integration (CodeMirror)

The source editor (`source_editor_content.svelte`) uses CodeMirror. Lint diagnostics map directly to CM's diagnostic API.

#### Gutter Markers

CodeMirror's `lintGutter()` extension displays icons in the gutter. We create a custom `lint` extension that:

1. Subscribes to `LintStore.active_diagnostics`
2. Maps `LintDiagnostic[]` → CM `Diagnostic[]` (line/col → CM position offsets)
3. Feeds them to CM's `setDiagnostics()` dispatch

#### Inline Underlines

CM's built-in lint extension renders squiggly underlines. Severity maps to:

- `error` → red underline
- `warning` → yellow underline
- `info` → blue underline (dimmed)

#### Quick Fix on Hover

CM's lint tooltip shows the rule message on hover. We extend it with a "Fix" action button that invokes `lint_service.fix_diagnostic()`.

#### Format on Keybind

`Cmd+Shift+F` in source mode calls `lint_service.format_file()`, which:

1. Sends `textDocument/formatting` to LSP
2. Receives `TextEdit[]`
3. Applies edits to the CM document via `view.dispatch({ changes })`

### Phase 4: WYSIWYG Editor Integration (ProseMirror)

WYSIWYG integration is more nuanced because ProseMirror operates on a document tree, not raw text. The strategy:

1. **Lint the serialized markdown** — when the user is in WYSIWYG mode, the reactor serializes the ProseMirror doc to markdown (via existing `markdown_pipeline.ts`) and sends it to the LSP as a virtual document.
2. **Map diagnostics back to PM positions** — use the serializer's source map (line/col → PM position) to place decorations. This requires extending `markdown_pipeline.ts` to emit a position map during serialization.
3. **Display as ProseMirror decorations** — inline decorations (underline CSS class) on the affected PM nodes. A PM plugin reads `LintStore.active_diagnostics` and creates decoration sets.
4. **Quick fixes** — apply the text edit to the serialized markdown, then re-parse into PM. This is heavier than CM edits but maintains the WYSIWYG abstraction.

**Simplification for v1:** Only show diagnostic counts in the status bar during WYSIWYG mode. Full inline decorations are Phase 4b, gated on the source-map work.

### Phase 5: Settings UI

Add a "Linting & Formatting" section to the settings panel:

| Setting                     | Type         | Default           | Description                      |
| --------------------------- | ------------ | ----------------- | -------------------------------- |
| Enable linting              | Toggle       | On                | Master switch                    |
| Format on save              | Toggle       | Off               | Auto-format when saving          |
| Show inline diagnostics     | Toggle       | On                | Underlines in source editor      |
| Severity filter             | Multi-select | Error, Warning    | Which severities to display      |
| Heading style               | Select       | ATX (`#`)         | ATX or setext                    |
| List marker                 | Select       | Dash (`-`)        | Dash, asterisk, or plus          |
| Emphasis style              | Select       | Underscore (`_`)  | Underscore or asterisk           |
| Strong style                | Select       | Underscore (`__`) | Underscore or asterisk           |
| Max heading level skip      | Toggle       | On                | Warn on h1 → h3                  |
| Require code fence language | Toggle       | On                | Warn on bare ``` blocks          |
| Advanced rules              | JSON editor  | `{}`              | Override any rumdl rule directly |

Changes write to vault settings (per-vault) and regenerate `.rumdl.toml`.

### Phase 6: Status Bar & Problems Panel

#### Status Bar Widget

Added to `editor_status_bar.svelte`:

- Shows: `⚠ 3  ✕ 1` (warning count, error count) or `✓` when clean
- Click opens the problems panel
- Tooltip shows lint status (running/stopped/error)

#### Problems Panel

A bottom panel (similar to VS Code's problems panel):

- List of all diagnostics for the current file, grouped by severity
- Each entry shows: rule ID, message, line number
- Click navigates to the diagnostic location in the editor
- "Fix" button on fixable diagnostics
- "Fix All" button in the toolbar
- Filter by severity, search by rule ID or message

## Files to Create

| File                                                    | Purpose                                             |
| ------------------------------------------------------- | --------------------------------------------------- |
| `src-tauri/src/features/lint/mod.rs`                    | Module registration                                 |
| `src-tauri/src/features/lint/service.rs`                | rumdl process lifecycle, LSP client, CLI invocation |
| `src-tauri/src/features/lint/commands.rs`               | Tauri commands                                      |
| `src-tauri/src/features/lint/config.rs`                 | `.rumdl.toml` generation from settings              |
| `src/lib/features/lint/index.ts`                        | Public API surface                                  |
| `src/lib/features/lint/ports.ts`                        | `LintPort` interface                                |
| `src/lib/features/lint/adapters/lint_tauri_adapter.ts`  | Tauri IPC adapter                                   |
| `src/lib/features/lint/stores/lint_store.svelte.ts`     | Reactive diagnostic state                           |
| `src/lib/features/lint/services/lint_service.ts`        | Orchestration logic                                 |
| `src/lib/features/lint/actions/lint_actions.ts`         | Action registry entries                             |
| `src/lib/features/lint/domain/types.ts`                 | Diagnostic types                                    |
| `src/lib/features/lint/ui/diagnostic_gutter.svelte`     | CM gutter extension wrapper                         |
| `src/lib/features/lint/ui/lint_status_indicator.svelte` | Status bar widget                                   |
| `src/lib/features/lint/ui/problems_panel.svelte`        | Full diagnostics panel                              |
| `src/lib/reactors/lint.reactor.svelte.ts`               | Store observation → service calls                   |
| `tests/unit/stores/lint/lint_store.test.ts`             | Store unit tests                                    |
| `tests/unit/services/lint/lint_service.test.ts`         | Service unit tests                                  |
| `tests/unit/adapters/lint/lint_tauri_adapter.test.ts`   | Adapter tests                                       |

## Files to Modify

| File                                                      | Change                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src-tauri/src/features/mod.rs`                           | Add `pub mod lint;`                                                                 |
| `src-tauri/src/app/mod.rs`                                | Register `LintServiceState`, add lint commands to `invoke_handler`                  |
| `src-tauri/Cargo.toml`                                    | Add `tokio` process/IO features if not present (for async child process management) |
| `src-tauri/tauri.conf.json`                               | Bundle `rumdl` binary in resources                                                  |
| `src/lib/features/editor/ui/editor_status_bar.svelte`     | Add lint status indicator                                                           |
| `src/lib/features/editor/ui/source_editor_content.svelte` | Wire CM lint extension                                                              |
| `src/lib/features/settings/`                              | Add lint settings section                                                           |
| `src/lib/app/action_registry.ts`                          | Register lint actions                                                               |
| `src/lib/app/bootstrap.ts`                                | Initialize lint feature module                                                      |
| `src/lib/reactors/index.ts`                               | Register lint reactor                                                               |
| `package.json`                                            | Add `pnpm lint:md` script for CLI usage                                             |

## Dependencies

### Bundled Binary

| Resource                  | Size    | Source                                               |
| ------------------------- | ------- | ---------------------------------------------------- |
| `rumdl` (platform binary) | ~5-10MB | Built from source or downloaded from GitHub releases |

Platform variants needed:

- `rumdl-aarch64-apple-darwin` (macOS ARM)
- `rumdl-x86_64-apple-darwin` (macOS Intel)
- `rumdl-x86_64-unknown-linux-gnu` (Linux)
- `rumdl-x86_64-pc-windows-msvc.exe` (Windows)

Bundled via Tauri's `bundle.resources` with platform-specific sidecar configuration (`tauri.conf.json` `bundle.externalBin`).

### No New Cargo Dependencies

The Rust backend only needs `tokio`'s process and IO features (likely already present for other async work) to manage the child process and stdio pipes. The LSP client is a thin JSON-RPC layer over stdin/stdout — no LSP crate needed for the subset we use.

### No New npm Dependencies

CodeMirror's `@codemirror/lint` package provides the diagnostic gutter, underlines, and tooltip infrastructure. Check if already in the dependency tree (likely via the existing CM setup).

## Edge Cases & Invariants

| Edge Case                             | Handling                                                                                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **rumdl binary not found**            | Log error, set status to `"error"`, degrade gracefully (no lint, no format). Show user-facing notification with install instructions.                                      |
| **LSP server crashes**                | Auto-restart up to 3 times with exponential backoff (1s, 2s, 4s). After 3 failures, set status to `"error"` and stop retrying until user manually re-enables.              |
| **Large file (>100KB)**               | Skip real-time linting (too slow for didChange). Lint only on save. Format on explicit request only.                                                                       |
| **Binary file opened**                | Don't send to LSP. Only `.md` files are linted.                                                                                                                            |
| **Vault with no .md files**           | LSP starts but receives no documents. No diagnostics. Status shows "running".                                                                                              |
| **Concurrent vault switches**         | Stop LSP for old vault before starting for new vault. Pending requests are dropped.                                                                                        |
| **Format conflicts with ProseMirror** | Format only in source mode. In WYSIWYG mode, format the serialized markdown and re-parse. If the round-trip changes PM structure unexpectedly, reject the format and warn. |
| **User edits .rumdl.toml manually**   | rumdl's LSP picks up config changes via file watching. No action needed from our side.                                                                                     |
| **Obsidian callout syntax**           | Disabled MD033 (inline HTML) by default. Callout `> [!note]` syntax is valid blockquote.                                                                                   |
| **Wiki-link syntax `[[...]]`**        | rumdl's GFM mode should handle this. If not, disable MD042 (no empty links) and test.                                                                                      |
| **Frontmatter (YAML)**                | rumdl supports frontmatter detection (MD041 disabled by default). Verify it skips YAML blocks correctly.                                                                   |
| **Format-on-save race condition**     | Debounce: if a save triggers while format is in-flight, queue the save and re-format after. Don't format twice.                                                            |

### Invariants

1. Lint diagnostics in the store are always for the current file version. Stale diagnostics from previous edits are cleared on each `didChange` response.
2. The LSP process is always in one of: not started, running, restarting, or permanently failed. Never in an ambiguous state.
3. Format operations are atomic from the user's perspective — either the full format applies or nothing changes.
4. Lint configuration is per-vault. Global defaults are applied when no vault-level config exists.
5. The feature degrades gracefully at every level: no binary → no lint; LSP crash → no real-time but CLI still works; large file → lint on save only.

## Test Scenarios (BDD-style)

### Process Management

**Scenario: LSP server starts on vault open**

- Given linting is enabled in settings and rumdl binary exists in resources
- When the user opens a vault
- Then `rumdl server` starts, status transitions to "running", and the LSP handshake completes

**Scenario: LSP server stops on vault close**

- Given the LSP server is running for a vault
- When the user closes the vault
- Then the server process is killed, status transitions to "stopped", and all diagnostics are cleared

**Scenario: LSP server auto-restarts on crash**

- Given the LSP server is running
- When the server process exits unexpectedly
- Then it restarts within 1 second, and pending file state (open documents) is re-sent

**Scenario: Graceful degradation when binary missing**

- Given the rumdl binary is not found in resources
- When the user opens a vault with linting enabled
- Then status is set to "error", a notification is shown, and all lint actions are no-ops

### Real-time Diagnostics

**Scenario: Diagnostics appear as user types**

- Given a file is open in source editor with linting enabled
- When the user types `## ` directly after an H1 (skipping H2)
- Then within 500ms, a warning diagnostic appears for MD001 (heading increment)

**Scenario: Diagnostics clear when issue is fixed**

- Given a diagnostic is shown for trailing whitespace (MD009)
- When the user removes the trailing whitespace
- Then the diagnostic disappears on the next didChange cycle

**Scenario: Diagnostics update on file switch**

- Given file A has 3 warnings and file B has 0 warnings
- When the user switches from file A to file B
- Then the diagnostic display shows 0 warnings (file A's diagnostics are preserved in store but not displayed)

### Formatting

**Scenario: Format on save normalizes file**

- Given format-on-save is enabled and a file has inconsistent list markers
- When the user saves the file
- Then list markers are normalized to the configured style before the file is written to disk

**Scenario: Format preserves frontmatter**

- Given a file has YAML frontmatter with custom properties
- When the user formats the file
- Then frontmatter content and order are preserved exactly

**Scenario: Format file via keybind**

- Given the user is in source editor mode
- When they press `Cmd+Shift+F`
- Then the file is formatted in-place, cursor position is preserved, and the change is a single undo step

### Batch Operations

**Scenario: Lint entire vault**

- Given a vault with 200 markdown files
- When the user runs "Lint Vault" from the command palette
- Then all files are checked, results appear in the problems panel grouped by file, and a summary notification shows total errors/warnings

**Scenario: Format entire vault**

- Given a vault with inconsistently formatted files
- When the user runs "Format Vault" from the command palette
- Then all files are formatted, a confirmation dialog shows the list of changed files, and the operation is reversible via git

### Settings

**Scenario: Changing heading style updates config and restarts LSP**

- Given the user changes heading style from ATX to setext in settings
- When the setting is saved
- Then `.rumdl.toml` is regenerated, the LSP server restarts with new config, and existing files are re-linted

**Scenario: Disabling linting stops the server**

- Given linting is enabled and the LSP server is running
- When the user toggles linting off
- Then the LSP server stops, all diagnostics are cleared, and gutter markers disappear

## Performance Targets

| Metric                                     | Target | Basis                                                  |
| ------------------------------------------ | ------ | ------------------------------------------------------ |
| LSP startup                                | <500ms | rumdl server starts fast; no model loading             |
| Single file lint (didChange → diagnostics) | <100ms | rumdl benchmarks show sub-100ms for typical files      |
| Format single file                         | <50ms  | Formatting is simpler than full lint                   |
| Batch lint 1000 files                      | <5s    | rumdl benchmarks: 478 files in ~1s                     |
| Batch format 1000 files                    | <10s   | Includes file I/O                                      |
| Memory (LSP server)                        | <50MB  | Typical for a Rust CLI tool                            |
| Diagnostic rendering (CM)                  | <16ms  | Must not drop frames; CM's lint extension is efficient |

## Phased Delivery

| Phase  | Scope                                                                           | Effort |
| ------ | ------------------------------------------------------------------------------- | ------ |
| **1**  | Rust backend: process management, LSP client, CLI commands, config generation   | Medium |
| **2**  | Frontend feature module: port, adapter, store, service, actions, reactor        | Medium |
| **3**  | Source editor integration: CM lint extension, gutter, underlines, quick fix     | Medium |
| **4a** | Status bar widget, problems panel                                               | Small  |
| **4b** | WYSIWYG diagnostic overlay (requires source-map work in `markdown_pipeline.ts`) | Large  |
| **5**  | Settings UI, per-vault config, advanced rules editor                            | Small  |
| **6**  | Batch operations: lint vault, format vault, CI script                           | Small  |

Phases 1–3 deliver the core value (real-time lint + format in source editor). Phase 4a adds discoverability. Phase 4b is optional and can be deferred. Phase 5-6 are polish.

## Open Questions

1. **rumdl binary distribution**: Build from source in CI, or download pre-built releases? Pre-built is simpler but adds a download step. Building from source ensures version pinning but adds CI time.
2. **Wiki-link compatibility**: Does rumdl's GFM mode handle `[[wiki-links]]` without false positives? Needs testing. May need to disable specific rules or contribute upstream.
3. **Format-on-save in WYSIWYG mode**: Should formatting apply to the serialized markdown transparently, or should it be source-mode only? Transparent formatting risks unexpected ProseMirror tree changes.
4. **Plugin API surface**: Should lint configuration be exposed via the plugin system's contribution points? This would let plugins register custom rules or override defaults.
