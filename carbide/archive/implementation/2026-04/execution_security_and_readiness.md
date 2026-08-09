# Execution Security and Readiness

This document defines the cross-cutting implementation rules that apply to every remaining roadmap phase.

Use this before touching terminal hardening, graph, Bases, task views, plugin work, or any feature that introduces a new IO boundary.

## Why this exists

Carbide is already far enough along that implementation mistakes will now create structural debt, not just local bugs.

The main risks are:

- mixing plugin, terminal, and command execution powers
- bypassing the ports and adapters model for convenience
- adding new state in the wrong layer
- building feature-local caches that fight the existing search and index model
- reintroducing Lokus-style workspace or global-runtime coupling

## Trust boundaries

### 1. Plugin host

Trust level: lowest

Rules:

- plugins never call raw Tauri `invoke()`
- plugins never get PTY handles
- plugins never get arbitrary shell or pipeline execution
- plugins only see host-owned APIs and host-owned handles
- plugins must survive disable, crash, and malformed input without corrupting app state

Primary docs:

- `carbide/plugin_system.md`
- `carbide/implementation/phase5_plugin_host_implementation.md`

### 2. Terminal sessions

Trust level: app-owned, interactive, high-risk

Rules:

- terminal sessions are app features, not plugin capabilities
- PTY lifecycle is owned by the terminal slice, not by Svelte components directly
- vault switch behavior must be explicit and deterministic
- session persistence must not leave orphaned processes behind

Primary doc:

- `carbide/implementation/phase1_terminal_and_document_performance.md`

### 3. Command and pipeline execution

Trust level: app-owned power-user feature

Rules:

- command execution is a separate capability from both plugins and the terminal
- commands are explicit, user-authored, and observable
- cwd, stdin, stdout, timeout, and failure semantics must be explicit
- command execution must not become a backdoor around plugin security rules

Existing backend seam:

- `src-tauri/src/features/pipeline/service.rs`

### 4. Vault and filesystem access

Trust level: host-owned core domain

Rules:

- note and vault writes remain host-owned
- metadata indexes remain derived from Markdown, not competing truth sources
- feature-specific caches may exist, but the persisted source of truth remains on-disk Markdown plus typed system-local indexes
- any new filesystem capability must be exposed through a port and adapter

### 5. Network access

Trust level: host-owned, permission-gated

Rules:

- network access is never ambient for plugins
- if a feature needs network access later, it must be mediated by explicit host policies and error handling
- external calendar sync and marketplace work are downstream, not foundational

## Architecture gates

Every new workstream must respect these existing seams:

### Frontend composition root

- `src/lib/app/bootstrap/create_app_stores.ts`
- `src/lib/app/di/app_ports.ts`
- `src/lib/app/create_prod_ports.ts`
- `src/lib/app/di/create_app_context.ts`

### Existing persistent side effects

- `src/lib/reactors/*`

### Rust registration seam

- `src-tauri/src/app/mod.rs`

If a feature cannot be integrated through those seams, the design is wrong or incomplete.

## Mandatory implementation checklist for each feature

Before starting a feature, write down:

1. frontend slice owner
2. backend feature or shared-module owner
3. port and adapter boundary
4. state owner
5. service owner
6. reactor owner, if any
7. action surface
8. error states and degraded-mode behavior
9. security boundary
10. test plan

If any of these are unclear, the implementation doc is not ready.

## Lokus donor classification rule

Before borrowing from Lokus, classify the donor.

### Safe donor

Use when the donor is:

- local logic
- query semantics
- extraction logic
- UX patterns
- presentation taxonomy

### Rewrite donor

Use when the donor is valuable but the ownership model is wrong.

Typical examples:

- graph data flow
- Bases semantics
- split-layout ergonomics
- task UX flows

### Anti-donor

Reject when the donor depends on:

- direct `invoke()` exposure to untrusted code
- dangerous runtime permissions
- global `workspacePath` assumptions
- broad React context or global store coupling
- external auth and sync stacks that explode scope

## Benchmark and observability gates

Do not ship a phase on vibes.

Each feature must define measurable checks.

### Terminal

- spawn time
- resize responsiveness
- process cleanup reliability
- behavior on vault switch

### Big-file viewer

- time to first render
- steady-state memory use while scrolling
- window-read latency

### Metadata and Bases

- full rebuild cost on representative vaults
- incremental update cost after edit, rename, delete
- query latency on representative property sets

### Graph

- full graph build cost
- incremental note update cost
- neighborhood query latency

### Plugin host

- manifest validation failures
- permission-denied behavior
- runtime crash isolation
- contribution registry cleanup on unload

## Shared stop conditions

Stop and redesign if any of the following happen:

- a Svelte component owns process or plugin lifecycle directly when a port and service should own it
- a plugin design requires direct `invoke()` to be practical
- metadata becomes a second source of truth instead of a derived index
- graph or task code tries to own the vault model instead of reading it
- a feature relies on global window state instead of stores and composition-root wiring

## Immediate implementation readiness tasks

These tasks should happen before or at the start of the next implementation work.

1. terminal architecture cleanup
   - move PTY operations behind a terminal port and service
2. command execution boundary cleanup
   - document current pipeline semantics and keep them separate from plugin design
3. dynamic contribution seam planning
   - identify how command palette, status bar, and sidebar panel slots become runtime-extensible without breaking existing slices
4. metadata ownership decision
   - keep indexing inside the search SQLite cache path, expose Bases queries through a dedicated feature surface

## Definition of ready

A workstream is ready when:

- the phase-specific implementation doc names concrete files and ownership boundaries
- the security boundary is explicit
- the test plan exists before code is written
- the feature can be integrated without bypassing `create_app_context`, `create_app_stores`, or `app_ports`
