# LSP Refactor & Markdown Oxide Integration Plan

**Date**: 2026-04-13
**Status**: Draft
**Scope**: Rust backend refactor + Markdown Oxide provider + .moxide.toml generation

---

## Problem

Adding a new LSP provider (Markdown Oxide, Harper, etc.) currently requires duplicating significant Rust boilerplate. Three separate features (`markdown_lsp`, `code_lsp`, `lint/lsp`) each reimplement the same plumbing: URI parsing, percent decoding, diagnostic parsing, notification/status forwarding. `markdown_lsp/service.rs` is a ~1600-line monolith mixing generic LSP wrappers with IWE-specific config management.

The frontend side is already well-structured (ports/adapters/stores, provider-agnostic editor plugins).

## Goals

1. Extract shared Rust LSP utilities so adding a new provider is ~50 lines of provider-specific code
2. Add Markdown Oxide as a third markdown LSP provider with fallback chain: IWE → Markdown Oxide → Marksman
3. Auto-generate `.moxide.toml` from vault settings
4. Set up the pattern so Harper (grammar LSP) can be added with minimal friction later

---

## Phase 1: Rust Backend Refactor

### 1.1 — Extract `shared/lsp_client/utils.rs`

Move duplicated utilities into the shared LSP client module.

**Functions to consolidate:**

| Function | Current locations | Target |
|---|---|---|
| `percent_decode()` | `markdown_lsp/service.rs`, `code_lsp/manager.rs`, `lint/lsp.rs` (3 copies) | `shared/lsp_client/utils.rs` |
| `uri_to_path()` / `uri_to_relative_path()` | `markdown_lsp/service.rs`, `code_lsp/manager.rs` | `shared/lsp_client/utils.rs` — unify into `uri_to_path(uri) -> PathBuf` and `uri_to_relative_path(uri, root) -> String` |
| `file_uri()` | `markdown_lsp/service.rs`, `code_lsp/manager.rs` | `shared/lsp_client/utils.rs` |
| `hex_val()` | `code_lsp/manager.rs`, `lint/lsp.rs` | `shared/lsp_client/utils.rs` (used by `percent_decode`) |
| `lsp_severity_to_string()` | `markdown_lsp/service.rs` | `shared/lsp_client/utils.rs` — generalize to return an enum |

**IWE workaround note**: `uri_to_path` in markdown_lsp has a double-prefix fix for IWE (`file:///vault/file:///vault/note.md`). Keep that as an IWE-specific wrapper that calls the shared `uri_to_path` after normalizing.

### 1.2 — Extract `shared/lsp_client/diagnostics.rs`

Create a shared diagnostic parser and a generic `LspDiagnostic` type.

```rust
// shared/lsp_client/diagnostics.rs
pub struct LspDiagnostic {
    pub start_line: u32,
    pub start_character: u32,
    pub end_line: u32,
    pub end_character: u32,
    pub severity: LspSeverity,
    pub message: String,
    pub source: Option<String>,
    pub code: Option<String>,
}

pub enum LspSeverity { Error, Warning, Info, Hint }

pub fn parse_publish_diagnostics(params: &serde_json::Value) -> Option<(String, Vec<LspDiagnostic>)>
```

Feature modules map `LspDiagnostic` → their domain types (`MarkdownLspDiagnostic`, `CodeDiagnostic`) via `From` impls if the types differ, or adopt the shared type directly.

**Line indexing note**: `markdown_lsp` uses 0-based lines (matching LSP spec), `code_lsp` adds +1 for 1-based. The shared parser should preserve LSP's 0-based convention; consumers adjust if needed.

### 1.3 — Extract `shared/lsp_client/event_forwarding.rs`

Generic notification/status forwarding parameterized by event name and parser.

```rust
pub fn spawn_notification_forwarder<F, E>(
    app: AppHandle,
    event_name: &'static str,
    rx: mpsc::Receiver<ServerNotification>,
    handler: F,
) where
    F: Fn(&str, &str, &serde_json::Value) -> Option<E> + Send + 'static,
    E: serde::Serialize + Clone,

pub fn spawn_status_forwarder<F, E>(
    app: AppHandle,
    event_name: &'static str,
    rx: mpsc::Receiver<LspSessionStatus>,
    mapper: F,
) where
    F: Fn(LspSessionStatus) -> E + Send + 'static,
    E: serde::Serialize + Clone,
```

This eliminates the copy-paste pattern where each LSP feature spawns its own tokio tasks with near-identical logic.

### 1.4 — Split `markdown_lsp/service.rs` (~1600 lines → 3-4 files)

| New file | Contents | ~Lines |
|---|---|---|
| `markdown_lsp/service.rs` | Tauri commands, startup/stop, state management | ~400 |
| `markdown_lsp/iwe_config.rs` | `ensure_iwe_config`, `iwe_config_rewrite_provider`, `rewrite_iwe_config`, TOML manipulation, `MANAGED_TRANSFORMS` | ~350 |
| `markdown_lsp/workspace_edit.rs` | `apply_workspace_edit`, `apply_text_document_edit`, `apply_create_file`, `apply_rename_file`, line/col offset helpers | ~250 |
| `markdown_lsp/lsp_commands.rs` | Generic LSP command wrappers (hover, references, definition, completion, etc.) that take a `RestartableLspClient` reference | ~300 |

The workspace edit application logic (`apply_workspace_edit` and friends) could arguably move to `shared/lsp_client/` since it's not markdown-specific, but that's a follow-up opportunity — it's only used by markdown_lsp today.

---

## Phase 2: Markdown Oxide Provider

### 2.1 — Rust: Provider enum & resolution

**`src-tauri/src/features/markdown_lsp/types.rs`**:
```rust
pub enum MarkdownLspProvider {
    Iwes,
    MarkdownOxide,
    Marksman,
}

impl MarkdownLspProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Iwes => "iwes",
            Self::MarkdownOxide => "markdown_oxide",
            Self::Marksman => "marksman",
        }
    }

    pub fn completion_trigger_characters(self) -> Vec<String> {
        match self {
            Self::Iwes => vec!["+", "[", "("],
            Self::MarkdownOxide => vec!["[", " ", "(", "#", ">"],
            Self::Marksman => vec!["[", "(", "#"],
        }
    }
}
```

**`src-tauri/src/features/markdown_lsp/provider.rs`** — Updated fallback chain:

```
IWE requested:
  1. Resolve iwes binary → if fail → try markdown-oxide → if fail → marksman
  2. Preflight IWE startup → if fail → try markdown-oxide → if fail → marksman

markdown_oxide requested:
  1. Resolve markdown-oxide binary → if fail → marksman

marksman requested:
  1. Resolve marksman binary → error if fail
```

New arm in `resolve_markdown_lsp_startup`:
```rust
"markdown_oxide" => {
    match toolchain::resolver::resolve(app, "markdown-oxide", custom_ref).await {
        Ok(path) => Ok(MarkdownLspStartupResolution {
            effective_provider: MarkdownLspProvider::MarkdownOxide,
            binary_path: path,
        }),
        Err(error) => {
            log::warn!("Markdown LSP requested_provider=markdown_oxide effective_provider=marksman reason=binary_resolution_failed error={}", error);
            let marksman_path = toolchain::resolver::resolve(app, "marksman", None).await?;
            Ok(MarkdownLspStartupResolution {
                effective_provider: MarkdownLspProvider::Marksman,
                binary_path: marksman_path,
            })
        }
    }
}
```

For the IWE fallback chain, update both error paths (binary resolution failed + preflight failed) to try `markdown-oxide` before `marksman`:
```rust
// In IWE error paths, replace direct marksman fallback with:
match toolchain::resolver::resolve(app, "markdown-oxide", None).await {
    Ok(path) => {
        log::info!("Falling back to markdown-oxide");
        Ok(MarkdownLspStartupResolution {
            effective_provider: MarkdownLspProvider::MarkdownOxide,
            binary_path: path,
        })
    }
    Err(_) => {
        let marksman_path = toolchain::resolver::resolve(app, "marksman", None).await?;
        Ok(MarkdownLspStartupResolution {
            effective_provider: MarkdownLspProvider::Marksman,
            binary_path: marksman_path,
        })
    }
}
```

### 2.2 — Toolchain resolver

Register `"markdown-oxide"` binary name. The binary is installed as `markdown-oxide` (via `brew install markdown-oxide` or `cargo install`).

Need to check: how does `toolchain::resolver::resolve` discover binaries? If it searches PATH, no additional config needed. If it has a registry, add `"markdown-oxide"` to it.

### 2.3 — TypeScript: Types & capabilities

**`src/lib/features/markdown_lsp/types.ts`**:
```typescript
export type MarkdownLspProvider = "iwes" | "markdown_oxide" | "marksman";

export function markdown_lsp_capabilities(provider: MarkdownLspProvider): MarkdownLspCapabilities {
  switch (provider) {
    case "iwes":
      return { inlay_hints: true, formatting: true, transform_actions: true };
    case "markdown_oxide":
      return { inlay_hints: true, formatting: false, transform_actions: false };
    case "marksman":
      return { inlay_hints: false, formatting: false, transform_actions: false };
  }
}
```

**`src/lib/shared/types/editor_settings.ts`**:
```typescript
export type MarkdownLspProvider = "iwes" | "markdown_oxide" | "marksman";
// default remains "iwes"
```

### 2.4 — Reactor update

**`src/lib/reactors/markdown_lsp_lifecycle.reactor.svelte.ts`**:

Line 58 — Deferred start logic: Markdown Oxide doesn't need deferred start (only IWE does):
```typescript
const should_defer_iwe_start = provider === "iwes" && !open_note_path;
// No change needed — markdown_oxide and marksman already don't match this condition
```

Line 86-94 — IWE provider config: Already guarded by `provider !== "iwes"`, so markdown_oxide correctly gets `undefined`.

Line 97 — Startup reason: Currently hardcodes `"iwes"` check. Update:
```typescript
const startup_reason = provider === "iwes" ? "lazy_open_note" : "initial_start";
// This already works correctly for markdown_oxide
```

### 2.5 — Settings UI

Add "Markdown Oxide" as a third option in the provider selector dropdown. Need to locate the settings component that renders `markdown_lsp_provider`.

---

## Phase 3: `.moxide.toml` Generation

### 3.1 — Config structure

Markdown Oxide reads settings from `.moxide.toml` at vault root. Key fields:

```toml
dailynote = "%Y-%m-%d"
daily_notes_folder = "/absolute/path/to/daily"
heading_completions = true
```

### 3.2 — Rust: Config generation

New file: **`src-tauri/src/features/markdown_lsp/moxide_config.rs`**

```rust
pub struct MoxideConfig {
    pub daily_notes_folder: Option<String>,
    pub daily_note_format: Option<String>,
}

pub async fn ensure_moxide_config(vault_path: &Path, config: &MoxideConfig) -> Result<(), String>
```

Logic:
1. Check if `.moxide.toml` exists at vault root
2. If not, generate from vault settings
3. If exists, update managed fields (with `# managed by carbide` markers) — same pattern as IWE config management but much simpler (Markdown Oxide's config is ~5 fields vs IWE's complex TOML)

### 3.3 — Integration point

Call `ensure_moxide_config` in `markdown_lsp_start` when `effective_provider == MarkdownOxide`, similar to how `ensure_iwe_config` is called for IWE.

Map vault settings to Markdown Oxide config:
- `vault.daily_notes_folder` → `daily_notes_folder` (resolve to absolute path)
- `vault.daily_note_format` → `dailynote` (date format string)

### 3.4 — Vault settings prerequisites

Check what daily note settings already exist in the vault config. If the settings don't exist yet, Markdown Oxide will use its defaults (which may not match the user's Obsidian setup). We may need to surface these settings in the vault settings UI.

---

## File Inventory

### Files modified (Phase 1 — Refactor)

| File | Change |
|---|---|
| `src-tauri/src/shared/lsp_client/mod.rs` | Add `pub mod utils; pub mod diagnostics; pub mod event_forwarding;` |
| `src-tauri/src/shared/lsp_client/utils.rs` | **New** — `percent_decode`, `hex_val`, `uri_to_path`, `uri_to_relative_path`, `file_uri`, `LspSeverity` |
| `src-tauri/src/shared/lsp_client/diagnostics.rs` | **New** — `LspDiagnostic`, `parse_publish_diagnostics` |
| `src-tauri/src/shared/lsp_client/event_forwarding.rs` | **New** — generic `spawn_notification_forwarder`, `spawn_status_forwarder` |
| `src-tauri/src/features/markdown_lsp/service.rs` | Remove duplicated functions, import from shared, split into sub-modules |
| `src-tauri/src/features/markdown_lsp/iwe_config.rs` | **New** — extracted IWE config management |
| `src-tauri/src/features/markdown_lsp/workspace_edit.rs` | **New** — extracted workspace edit application |
| `src-tauri/src/features/markdown_lsp/mod.rs` | Add new sub-modules |
| `src-tauri/src/features/code_lsp/manager.rs` | Remove duplicated functions, import from shared |
| `src-tauri/src/features/lint/lsp.rs` | Remove duplicated functions, import from shared |

### Files modified (Phase 2 — Markdown Oxide)

| File | Change |
|---|---|
| `src-tauri/src/features/markdown_lsp/types.rs` | Add `MarkdownOxide` variant, `as_str`, `completion_trigger_characters` |
| `src-tauri/src/features/markdown_lsp/provider.rs` | Add `"markdown_oxide"` arm, update IWE fallback chain |
| `src/lib/features/markdown_lsp/types.ts` | Add `"markdown_oxide"` to union, add capabilities case |
| `src/lib/shared/types/editor_settings.ts` | Add `"markdown_oxide"` to `MarkdownLspProvider` type |
| Settings UI component (TBD — locate) | Add dropdown option |

### Files added (Phase 3 — .moxide.toml)

| File | Purpose |
|---|---|
| `src-tauri/src/features/markdown_lsp/moxide_config.rs` | Config generation & management |

---

## Risks & Open Questions

1. **Toolchain resolver**: Need to verify how `toolchain::resolver::resolve` works — does it search PATH, use a bundled binary registry, or download on demand? This determines whether users need `markdown-oxide` pre-installed or if Carbide can auto-install it.

2. **LSP initialization args**: Markdown Oxide may need specific initialization options or `workspace/configuration` responses. Need to check if the current generic `LspClient` init handles this or if provider-specific init logic is needed.

3. **Semantic tokens**: Markdown Oxide supports semantic tokens (syntax highlighting via LSP). The current markdown_lsp port doesn't expose this. Could be a follow-up feature but worth noting — it's a differentiator from Marksman.

4. **Code lens**: Markdown Oxide supports code lens (inline reference counts). Also not in the current port. Follow-up opportunity.

5. **Daily note settings**: Need to verify what vault settings already exist for daily notes before wiring up `.moxide.toml` generation.

6. **Workspace edit compatibility**: Markdown Oxide's rename operations produce workspace edits. The existing `apply_workspace_edit` should handle this, but verify the edit format matches.

---

## Execution Order

1. Phase 1 (refactor) — prerequisite, do first
2. Phase 2 (Markdown Oxide provider) — depends on Phase 1
3. Phase 3 (.moxide.toml) — can partially parallel Phase 2

Estimated touch: ~15 files modified, ~4 new files, ~200 lines of net-new code after deduplication savings.
