# IWE Startup CPU + Dev-Mode Vault-Open Crash Implementation Plan

Date: 2026-04-02
Status: implemented
Owner: Codex
Branch: fix/iwe-marksman-startup-cpu-plan

## Problem statement

When a vault is opened, Carbide shows sustained high CPU utilization during startup in flows related to Markdown LSP / IWE, and in dev mode the app can crash as soon as the vault opens. The current priority is to stabilize startup and eliminate repeated Markdown LSP churn without conflating this work with the separate embeddings failure loop.

## Scope

In scope:

- IWE startup preflight and fallback behavior
- Markdown LSP lifecycle idempotence on vault open
- Markdown LSP listener/subscription cleanup and vault scoping
- duplicate stop/start ownership across frontend/backend
- plugin watcher startup hardening only insofar as it can look like a fatal startup failure in dev mode

Out of scope:

- search embeddings failures
- tokenizer/model truncation issues
- broader plugin system redesign

## Evidence summary

### Highest-signal findings

1. The frontend lifecycle still has a cleanup path that clears the dedupe key and calls stop during effect invalidation.
   - `src/lib/reactors/markdown_lsp_lifecycle.reactor.svelte.ts:68-73`
2. The same lifecycle path snapshots settings, rewrites IWE config, and then starts Markdown LSP.
   - `src/lib/reactors/markdown_lsp_lifecycle.reactor.svelte.ts:50-61`
3. The frontend service unconditionally calls `port.stop()` before `port.start()`, while the backend also stops/replaces the existing client.
   - frontend: `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts:70-80`
   - backend: `src-tauri/src/features/markdown_lsp/service.rs:322-327`
4. Backend startup still follows the IWE-specific config path whenever `preferred == "iwes"`, before proving IWE can start cleanly under the vault cwd.
   - `src-tauri/src/features/markdown_lsp/service.rs:243-319`
5. Plugin watcher startup treats a missing `.carbide/plugins` dir as an error, but frontend catches it and logs only.
   - Rust: `src-tauri/src/features/plugin/watcher.rs:86-89`
   - TS: `src/lib/features/plugin/application/plugin_service.ts:513-518`

## Prioritized execution order

## Phase 1 — Harden IWE startup preflight and one-shot fallback

Priority: P0
Status: completed

### Goal

Prevent dev-mode vault-open crashes and remove repeated startup work when IWE cannot actually start for the selected vault path.

### Files

- `src-tauri/src/features/markdown_lsp/service.rs`
- tests under Rust markdown LSP coverage as needed

### Planned changes

- Introduce an explicit IWE startup preflight before IWE config mutation and before final LSP client startup.
- Distinguish at minimum:
  - IWE binary resolution failure
  - vault cwd / path usability failure
  - IWE process startup failure
- If IWE preflight fails, resolve once to Marksman and continue via a single effective provider path.
- Avoid IWE-specific config rewrite/copy work when the effective provider is already known to be Marksman.
- Ensure logging clearly states requested provider vs effective provider.

### Acceptance criteria

- Opening a vault with broken IWE no longer crashes the app.
- A failed IWE startup produces one fallback path, not repeated retries.
- Marksman starts directly after fallback.

## Phase 2 — Make Markdown LSP startup single-flight at the lifecycle boundary

Priority: P0
Status: completed

### Goal

Stop repeated start/stop/restart churn during vault-open effect invalidation.

### Files

- `src/lib/reactors/markdown_lsp_lifecycle.reactor.svelte.ts`
- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`

### Planned changes

- Replace current best-effort dedupe with a stricter single-flight startup guard.
- Key startup by vault id plus effective startup identity, not only requested provider.
- Do not clear the guard on ordinary effect cleanup in a way that instantly re-arms the same startup.
- Keep restart explicit.
- Ensure failed start does not leave half-attached listener state.

### Acceptance criteria

- One Markdown LSP startup per vault open for identical settings.
- Unrelated state churn does not trigger restart.

## Phase 3 — Make listener lifecycle replace-before-add and vault-scoped

Priority: P1
Status: completed

### Goal

Prevent listener accumulation and cross-vault event handling from amplifying startup instability.

### Files

- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`
- `src/lib/features/markdown_lsp/adapters/markdown_lsp_tauri_adapter.ts`

### Planned changes

- Always `unsubscribe_all()` before attaching new listeners in `start()`.
- Filter status and diagnostics by `vault_id` before mutating stores.
- Add low-noise attach/detach logging.

### Acceptance criteria

- Repeated start attempts do not accumulate listeners.
- Events from a different vault are ignored.

## Phase 4 — Collapse stop/start ownership to one layer

Priority: P1
Status: completed

### Goal

Reduce redundant process churn and clarify lifecycle responsibility.

### Files

- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`
- `src-tauri/src/features/markdown_lsp/service.rs`

### Planned changes

- Keep backend as owner of active-client replacement semantics.
- Remove unconditional frontend stop-before-start behavior.
- Preserve explicit stop for teardown and explicit restart flows.

### Acceptance criteria

- Startup path performs one replacement, not frontend stop plus backend stop.

## Phase 5 — Align plugin watcher startup with plugin discovery semantics

Priority: P2
Status: completed

### Goal

Remove a misleading startup error path in dev mode.

### Files

- `src-tauri/src/features/plugin/watcher.rs`
- `src/lib/features/plugin/application/plugin_service.ts` if needed for tests/log expectations

### Planned changes

- Treat missing `vault/.carbide/plugins` as a no-op watcher startup.
- Downgrade logging accordingly.

### Acceptance criteria

- Empty plugin directories do not appear as startup failures.

## Test plan

### Frontend

- lifecycle starts once on identical repeated startup inputs
- lifecycle does not restart on unrelated churn
- service clears listeners before re-subscribing
- foreign-vault markdown LSP events are ignored

### Backend

- fallback from unavailable/broken IWE to Marksman happens once
- config work is skipped when effective provider is Marksman
- replacing an existing client leaves only one active client

### Manual

1. IWE selected and healthy
2. IWE selected with invalid custom path
3. IWE selected with vault cwd/path startup failure
4. Marksman selected directly
5. repeated vault open/close cycles

## Progress log

- 2026-04-02: Initial implementation plan created from code review and startup-failure triage.
- 2026-04-02: Phase 1 implemented in `src-tauri/src/features/markdown_lsp/service.rs` by adding IWE cwd/process preflight, one-shot fallback to Marksman, effective-provider reporting, and skipping IWE config work after fallback.
- 2026-04-02: Phases 2-4 implemented in `src/lib/reactors/markdown_lsp_lifecycle.reactor.svelte.ts` and `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts` by removing cleanup-triggered restart churn, replacing listeners before subscribe, filtering foreign-vault status events, and removing same-vault frontend stop-before-start.
- 2026-04-02: Phase 5 implemented in `src-tauri/src/features/plugin/watcher.rs` by treating a missing `.carbide/plugins` directory as a no-op watcher startup.
- 2026-04-02: Added focused regression coverage in `tests/unit/services/markdown_lsp_service.test.ts` and `tests/unit/reactors/markdown_lsp_lifecycle.reactor.test.ts`.
- 2026-04-02: Validation run completed for `pnpm check`, targeted Vitest coverage, and `cd src-tauri && cargo check`; repository-wide `pnpm lint` and `pnpm test` still report pre-existing unrelated failures.
- 2026-04-03: Fresh startup logs in `carbide/2026-04-03_startup_logs.txt` show the original crash/retry fix held, but the CPU spike remains. The logs show one healthy IWE startup at `11:31:15`, then a second full IWE startup at `11:32:12` caused by post-start provider rewrite (`[markdown_lsp_service] Rewrote IWE config, restarting LSP provider=lmstudio`).
- 2026-04-03: The remaining high-CPU root cause is now narrower and appears to be inside IWE startup itself, not Carbide's prior repeated lifecycle invalidation. `vendor/iwe/crates/iwes/src/lib.rs` constructs the server from `new_for_path(...)`, `vendor/iwe/crates/liwe/src/fs.rs` walks every markdown file in the vault, and `vendor/iwe/crates/liwe/src/graph.rs` parses the full state into a graph with parallel markdown parsing during startup.
- 2026-04-03: The current Carbide integration still forces one unnecessary extra full-vault IWE startup after the first successful startup because provider rewrite is deferred until after the LSP reaches `running`. That restart is secondary but still real.

## Working notes

- Separate embeddings failure loop remains out of scope.
- Plugin watcher hardening should stay separate from Markdown LSP root cause unless new evidence ties it directly to the crash path.
- New evidence suggests the next fix should target startup shape, not just lifecycle dedupe:
  - rewrite IWE config before the first real IWE launch so startup does not perform a second full-vault initialization
  - evaluate whether IWE must be eager on vault open at all, since vendor startup currently scans and parses the entire vault before becoming ready
