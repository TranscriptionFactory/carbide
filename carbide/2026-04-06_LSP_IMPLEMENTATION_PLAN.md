# LSP Implementation Plan

Date: 2026-04-06
Scope: fix the current markdown LSP failures, close the release/tooling gaps around IWES and Marksman, and improve the reliability and debuggability of all LSP-backed note features.

## Goals

1. Make markdown LSP startup reliable on normal vaults.
2. Fail gracefully on problematic vaults instead of thrashing or silently degrading.
3. Make provider selection, fallback, and status visible and typed across Rust and TypeScript.
4. Prevent LSP-backed editing features from corrupting source text or behaving differently depending on hidden provider state.
5. Clean up adjacent LSP lifecycle issues in lint so background errors do not pollute the product.

## In scope

- `src-tauri/src/features/markdown_lsp/*`
- `src-tauri/src/shared/lsp_client/*`
- `src/lib/features/markdown_lsp/*`
- editor integrations that consume markdown LSP status and code actions
- LSP-adjacent tool resolution and packaging for IWES and Marksman
- lint LSP lifecycle cleanup where it intersects the same shared failure modes

## Out of scope

- designing new editor features unrelated to LSP reliability
- replacing Marksman or IWES entirely
- broad search/indexing refactors unless they are required for LSP correctness

## Current implementation map

### Backend

- `src-tauri/src/features/markdown_lsp/service.rs`
  - owns provider resolution, startup, command handlers, workspace edit application, config rewrite, and event forwarding
- `src-tauri/src/shared/lsp_client/transport.rs`
  - raw JSON-RPC stdio transport, initialization, read/write loop, request timeout handling
- `src-tauri/src/shared/lsp_client/restartable.rs`
  - restart wrapper with exponential backoff and status forwarding
- `src-tauri/src/features/toolchain/resolver.rs`
  - resolves sidecar, downloaded, PATH, or auto-downloaded tools
- `src-tauri/src/features/toolchain/registry.rs`
  - tool metadata and downloadable binary declarations

### Frontend

- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`
  - orchestrates start/stop, event subscriptions, document sync, diagnostics bridging
- `src/lib/features/markdown_lsp/state/markdown_lsp_store.svelte.ts`
  - holds status, completions, code actions, diagnostics-facing state
- `src/lib/features/markdown_lsp/adapters/markdown_lsp_tauri_adapter.ts`
  - IPC adapter
- `src/lib/features/editor/adapters/lsp_*.ts`
  - editor plugins built on markdown LSP responses

### Adjacent LSP consumer

- `src-tauri/src/features/lint/lsp.rs`
- `src-tauri/src/features/lint/mod.rs`
- `src/lib/features/lint/application/lint_service.ts`

Lint is separate from markdown LSP, but it shares the restartable transport model and currently shows lifecycle bugs that should be fixed with the same reliability mindset.

## Key problems confirmed from code and logs

### 1. Startup and fallback are operationally weak

Observed:
- startup falls back from `iwes` to `marksman` when IWE binary resolution or preflight fails
- Marksman can then fail during initialize on large or iCloud-backed vaults
- restart loop retries but the product state remains coarse and stringly typed

Code facts:
- provider resolution and fallback are in `resolve_markdown_lsp_startup()`
- startup success returns only `completion_trigger_characters` and `effective_provider`
- status forwarding emits plain strings such as `running`, `restarting (attempt 1)`, and `failed: ...`

Impact:
- the UI cannot reason cleanly about degraded mode, fallback reason, or retry exhaustion
- editor features may appear broken when the real issue is provider state

### 2. IWES packaging/distribution is incomplete

Observed:
- release builds appear to miss IWES
- logs show `IWE not found — install via Settings > Tools or place on PATH`

Code facts:
- `toolchain::resolver::resolve()` can auto-download only tools with declared platform binaries
- `iwes` in `src-tauri/src/features/toolchain/registry.rs` has an empty `platform_binaries` list
- this means IWES is not auto-downloadable through the same path as Marksman and Rumdl

Impact:
- release behavior is inconsistent
- fallback is doing too much work to hide packaging gaps

### 3. Startup status is underspecified and partly lost in the frontend

Observed:
- backend emits richer runtime statuses than the frontend store models
- frontend store supports `idle | starting | running | error | stopped`
- restart and degraded states are flattened into strings or ignored

Impact:
- UI cannot distinguish starting vs restarting vs running-on-fallback vs permanently failed
- diagnosis depends on logs instead of state

### 4. Markdown document lifecycle is incomplete

Observed from code:
- markdown LSP exposes `didOpen`, `didChange`, `didSave`
- there is no `didClose` command/path for markdown LSP
- lint does have `didClose`, but its close path is not idempotent

Impact:
- the markdown server may keep stale open-document state longer than intended
- lifecycle semantics differ across LSP consumers

### 5. Error classification and observability are too weak

Observed:
- transport logs stderr lines and generic init/read failures
- startup errors collapse into string messages like `LSP closed during init`, `early eof`, or provider fallback log lines

Impact:
- hard to distinguish packaging issue vs provider incompatibility vs workspace-scan issue vs transport bug
- hard to turn failures into actionable UI states or tests

### 6. Lint has an avoidable LSP lifecycle bug

Observed:
- `lint_close_file` errors when no active session exists
- frontend only guards on `lint_store.is_running`, which may lag session teardown
- backend treats missing session as an error instead of a safe no-op

Impact:
- background noise obscures real failures
- teardown order is brittle

## Architecture direction

Keep the existing architecture shape:
- Rust backend remains the thin native/LSP process layer
- TypeScript services remain orchestration only
- editor integrations keep consuming typed store state and explicit actions

But split markdown LSP responsibilities more clearly:
1. provider resolution
2. process startup and health
3. document sync lifecycle
4. request execution
5. status/diagnostic projection to frontend
6. packaging/install validation

## Target end state

### Product behavior

- startup is predictable and transparent
- if IWES is unavailable, the UI explicitly shows fallback to Marksman
- if Marksman cannot initialize on a vault, the UI shows a clear degraded state instead of endless opaque retries
- editor features that require a provider are gated by actual provider capability and health
- release builds either ship IWES correctly or present a first-class install path and validation

### Engineering behavior

- failures are typed, testable, and attributable
- startup is covered by scenario tests
- LSP session state is structured instead of stringly typed
- lint close paths are idempotent

## Proposed implementation

## Phase 1 — Introduce a typed markdown LSP session model

### Why first

Everything else is easier once state is explicit.

### Changes

Backend:
- replace string-only status projection with a typed status payload
- include:
  - session phase: `idle | starting | running | restarting | degraded | stopped | failed`
  - provider: `iwes | marksman | none`
  - requested provider
  - effective provider
  - fallback reason, if any
  - restart attempt, if any
  - last error classification, if any

Frontend:
- replace `MarkdownLspStatus` string union with a typed state model
- keep store-derived convenience booleans such as `is_running`, `is_degraded`, `can_complete`, `can_code_action`
- update `handle_status_change()` to consume structured events instead of parsing strings

Files
- `src-tauri/src/features/markdown_lsp/types.rs`
- `src-tauri/src/features/markdown_lsp/service.rs`
- `src/lib/features/markdown_lsp/types.ts`
- `src/lib/features/markdown_lsp/state/markdown_lsp_store.svelte.ts`
- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`

BDD scenarios
- given requested IWES and available binary, status becomes running with effective provider IWES
- given requested IWES and missing binary, status becomes degraded/running with fallback reason and effective provider Marksman
- given initialization failure after fallback, status becomes failed with structured error

## Phase 2 — Separate provider resolution from startup execution

### Problems addressed

- fallback logic is mixed with startup logic
- fallback reasons exist only in logs
- capability differences are implicit

### Changes

Extract a backend module for provider planning.

Introduce a planning result like:
- requested provider
- candidate list in evaluation order
- chosen provider
- binary source: sidecar / downloaded / PATH / custom
- fallback reason
- preflight result
- capability profile

Split current `resolve_markdown_lsp_startup()` into:
1. resolve requested provider intent
2. resolve binary source
3. run provider-specific preflight
4. return a startup plan

Add a provider capability table in code so the frontend and editor can branch on capabilities without guessing.

Files
- new: `src-tauri/src/features/markdown_lsp/provider.rs`
- update: `src-tauri/src/features/markdown_lsp/service.rs`
- optional mirror: `src/lib/features/markdown_lsp/types.ts`

BDD scenarios
- requested IWES + missing binary => plan contains fallback-to-Marksman reason
- requested Marksman + explicit custom path => no fallback, custom source recorded
- requested IWES + preflight failure => plan records preflight failure distinctly from binary-resolution failure

## Phase 3 — Fix IWES packaging and install story

### Problems addressed

- IWES is not described as downloadable in the registry
- release behavior is inconsistent

### Changes

Decide one supported distribution path and implement it completely.

Option A — bundle IWES sidecars per platform
- add IWES platform binaries to `toolchain/registry.rs`
- ensure release packaging places them in the expected `binaries/` locations
- validate `sidecar_path()` resolution in packaged builds

Option B — support auto-download like other tools
- populate `platform_binaries` for IWES
- verify download, checksum, extraction, and executable preparation
- present install status in Settings > Tools

Regardless of A or B:
- add startup-time validation that records binary source in status
- add release validation script/checklist for Marksman and IWES presence

Files
- `src-tauri/src/features/toolchain/registry.rs`
- possibly `src-tauri/src/features/toolchain/downloader.rs`
- release/build config files as needed
- LSP startup tests/docs

BDD scenarios
- packaged build resolves IWES without PATH dependency
- missing IWES in release build produces explicit install guidance and stable fallback behavior

## Phase 4 — Harden transport and initialization diagnostics

### Problems addressed

- init/read failures are generic
- transport cannot classify failures well enough for product behavior

### Changes

Enhance `LspClientError` and transport diagnostics.

Add distinct error classes for:
- process spawn failure
- initialize timeout
- initialize EOF
- stderr fatal during initialize
- request timeout
- process exited after running
- unsupported method

Capture recent stderr in a bounded ring buffer and attach it to initialization failures.

Add a dedicated initialize timeout separate from per-request timeout.

Emit structured status transitions with these classified failures.

Files
- `src-tauri/src/shared/lsp_client/types.rs`
- `src-tauri/src/shared/lsp_client/transport.rs`
- `src-tauri/src/shared/lsp_client/restartable.rs`
- `src-tauri/src/features/markdown_lsp/service.rs`

BDD scenarios
- server exits before initialize response => initialize EOF classification
- server writes fatal stderr before exit => failed status includes stderr excerpt classification
- repeated crashes exhaust restarts => final failed state is stable and visible

## Phase 5 — Make startup safer on problematic vaults

### Problems addressed

- Marksman appears fragile on large or cloud-backed vaults
- current behavior is retry-heavy and user-light

### Changes

Add vault-risk-aware startup safeguards.

Minimum implementation:
- detect and classify known risky vault characteristics at startup:
  - cloud-backed paths such as iCloud locations
  - very large vault file counts if cheaply measurable
  - known excluded directories already tracked elsewhere
- if risk is high, choose a safer startup mode:
  - warn before enabling Marksman fallback on risky vaults
  - skip repeated restart loops after a classified initialize failure
  - keep diagnostics/code-actions disabled with explicit degraded state instead of pretending startup is still in progress

Nice-to-have follow-up:
- user setting for `markdown_lsp_startup_mode`: `auto | conservative | force`
- per-vault setting to disable Marksman fallback on cloud-backed vaults

Files
- `src-tauri/src/features/markdown_lsp/service.rs`
- possibly shared vault/path helpers
- settings feature if mode becomes user-configurable

BDD scenarios
- cloud-backed vault + Marksman init failure => no retry storm, stable degraded state
- local minimal vault => normal startup path remains unchanged

## Phase 6 — Complete markdown document lifecycle

### Problems addressed

- markdown LSP has no `didClose`
- state may linger server-side

### Changes

Add `markdown_lsp_did_close` end to end.

Backend:
- add Tauri command for `textDocument/didClose`

Frontend:
- add port method and service method
- invoke on editor teardown / note switch / vault stop where appropriate
- clear local document version tracking on close

Files
- `src-tauri/src/features/markdown_lsp/service.rs`
- `src/lib/features/markdown_lsp/ports.ts`
- `src/lib/features/markdown_lsp/adapters/markdown_lsp_tauri_adapter.ts`
- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`
- editor orchestration that owns note/session teardown

BDD scenarios
- open -> change -> close clears local version and sends didClose once
- close after stop is a safe no-op

## Phase 7 — Gate editor features by provider health and capability

### Problems addressed

- editor features may execute when provider is unavailable, degraded, or lacking support
- some link/code-action bugs may really be capability/state mismatches

### Changes

Use the new typed LSP state to gate behavior in editor integrations.

Examples:
- only request completions when `completion` capability is active
- only show code-action affordances when provider is running and supports them
- surface fallback/degraded indicators near affected UI
- avoid silently invoking link/code-action flows against a dead or restarting session

Files
- `src/lib/features/editor/adapters/lsp_*.ts`
- `src/lib/features/markdown_lsp/state/markdown_lsp_store.svelte.ts`
- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`

BDD scenarios
- restarting session suppresses code-action requests
- degraded Marksman session still allows supported read-only features, but unsupported actions are hidden or disabled

## Phase 8 — Make lint LSP lifecycle idempotent

### Problems addressed

- `lint_close_file` throws when session is already gone

### Changes

Backend:
- make `lint_close_file` a no-op if the session does not exist
- optionally do the same for open/update during teardown windows if appropriate

Frontend:
- keep current guards, but also stop treating close-after-stop as exceptional
- add tests for stop-before-close and double-close

Files
- `src-tauri/src/features/lint/mod.rs`
- `src/lib/features/lint/application/lint_service.ts`
- tests in both Rust and TS where applicable

BDD scenarios
- close after stop does not log error
- double close does not log error or recreate state

## Phase 9 — Add reliability tests and release checks

### Backend tests

Add Rust tests for:
- provider planning
- fallback reason classification
- init failure classification
- didClose behavior
- restart exhaustion behavior
- lint idempotent close

### Frontend tests

Add TS tests for:
- typed status handling in `MarkdownLspService`
- degraded/running/fallback UI state transitions
- version tracking across open/change/close
- feature gating based on capability and health

### Release checks

Add a script or CI verification that confirms for packaged builds:
- Marksman binary is resolvable
- IWES binary is resolvable, or explicitly absent by product design
- startup works on a smoke-test vault

## Recommended execution order

### Iteration 1 — correctness foundation
- Phase 1
- Phase 2
- Phase 8

### Iteration 2 — real startup reliability
- Phase 3
- Phase 4
- Phase 5

### Iteration 3 — lifecycle and UX correctness
- Phase 6
- Phase 7

### Iteration 4 — verification and hardening
- Phase 9

## Concrete file-level change list

### Must change
- `src-tauri/src/features/markdown_lsp/service.rs`
- `src-tauri/src/shared/lsp_client/transport.rs`
- `src-tauri/src/shared/lsp_client/restartable.rs`
- `src-tauri/src/features/toolchain/registry.rs`
- `src/lib/features/markdown_lsp/types.ts`
- `src/lib/features/markdown_lsp/state/markdown_lsp_store.svelte.ts`
- `src/lib/features/markdown_lsp/application/markdown_lsp_service.ts`
- `src/lib/features/markdown_lsp/ports.ts`
- `src/lib/features/markdown_lsp/adapters/markdown_lsp_tauri_adapter.ts`
- `src-tauri/src/features/lint/mod.rs`

### Likely change
- `src/lib/features/editor/adapters/lsp_code_action_plugin.ts`
- `src/lib/features/editor/adapters/lsp_completion_plugin.ts`
- `src/lib/features/editor/extensions/lsp_extension.ts`
- tests under `tests/` and `src-tauri/tests` or existing Rust test modules

## Acceptance criteria

### Reliability
- markdown LSP starts successfully on a minimal local vault
- missing IWES no longer looks like a random runtime failure
- fallback to Marksman is explicit and observable
- Marksman init failure does not produce opaque retry noise forever

### Product behavior
- UI can distinguish starting, restarting, running, degraded, stopped, and failed
- editor features are enabled only when supported and healthy
- lint close-file errors disappear during normal teardown

### Engineering quality
- fallback and failure reasons are typed, not inferred from log strings
- there is automated coverage for startup planning and lifecycle edges
- release validation includes tool resolution and LSP smoke checks

## Risks

1. Over-coupling frontend behavior to provider-specific quirks.
   - Mitigation: capability-based gating, not provider-name gating where possible.

2. Adding too much complexity to startup.
   - Mitigation: keep provider planning as a distinct small module.

3. Masking real failures with too much graceful degradation.
   - Mitigation: degraded mode must still preserve explicit reason and telemetry.

4. Shipping IWES packaging changes without release validation.
   - Mitigation: add smoke checks before considering packaging fixed.

## Open decisions

1. Do we want IWES bundled, auto-downloaded, or both?
2. Should cloud-backed vaults default to a conservative startup mode?
3. Do we want restart exhaustion to auto-stop, or stay manually restartable but visibly failed?
4. Which markdown features are acceptable in degraded Marksman-only mode versus fully disabled?

## Immediate next step

Implement Phase 1 and Phase 2 together first. They are the smallest changes that make every subsequent LSP bug easier to diagnose and fix correctly.
