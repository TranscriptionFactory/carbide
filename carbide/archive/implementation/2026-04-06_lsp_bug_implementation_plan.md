# LSP & Bug Fix Implementation Plan

Date: 2026-04-06
Source: synthesis of `2026-04-06_CARBIDE_BUG_REPORT.md` and `2026-04-06_LSP_IMPLEMENTATION_PLAN.md`

## Bug-to-Phase Mapping

| Bug                             | LSP Phase  | Notes                                       |
| ------------------------------- | ---------- | ------------------------------------------- |
| BUG-009 (LSP startup fails)     | Phase 4, 5 | Transport diagnostics + vault-aware startup |
| BUG-005 (IWES packaging)        | Phase 3    | Toolchain registry fix                      |
| BUG-010 (lint lifecycle)        | Phase 8    | Idempotent close                            |
| BUG-006 (link/image corruption) | Phase 7    | Feature gating by provider health           |
| BUG-001 (link substitution)     | Phase 7    | May be provider-state dependent             |
| BUG-008 (toolbar sync)          | Phase 7    | Action routing audit needed                 |
| BUG-002 (inline embedding)      | Phase 6, 7 | Revisit after lifecycle + gating            |
| BUG-003, 004, 007               | None       | Pure editor UX, independent of LSP          |

## Two Failure Clusters

The bug report identifies two failure clusters that the LSP plan addresses.

**Cluster 1 — Infrastructure** (BUG-005, BUG-009, BUG-010): packaging gaps, LSP startup fragility, lint lifecycle noise. Addressed by Phases 3–5 and 8.

**Cluster 2 — Editor actions** (BUG-001, BUG-006, BUG-008): link corruption, action routing, toolbar sync regressions. Addressed by Phase 7, but only diagnosable after Cluster 1 is fixed. Many "editor bugs" may resolve once features stop firing against dead or degraded LSP sessions.

## Execution Order

### Wave 1 — Foundation (unblocks everything else) ✅ COMPLETE

**Phase 1+2: Typed session model + provider resolution separation** ✅

Implemented on branch `feat/wave-1-lsp-typed-session-lint-lifecycle`.

Done:

- `MarkdownLspStatus` enum in Rust (`Starting | Running | Restarting{attempt} | Stopped | Failed{message}`) with serde serialization matching lint's pattern
- `MarkdownLspProvider` enum (`Iwes | Marksman`) with capabilities, moved to `types.rs`
- `MarkdownLspEvent` typed enum replaces old `MarksmanEvent` with string status
- `MarkdownLspDiagnostic` moved from service.rs inline to types.rs
- Provider resolution extracted to `provider.rs` module (`resolve_markdown_lsp_startup`, `ensure_iwe_config`, preflight)
- TypeScript `MarkdownLspStatus` union type matches Rust serde format (`{ restarting: { attempt } }`, `{ failed: { message } }`)
- Store: removed separate `error` field, initial status `"stopped"` (was `"idle"`), added `is_running` derived
- Service: typed status passthrough replaces fragile string matching, `handle_status_change` now a one-liner
- Helper functions: `is_markdown_lsp_running`, `is_markdown_lsp_failed`, `markdown_lsp_error_message`
- Tests: restarting propagation, failed on start, reset to stopped on stop

Deferred to Wave 2+:

- Provider capability table for frontend feature gating (Phase 7 dependency)
- Fallback reason recording in status (needs Phase 4 transport diagnostics first)

Files changed:

- `src-tauri/src/features/markdown_lsp/types.rs`
- `src-tauri/src/features/markdown_lsp/service.rs`
- `src-tauri/src/features/markdown_lsp/provider.rs` (new)
- `src-tauri/src/features/markdown_lsp/mod.rs`
- `src/lib/features/markdown_lsp/types.ts`
- `src/lib/features/markdown_lsp/state/markdown_lsp_store.svelte.ts`
- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`
- `src/lib/features/markdown_lsp/index.ts`
- `src/lib/reactors/backlinks_sync.reactor.svelte.ts`
- `tests/unit/services/markdown_lsp_service.test.ts`
- `tests/unit/reactors/backlinks_sync_reactor.test.ts`

**Phase 8: Lint lifecycle idempotent close (BUG-010)** ✅

Done:

- `lint_close_file` returns `Ok(())` when no session exists (was erroring)
- Frontend `notify_file_closed` already guarded by `is_running` check
- Tests: close when not running is no-op, close when running calls port

Files changed:

- `src-tauri/src/features/lint/mod.rs`
- `tests/unit/services/lint_service.test.ts`

BDD scenarios:

- Close after stop does not log error
- Double close does not log error or recreate state

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

### Wave 3 — Lifecycle and feature correctness (P0/P1 bugs)

**Phase 6: Complete markdown document lifecycle**

- Add `markdown_lsp_did_close` end to end (Tauri command, port, adapter, service)
- Invoke on editor teardown / note switch / vault stop
- Clear local document version tracking on close

Files:

- `src-tauri/src/features/markdown_lsp/service.rs`
- `src/lib/features/markdown_lsp/ports.ts`
- `src/lib/features/markdown_lsp/adapters/markdown_lsp_tauri_adapter.ts`
- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`

BDD scenarios:

- Open → change → close clears local version, sends didClose once
- Close after stop is a safe no-op

**Phase 7: Gate editor features by provider health (BUG-006, BUG-001, BUG-008)**

This is where the action-routing audit happens. Uses the typed LSP state from Phase 1 to gate behavior.

- Only request completions when `completion` capability is active
- Only show code-action affordances when provider is running and supports them
- Surface fallback/degraded indicators near affected UI
- Avoid invoking link/code-action flows against dead or restarting sessions

Files:

- `src/lib/features/editor/adapters/lsp_code_action_plugin.ts`
- `src/lib/features/editor/adapters/lsp_completion_plugin.ts`
- `src/lib/features/editor/extensions/lsp_extension.ts`
- `src/lib/features/markdown_lsp/state/markdown_lsp_store.svelte.ts`

BDD scenarios:

- Restarting session suppresses code-action requests
- Degraded Marksman session allows supported read-only features, unsupported actions hidden

### Wave 4 — Verification ✅ COMPLETE

**Phase 9: Reliability tests and release checks** ✅

Done:

- Rust: `markdown_lsp_provider_types.rs` — provider capability and serde tests
- Rust: `markdown_lsp_status_serde.rs` — status serialization format tests
- Rust: `toolchain_registry_specs.rs` — full tool registry coverage (rumdl, marksman, iwes)
- Rust: extended `lsp_client_error_display.rs` — all error variant display tests
- TypeScript: `markdown_lsp_types.test.ts` — capabilities, status helpers
- TypeScript: `markdown_lsp_store.test.ts` — store state and derived values
- TypeScript: extended `markdown_lsp_service.test.ts` — diagnostics, channel closed, query guards, restart, version tracking
- TypeScript: extended `lint_service.test.ts` — double close, stale version after restart
- Release validation script: `scripts/validate_release.sh`

Files:

- `src-tauri/tests/markdown_lsp_provider_types.rs` (new)
- `src-tauri/tests/markdown_lsp_status_serde.rs` (new)
- `src-tauri/tests/toolchain_registry_specs.rs` (new)
- `src-tauri/tests/lsp_client_error_display.rs` (extended)
- `src-tauri/src/tests/mod.rs` (extended)
- `tests/unit/domain/markdown_lsp_types.test.ts` (new)
- `tests/unit/stores/markdown_lsp_store.test.ts` (new)
- `tests/unit/services/markdown_lsp_service.test.ts` (extended)
- `tests/unit/services/lint_service.test.ts` (extended)
- `scripts/validate_release.sh` (new)

### Wave 5 — Independent UX (P2, parallelizable)

BUG-003 (collapsible heading Return behavior), BUG-004 (code fence selection scrolling), BUG-007 (escaped characters in source mode) are pure editor UX issues with no LSP dependency. They can be fixed at any time in parallel with the waves above.

## Decisions (Resolved)

1. **IWES distribution — Auto-download (Option B), using upstream binaries.** The `ToolSpec` for IWES already exists in `registry.rs` with the same shape as Marksman and rumdl — just needs `platform_binaries` populated. The vendored fork (`vendor/iwe` at `716ca28`) added `#[serde(default)]` to handle partial config files, but this is unnecessary: Carbide controls config generation and should always write complete config files. IWES is also manually restartable (no auto-retry), so a config error is recoverable. Use upstream releases directly; drop the vendored submodule dependency.
2. **Restart exhaustion — Stay manually restartable but visibly failed.** After exhausting retries, enter a stable `failed` state. User can manually trigger restart, but no automatic retry storm.
3. **Cloud-backed vaults — Investigate root cause first.** The failing path (`/Users/.../Library/Mobile Documents/com~apple~CloudDocs/...`) contains spaces. The real issue may be space-in-path or `%`-encoding handling in the LSP transport or Marksman, not vault size. Phase 5 should start with a path-encoding investigation before adding vault-size heuristics.
4. **BUG-007 — Deferred.** Investigation postponed; not blocking any LSP work.

## Gaps Not Covered

- No telemetry/metrics for LSP health in production
- BUG-002 (inline embedding) has the weakest diagnosis — may need its own investigation spike after Wave 2

## Acceptance Criteria

**Reliability**: LSP starts on minimal local vaults. Missing IWES is not a random runtime failure. Fallback to Marksman is explicit. Marksman init failure does not produce opaque retry noise.

**Product**: UI distinguishes starting / restarting / running / degraded / stopped / failed. Editor features enabled only when supported and healthy. Lint close-file errors disappear during normal teardown.

**Engineering**: Fallback and failure reasons are typed, not inferred from log strings. Automated coverage for startup planning and lifecycle edges. Release validation includes tool resolution and LSP smoke checks.
