# Generalized Toolchain Manager — Unbundle Sidecars, Add On-Demand Download

## Context

Badgerly currently has two external tool integrations with inconsistent strategies:

- **rumdl** (markdown linter) — bundled as a Tauri sidecar via `externalBin`, downloaded at build time by `scripts/download_rumdl.sh`, has its own duplicated `LspClient` (445 lines in `lint/lsp.rs`)
- **IWE** (writing engine) — NOT bundled, expected on PATH or user-configured `iwe_binary_path`, uses the shared `LspClient` from `shared/lsp_client/`

This creates problems: adding a third tool means duplicating all the wiring, tool updates are coupled to app releases (rumdl) or require manual PATH setup (IWE), and there's 350+ lines of duplicated LSP protocol code.

**Goal**: Unbundle both tools, introduce a generic toolchain manager with auto-download on first use, and consolidate the LSP infrastructure.

## Decisions

- **Unbundle both** — tools download on demand at runtime, decoupling tool versions from app releases
- **Auto-download on first use** — progress toast, user can configure/disable in settings
- **Static Rust registry** — compile-time `ToolSpec` array with baked-in checksums, sufficient for 2-5 known tools
- **Consolidate lint's LspClient** — refactor to use shared `LspClient` + new `RestartableLspClient` wrapper

---

## Phase 1: Toolchain Feature Module (Backend) ✅ DONE

> **Status**: Implemented 2026-03-23. All files created, registered in app, cargo check + pnpm check + tests pass.
>
> **Implementation notes**:
>
> - Added dependencies: `reqwest` (rustls-tls), `sha2`, `flate2`, `tar`, `zip`
> - SHA256 checksums are `"TODO"` placeholders — verification is skipped when `"TODO"`, enforced otherwise
> - `which` fallback uses `std::process::Command` (sync) — acceptable since it's only called when downloaded binary isn't found
> - `toolchain_resolve` command triggers auto-download if tool not found (on-demand install)
> - `toolchain_list_tools` probes actual resolution status per tool (not just cached state)
> - Archive extraction finds binary by filename match inside tar.gz/zip (handles nested dirs)

Create `src-tauri/src/features/toolchain/` with:

### `types.rs` — Data types

```
ToolSpec { id, display_name, github_repo, version, platform_binaries: [(triple, asset_template, sha256)], binary_name, default_args }
ToolStatus { NotInstalled | Downloading(progress) | Installed { version, path } | Error(msg) }
ToolInfo { spec fields + current status }
```

### `registry.rs` — Static tool definitions

- `TOOLS: &[ToolSpec]` — compile-time array with rumdl and iwes entries
- `fn get(id: &str) -> Option<&ToolSpec>`
- Platform triples: `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu`, `x86_64-pc-windows-msvc`
- SHA256 checksums compiled in per platform per tool

### `resolver.rs` — Binary path resolution

- Resolution order: (1) user-configured custom path from vault settings, (2) downloaded binary in `$APP_DATA/toolchain/<id>/<version>/<binary>`, (3) PATH lookup via `which`
- `async fn resolve(id: &str, custom_path: Option<&str>) -> Result<PathBuf, ToolNotFound>`
- Replaces `resolve_sidecar_path()` in lint and `binary_path` plumbing in IWE

### `downloader.rs` — Runtime download with progress

- Constructs GitHub release asset URL from `ToolSpec` template
- Downloads to temp file, streams progress via `app.emit("toolchain_event", DownloadProgress { id, percent })`
- Verifies SHA256
- Extracts archive (tar.gz / zip) → `$APP_DATA/toolchain/<id>/<version>/<binary>`
- Sets executable permissions on unix
- Use `reqwest` (already a dependency) for HTTP

### `service.rs` — Tauri state and commands

- `ToolchainState` — `HashMap<String, ToolStatus>` behind `Mutex`
- Commands:
  - `toolchain_list_tools() -> Vec<ToolInfo>`
  - `toolchain_install(tool_id) -> Result<()>` — triggers download
  - `toolchain_uninstall(tool_id) -> Result<()>` — removes downloaded binary
  - `toolchain_resolve(tool_id) -> Result<String>` — resolves path (triggers auto-download if not installed)
- Events: `toolchain_event` with `DownloadProgress`, `InstallComplete`, `InstallFailed` variants

### Files to create

- `src-tauri/src/features/toolchain/mod.rs`
- `src-tauri/src/features/toolchain/types.rs`
- `src-tauri/src/features/toolchain/registry.rs`
- `src-tauri/src/features/toolchain/resolver.rs`
- `src-tauri/src/features/toolchain/downloader.rs`
- `src-tauri/src/features/toolchain/service.rs`

### Files to modify

- `src-tauri/src/features/mod.rs` — add `pub mod toolchain;`
- `src-tauri/src/app/mod.rs` — `.manage(features::toolchain::service::ToolchainState::default())` and register commands in `invoke_handler`

---

## Phase 2: RestartableLspClient Wrapper (Shared) ✅ DONE

> **Status**: Implemented 2026-03-23. All files created, registered in shared module, cargo check + pnpm check + tests pass.
>
> **Implementation notes**:
>
> - `RestartableConfig` wraps `LspClientConfig` + max_restarts (default 3) + backoff_ms (default [1s, 2s, 4s])
> - `LspSessionStatus` enum: Starting, Running, Restarting { attempt }, Stopped, Failed { message }
> - No `AppHandle` dependency — status delivered via `mpsc::Receiver<LspSessionStatus>` (consumer calls `take_status_rx()`)
> - Notification forwarding via `mpsc::Receiver<ServerNotification>` (consumer calls `take_notification_rx()`)
> - Inner `LspClient` owned directly in the run loop (no Arc — requests processed sequentially in select, matching lint's existing pattern)
> - On process death: notification_rx closure detected → triggers restart with backoff
> - On explicit stop: inner client `stop()` called for graceful LSP shutdown/exit
> - Same API surface as `LspClient` (`send_request`, `send_notification`, `is_alive`, `stop`) — drop-in replacement for consumers

Add to `src-tauri/src/shared/lsp_client/`:

### `restartable.rs` — Wraps `LspClient` with auto-restart

- `RestartableLspClient` struct holding config + notification forwarder + status channel
- `start()` — spawns background run loop that manages `LspClient` lifecycle
- On process death: retry up to `max_restarts` times with exponential backoff (1s, 2s, 4s)
- Status delivered via channel (starting, running, restarting, stopped, failed)
- `stop()` — graceful shutdown
- `send_request()` / `send_notification()` — delegates to inner client, returns error if not running

### Files to create

- `src-tauri/src/shared/lsp_client/restartable.rs`

### Files to modify

- `src-tauri/src/shared/lsp_client/mod.rs` — add `pub mod restartable;` and re-export `RestartableLspClient`, `RestartableConfig`, `LspSessionStatus`

---

## Phase 3: Refactor Lint to Use Shared Infrastructure ✅ DONE

> **Status**: Implemented 2026-03-23. Lint refactored, all checks pass (cargo check, pnpm check, 2162 tests).
>
> **Implementation notes**:
>
> - `lint/lsp.rs`: 690 → 270 lines. Removed duplicated `LspClient`, `LspOutgoing`, `lsp_run_loop`, `spawn_lsp_process`, `lsp_initialize`, `lsp_shutdown`, `write_lsp_*`, `read_lsp_message`, `dispatch_message`, `resolve_sidecar_path`. Replaced with `LintLspSession` wrapping `RestartableLspClient`
> - `LintLspSession::start()` accepts resolved `binary_path: PathBuf` — resolution done in `service.rs` via `toolchain::resolver::resolve(&app, "rumdl", None)`
> - Notification forwarding: spawns task that filters `textDocument/publishDiagnostics` from `RestartableLspClient`'s notification channel
> - Status forwarding: spawns task that maps `LspSessionStatus` → `LintStatus` and emits `lint_event`
> - `lint/cli.rs`: removed `resolve_sidecar_path` dependency. CLI functions now accept `binary: &Path` parameter; call sites in `mod.rs` resolve via toolchain
> - `lint/mod.rs`: added `AppHandle` to `lint_format_file`, `lint_check_vault`, `lint_format_vault` commands (Tauri injects automatically, no frontend changes needed)
> - All lint-specific logic preserved: diagnostic parsing, config generation, CLI fallback for formatting, code action handling

Replace lint's duplicated `LspClient` with the shared `RestartableLspClient` + toolchain resolver.

### `src-tauri/src/features/lint/lsp.rs` — rewrite (~270 lines)

- `LintLspSession` struct wrapping `RestartableLspClient`
- `start()`: receives resolved binary path, builds `LspClientConfig` with rumdl-specific args (`["server"]`, `--config`, `--no-config`), starts `RestartableLspClient`
- Notification forwarding task: filters `textDocument/publishDiagnostics`, parses into `LintDiagnostic`, emits `lint_event`
- Status forwarding task: maps `LspSessionStatus` → `LintStatus`, emits `lint_event`
- Removed: `resolve_sidecar_path()`, `lsp_run_loop()`, `spawn_lsp_process()`, `lsp_initialize()`, custom `LspClient` struct, `LspOutgoing` enum — all replaced by shared infrastructure

### `src-tauri/src/features/lint/service.rs`

- `VaultLintSession` stores `LintLspSession` instead of the old `LspClient`
- `start_session` resolves binary via `toolchain::resolver::resolve(&app, "rumdl", None)`

### `src-tauri/src/features/lint/cli.rs`

- CLI functions accept `binary: &Path` instead of calling `resolve_sidecar_path` internally
- Call sites in `mod.rs` resolve via toolchain

### Key: preserve all lint-specific logic

- Diagnostic parsing, event emission, config file generation, CLI fallback for batch ops — all stays
- Only the LSP transport/lifecycle layer is replaced

---

## Phase 4: Refactor IWE to Use Toolchain Resolver ✅ DONE

> **Status**: Implemented 2026-03-23. All checks pass (cargo check, pnpm check, 2162 tests).
>
> **Implementation notes**:
>
> - `iwe_start` Rust command: removed `binary_path: String` param, now calls `toolchain::resolver::resolve(&app, "iwes", None)`
> - Frontend: removed `binary_path` from `IwePort.start()`, adapter, and service — no longer reads `editor_settings.iwe_binary_path` at start time
> - `iwe_binary_path` setting still exists in EditorSettings type (removal deferred to Phase 5 when Tools settings panel replaces it)
> - `IweState.binary_paths` HashMap retained for CLI binary derivation (`iwes` → `iwe`)
> - IWE still uses bare `LspClient` (not `RestartableLspClient`) — auto-restart is already handled in the frontend service layer. Can optionally migrate later
> - Test assertions updated to match new `start(vault_id)` signature

### `src-tauri/src/features/iwe/service.rs`

- Removed `binary_path: String` parameter from `iwe_start` command
- Calls `toolchain::resolve("iwes")` internally
- All IWE-specific LSP feature logic unchanged

### Frontend changes

- `src/lib/features/iwe/ports.ts` — removed `binary_path` from `start()` signature
- `src/lib/features/iwe/adapters/iwe_tauri_adapter.ts` — removed `binaryPath` from invoke params
- `src/lib/features/iwe/application/iwe_service.ts` — removed `editor_settings.iwe_binary_path` usage

---

## Phase 5: Frontend Toolchain Feature ✅ DONE

> **Status**: Implemented 2026-03-23. Feature module created, wired into DI, all checks pass (cargo check, pnpm check, 2162 tests).
>
> **Implementation notes**:
>
> - Created 7 files in `src/lib/features/toolchain/`: types, ports, adapter, store, service, actions, index
> - Wired into DI: added to `Ports` type, `create_app_stores`, `create_app_context`, `create_prod_ports`, test ports
> - `ToolchainStore` uses `$state(new Map())` with new-Map-on-update pattern for Svelte 5 reactivity
> - `ToolchainService` subscribes to `toolchain_event` in constructor, routes progress/complete/failed to store
> - Actions: `toolchain.install` (takes tool_id arg) and `toolchain.manage` (opens settings)
>
> **Post-review fixes (2026-03-23)**:
>
> - Added `"toolchain"` to `SettingsCategory` union type — was missing, causing `toolchain_manage` action to silently fail
> - Added "Tools" category (WrenchIcon) to settings dialog nav + toolchain settings panel with IWE enable/binary path controls
> - Moved IWE settings from "Misc" category to new "Tools" category; updated description from "bundled version" to "auto-download"
> - Created `toolchain_lifecycle.reactor.svelte.ts` — watches for vault open, calls `toolchain_service.load()` to populate tool list
> - Wired reactor into `ReactorContext` and `mount_reactors` — `toolchain_service` now passed through DI to reactors

### New feature: `src/lib/features/toolchain/`

```
src/lib/features/toolchain/
├── index.ts
├── ports.ts                         -- ToolchainPort interface
├── types.ts                         -- ToolInfo, ToolStatus, ToolchainEvent
├── state/
│   └── toolchain_store.svelte.ts    -- reactive Map<tool_id, ToolStatus>
├── application/
│   ├── toolchain_service.ts         -- orchestrates install/uninstall/resolve
│   └── toolchain_actions.ts         -- command registry entries
├── adapters/
│   └── toolchain_tauri_adapter.ts   -- IPC bridge to Rust commands
└── ui/
    └── toolchain_settings.svelte    -- settings panel component
```

### Settings integration ✅ DONE

- Added `"toolchain"` to `SettingsCategory` type in `editor_settings.ts`
- Added "Tools" nav entry (WrenchIcon) in `settings_dialog.svelte` categories array
- Added toolchain settings panel with IWE enable toggle and binary path override input
- Moved IWE settings out of "Misc" into "Tools" category
- `iwe_binary_path` setting retained in `EditorSettings` type for backward compatibility

### Toolchain lifecycle reactor ✅ DONE

- `toolchain_lifecycle.reactor.svelte.ts` — on vault open, calls `toolchain_service.load()` to populate tool list
- Resets on vault close so load fires again for new vaults
- Auto-download of missing tools happens server-side via `toolchain_resolve` (called by lint/IWE on start)

### DI wiring ✅ DONE

- `create_app_context.ts` — instantiates `ToolchainService`, registers actions, passes to `mount_reactors`
- `ReactorContext` type includes `toolchain_service: ToolchainService`
- Event listener wired in `ToolchainService` constructor via `subscribe_events`

---

## Phase 6: Build Pipeline Cleanup ✅ DONE

> **Status**: Implemented 2026-03-23. Sidecar removed from build pipeline, all checks pass.
>
> **Implementation notes**:
>
> - `tauri.conf.json`: removed `externalBin` array, removed `pnpm sidecar &&` from beforeDevCommand/beforeBuildCommand
> - `release.yml`: removed "Download sidecar binary" step from publish job, removed "Stub external binary for build" step from generate-bindings job
> - `package.json`: kept `sidecar` script for dev convenience (optional pre-download)
> - `scripts/download_rumdl.sh`: kept for dev convenience

### Remove bundled sidecar

- `src-tauri/tauri.conf.json` — removed `"externalBin": ["binaries/rumdl"]`
- `src-tauri/tauri.conf.json` — removed `pnpm sidecar &&` from `beforeDevCommand` and `beforeBuildCommand`
- `.github/workflows/release.yml` — removed sidecar download steps from CI publish job, removed stub step from generate-bindings job

### Keep for dev convenience

- `package.json` `"sidecar"` script — kept for optional pre-download
- `scripts/download_rumdl.sh` — kept; no longer required for builds

---

## Verification

1. **Build without sidecar**: `pnpm tauri build` succeeds without rumdl binary present
2. **First-run auto-download**: Open a vault → rumdl and IWE auto-download with progress toast → lint and IWE features activate
3. **Custom binary path**: Set a custom path in Tools settings → tool uses that path instead of downloading
4. **PATH fallback**: If tool is on PATH and not downloaded, it should still be found
5. **Uninstall**: Remove a tool from settings → features gracefully degrade (show "tool not installed")
6. **Lint consolidation**: All existing lint tests pass with the refactored LspClient
7. **Run checks**: `pnpm check`, `pnpm lint`, `pnpm test`, `cd src-tauri && cargo check`

## Risks

- **Network dependency on first run**: Mitigated by graceful degradation — app works without tools, features just show "install tool" prompts
- **GitHub rate limits**: For unauthenticated downloads — unlikely to hit for 2 tools, but worth noting
- **Lint refactor scope**: Touching 445 lines of working code. Mitigated by keeping all lint-specific logic intact, only replacing the transport layer
