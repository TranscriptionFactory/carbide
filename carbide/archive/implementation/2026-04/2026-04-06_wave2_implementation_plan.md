# Wave 2 Implementation Plan

## Context

Wave 1 established typed LSP session status (`MarkdownLspStatus`) and fixed lint lifecycle (BUG-010). Wave 2 addresses startup reliability — the P0 bugs where LSP fails to start (BUG-009) and IWES isn't available in packaged builds (BUG-005). The current transport layer has no init timeout (hangs forever if server doesn't respond), no stderr capture (failures are opaque), and no failure classification (all init errors become `ProcessSpawnFailed`). IWES has empty `platform_binaries` so it can't auto-download and relies on bundled sidecars.

## Execution Order: Phase 4 → Phase 3 → Phase 5

Phase 4 (transport diagnostics) first because it provides the error classification infrastructure Phase 5 needs. Phase 3 (IWES packaging) is independent but cleaner after error types exist. Phase 5 (vault safeguards) depends on both.

---

## Phase 4: Transport Diagnostics (BUG-009 root cause)

### Step 4.1: Expand `LspClientError` and add `init_timeout_ms` to config

**File:** `src-tauri/src/shared/lsp_client/types.rs`

Add three new init-specific error variants with stderr context:

```rust
pub enum LspClientError {
    ProcessSpawnFailed(String),
    InitTimeout { stderr_excerpt: String },
    InitEof { stderr_excerpt: String },
    InitFailed { message: String, stderr_excerpt: String },
    ProcessExited,
    RequestTimeout,
    InvalidResponse(String),
    ShutdownFailed(String),
    ChannelClosed,
}
```

Add `init_timeout_ms: u64` to `LspClientConfig`. Update `Display` impl to include stderr excerpts.

### Step 4.2: Add stderr ring buffer to transport

**File:** `src-tauri/src/shared/lsp_client/transport.rs`

Replace fire-and-forget stderr spawn (lines 175-182) with a shared `Arc<Mutex<VecDeque<String>>>` bounded at 20 lines. Stderr lines are still logged via `log::warn!` but also pushed to the buffer. Add `async fn stderr_excerpt(buf)` helper that joins the last 10 lines.

### Step 4.3: Add init timeout and typed errors to `lsp_initialize`

**File:** `src-tauri/src/shared/lsp_client/transport.rs`

- Change `lsp_initialize` signature to accept `init_timeout_ms` and `stderr_buf` reference
- Wrap `read_lsp_message` call in `tokio::time::timeout(Duration::from_millis(init_timeout_ms), ...)`
- Map timeout → `InitTimeout { stderr_excerpt }`, EOF → `InitEof { stderr_excerpt }`, server error → `InitFailed { message, stderr_excerpt }`
- Change return type from `Result<_, anyhow::Error>` to `Result<_, LspClientError>`
- Update `lsp_run_loop` call site: replace the `ProcessSpawnFailed(e.to_string())` wrapper (line 198) with direct propagation of typed errors

### Step 4.4: Classify failures as retryable/non-retryable in restartable layer

**File:** `src-tauri/src/shared/lsp_client/restartable.rs`

Add `fn is_retryable(err: &LspClientError) -> bool`:

- `ProcessSpawnFailed` → true (transient spawn issues)
- `InitEof` → true (process crashed during init, might recover)
- `ProcessExited` → true (runtime crash)
- `InitTimeout` → **false** (will hang again on retry)
- `InitFailed` → **false** (server rejected init)
- Others → false

Update `run_loop` spawn-failure branch (line 163) to check `is_retryable(&e)` before retrying. Non-retryable errors go straight to `Failed` state.

### Step 4.5: Wire `init_timeout_ms` into markdown LSP start

**File:** `src-tauri/src/features/markdown_lsp/service.rs`

Add `init_timeout_ms: 30_000` to the `LspClientConfig` construction at line 292.

### Step 4.6: Tests

- Unit tests for `LspClientError::Display` with stderr excerpts
- Unit tests for `is_retryable` classification
- Update existing TS test: emit failed status with stderr info, verify store captures it

**Commit after Phase 4.**

---

## Phase 3: IWES Packaging (BUG-005)

### Step 3.1: Populate IWES `platform_binaries` in registry

**File:** `src-tauri/src/features/toolchain/registry.rs`

Verified from GitHub API: release tag is `iwe-v0.0.67`, repo is `iwe-org/iwe`, assets follow `iwe-v{version}-{triple}.tar.gz` pattern.

Changes:

- `IWES_VERSION`: `"0.0.65"` → `"0.0.67"`
- `github_repo`: `"TranscriptionFactory/iwe"` → `"iwe-org/iwe"`
- `release_tag_template`: `"v{version}"` → `"iwe-v{version}"`
- Add `IWES_BINARIES` static with 4 platform entries (aarch64-apple-darwin, x86_64-apple-darwin, x86_64-unknown-linux-gnu, x86_64-pc-windows-msvc)
- SHA256 hashes: use `"TODO"` initially (downloader already skips verification for `"TODO"` — line 55 of downloader.rs). Compute and fill in before release.

The `extract_tar_gz` function searches by `file_name()` matching `binary_name` ("iwes"), so it'll find `iwes` inside the multi-binary archive correctly.

### Step 3.2: Remove IWES sidecar binary and bundle config

- Delete `src-tauri/binaries/iwes-aarch64-apple-darwin`
- Update `tauri.conf.json` line 23: `"externalBin": ["binaries/rumdl"]` (remove `"binaries/iwes"`)

### Step 3.3: Remove `vendor/iwe` submodule

- `git submodule deinit vendor/iwe`
- `git rm vendor/iwe`
- Remove entry from `.gitmodules`

### Step 3.4: Tests

- Rust unit test: `IWES` spec is `downloadable()`, release tag is `"iwe-v0.0.67"`, download URL is well-formed

**Commit after Phase 3.**

---

## Phase 5: Vault-aware Startup Safeguards (BUG-009 iCloud mitigation)

### Step 5.1: Investigation conclusion

Space-in-path is NOT the issue — `tokio::process::Command::new()` and `current_dir()` handle spaces correctly. The `root_uri` is properly percent-encoded via `tauri::Url::from_file_path`. The real issue is IWES/Marksman trying to index cloud-backed vault contents on startup, causing init to hang indefinitely. Phase 4's init timeout already addresses this — after 30s the init times out and enters `Failed` state without retry (since `InitTimeout` is non-retryable).

### Step 5.2: Add vault path risk detection

**File (new):** `src-tauri/src/shared/vault_path.rs`

```rust
pub struct VaultPathRisk {
    pub is_cloud_backed: bool,
    pub cloud_provider: Option<&'static str>,
}

pub fn analyze(path: &Path) -> VaultPathRisk { ... }
```

Detect iCloud (`Library/Mobile Documents/com~apple~CloudDocs`), Dropbox, OneDrive paths.

Register in `src-tauri/src/shared/mod.rs`.

### Step 5.3: Shorter init timeout for cloud-backed vaults

**File:** `src-tauri/src/features/markdown_lsp/service.rs`

After resolving vault_path, analyze it. Use 10s init timeout for cloud-backed vaults (vs 30s default). Log the risk classification.

### Step 5.4: Cloud-vault fallback guidance in provider

**File:** `src-tauri/src/features/markdown_lsp/provider.rs`

When IWES resolution/preflight fails for a cloud-backed vault, log enriched message noting cloud sync may cause indexing timeouts.

### Step 5.5: Tests

- `analyze()` detects iCloud, Dropbox, OneDrive paths
- Local path returns no risk
- `InitTimeout` is non-retryable (already covered in Phase 4)

**Commit after Phase 5.**

---

## Verification

After all phases:

1. `cargo check` — Rust type checking
2. `pnpm check` — Svelte/TypeScript type checking
3. `pnpm lint` — oxlint linting
4. `pnpm test` — Vitest unit/integration tests
5. `pnpm format` — Prettier formatting

Update `carbide/2026-04-06_lsp_bug_implementation_plan.md` to mark Wave 2 phases as complete.

## Critical Files

| File                                              | Changes                                             |
| ------------------------------------------------- | --------------------------------------------------- |
| `src-tauri/src/shared/lsp_client/types.rs`        | New error variants, `init_timeout_ms` field         |
| `src-tauri/src/shared/lsp_client/transport.rs`    | Stderr ring buffer, init timeout, typed init errors |
| `src-tauri/src/shared/lsp_client/restartable.rs`  | `is_retryable` classification                       |
| `src-tauri/src/features/toolchain/registry.rs`    | IWES platform_binaries, repo, tag template          |
| `src-tauri/tauri.conf.json`                       | Remove iwes from externalBin                        |
| `src-tauri/src/shared/vault_path.rs`              | New: vault path risk analysis                       |
| `src-tauri/src/shared/mod.rs`                     | Register vault_path module                          |
| `src-tauri/src/features/markdown_lsp/service.rs`  | Wire init_timeout_ms, cloud-vault risk              |
| `src-tauri/src/features/markdown_lsp/provider.rs` | Cloud-vault fallback guidance                       |
| `.gitmodules`                                     | Remove vendor/iwe entry                             |
