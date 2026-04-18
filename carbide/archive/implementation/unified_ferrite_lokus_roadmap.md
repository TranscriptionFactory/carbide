# Carbide Implementation Roadmap: Delta Plan for Performance, Functionality, and Security

This roadmap is the working execution plan for Carbide on top of Badgerly.

It is a delta plan, not a greenfield wishlist. It starts from what Carbide already has, then prioritizes the next highest-leverage work.

If older documents under `carbide/` conflict with current implementation reality, required functionality, or security requirements, those older documents are inputs, not constraints. This roadmap takes precedence.

## Non-negotiables

- **Badgerly architecture stays intact.** New work must follow the existing Ports/Adapters, Stores, Services, Reactors, and Action Registry model from `docs/architecture.md`.
- **Functionality and security beat plan consistency.** We are not obligated to preserve older plan shapes if they are stale, low-value, or unsafe.
- **Lokus is a product and UX donor, not an implementation base.** Borrow concepts, data-flow shapes, and successful interactions. Do not transplant its React runtime or workspace assumptions.
- **Use the revised donor rules from `carbide/research/lokus_portability_reassessment.md`.** Graph internals, Bases semantics, customization breadth, and task UX are valid donors. Lokus plugin runtime, command-execution exposure, calendar sync stack, and workspace bootstrap model are not.
- **Ferrite is a performance and safety donor, not a UI donor.** Borrow buffer, encoding, write-safety, and execution patterns where they improve Carbide materially.
- **Security is a product feature.**
  - Plugins never get raw Tauri `invoke()` access.
  - Plugins never get PTY stdin or arbitrary shell execution.
  - Command execution, terminal access, and plugin capabilities remain separate systems.
  - New features ship with explicit permission boundaries, lifecycle cleanup rules, and failure handling.
- **Markdown and vault compatibility guardrails remain in force.**
  - Notes remain stored as Obsidian-flavored Markdown.
  - Vault scope stays a single vault root.
  - Link resolution and backlink rewrites must remain rename-safe.
  - JSON Canvas remains on the roadmap. Excalidraw remains the only drawing format in scope for now.

## Companion implementation docs

Use these documents as the implementation packet for the current roadmap:

- `carbide/implementation/implementation_docs_index.md`
- `carbide/implementation/execution_security_and_readiness.md`
- `carbide/implementation/phase1_terminal_and_document_performance.md`
- `carbide/implementation/phase1_visual_customization.md`
- `carbide/implementation/phase2_graph_mvp.md`
- `carbide/implementation/phase3_metadata_and_bases.md`
- `carbide/implementation/phase4_tasks_and_views.md`
- `carbide/implementation/phase5_plugin_host_implementation.md`

## Current baseline

The roadmap should not spend time re-planning work that already exists.

Carbide already has, at minimum:

- vault switcher dropdown
- outline panel
- macOS file-open integration foundations
- document-level split view
- terminal panel v1
- document viewer v1 for PDF, image, code, and text
- git remote operations and improved git status UX
- atomic write and encoding-detection primitives in Rust
- `ManagedBuffer` and windowed buffer reads in Rust
- a generic pipeline execution backend
- AI assistant with multi-backend CLI execution, diff-first review, and partial apply
- plugin system Phase 1a: iframe sandbox, RPC bridge, 3 contribution registries, 2 demo plugins
- canvas feature with Excalidraw iframe rendering and theme-aware backgrounds

These are baseline capabilities. Future work should harden or extend them, not pretend they do not exist.

## Execution rules for every new feature

Every roadmap item must be implemented as a first-class Badgerly feature slice or an explicit extension of an existing slice.

A feature is not portable just because Lokus ships it. Before borrowing from Lokus, classify the donor as one of:

- **safe donor**: local logic, semantics, or UX patterns that can be translated cleanly
- **rewrite donor**: valuable idea, wrong ownership model, must be rebuilt natively
- **anti-donor**: broad coupling, direct `invoke()` exposure, dangerous permissions, or hard workspace assumptions

Before implementation, each feature must name:

- frontend slice ownership
- backend module ownership
- ports and adapters
- state ownership
- service responsibilities
- reactor responsibilities
- action surface
- security boundaries
- test matrix and exit criteria

No feature gets a pass on architecture because it is “advanced”. Graph, Bases, Tasks, Plugins, and terminal improvements must all fit the same decision tree.

## Delivery order

### Phase 0: Security and hardening baseline

Goal: lock down execution boundaries and performance invariants before expanding the surface area further.

##### Priorities

- Codify the boundary between:
  - plugin host
  - terminal sessions
  - pipeline or command execution
  - vault and filesystem access
  - network access
- Reuse the existing Rust safety primitives consistently instead of re-implementing them ad hoc.
- Define benchmark baselines for:
  - terminal spawn, kill, and resize lifecycle
  - large file opening and scrolling
  - metadata refresh cost
  - graph derivation cost
- Require explicit degraded-mode behavior for failures, not just error toasts.

##### Exit criteria

- No new feature ships with ambient shell, PTY, or filesystem power.
- Permission-denied, malformed-input, and lifecycle-cleanup cases are tested explicitly.
- All new architecture is expressed in Badgerly-native slices and boundaries.

### Phase 1: Improve existing foundations and ship visible wins

Goal: strengthen what is already working, while shipping changes users will feel immediately.

#### 1. Terminal improvement and hardening

The terminal is not “done”. It is a useful v1 that now needs to become robust.

##### Priorities

- Keep Badgerly's terminal as the base. Do not import terminal or command-runtime patterns from Lokus.
- Move from a single terminal session model to a multi-session model.
- Add tabs first. Add tiling only if the session model stays clean.
- Define explicit session ownership for cwd, shell, focus, lifecycle, and persistence.
- Fix current rough edges:
  - cwd behavior on vault switch
  - cross-platform shell detection
  - theme and font updates without restart
  - PTY spawn, kill, resize, and cleanup reliability
- Keep terminal capabilities app-owned. Do not let plugins tunnel into PTY execution.

##### Exit criteria

- Terminal sessions survive routine UI navigation without leaking processes.
- Vault switches have deterministic terminal behavior.
- Terminal state, theme, and resize behavior are predictable and test-covered.

#### 2. Big-file and document performance

##### Priorities

- Finish true virtualization in `CodeViewer.svelte`.
- Use `ManagedBuffer` and `read_buffer_window` as the standard path for large files.
- Extend the current document viewing path to handle large logs, large text files, and eventually CSV-like data without blowing up memory.
- Keep UI memory use effectively constant for large read-only documents.

##### Exit criteria

- Large text or log files open without freezing the UI.
- The viewer path remains architecture-compliant and benchmarked.

#### 3. Deep visual customization

This is one of the highest-value Lokus borrow targets and should ship early.

##### Priorities

- Use `src/core/editor/live-settings.js` and `src/views/Preferences.jsx` in Lokus as direct donor references for settings breadth and grouping.
- Expand the existing theme and settings surfaces with more live CSS-variable control.
- Add explicit controls for typography, spacing, selection, block styling, and editor width where they materially improve readability.
- Keep setting scope explicit. Do not let global and vault-level settings blur together.
- Prefer typed settings and host-owned style application over ad hoc runtime mutation.

##### Exit criteria

- The customization system remains typed, testable, and compatible with the existing theme model.
- New appearance controls are visibly useful and do not weaken maintainability.

### Phase 2: Graph MVP

Goal: ship a native graph feature early, without waiting for full Bases maturity.

##### Priorities

- Build a native `graph` slice in Badgerly.
- Use `src/core/graph/GraphDataProcessor.js` as the main Lokus donor for build stages, batch processing, and incremental file-content updates.
- Treat `src/features/graph/hooks/useGraphEngine.js` and graph state in `src/stores/editorGroups.js` as anti-patterns for ownership, not patterns to copy.
- Use the existing link-resolution and links-store foundations for the first graph data model.
- Borrow Lokus graph ideas at the data-flow level, not at the UI implementation level.
- Start with a scoped MVP:
  - note graph and local neighborhood exploration
  - filtering by note type or path if useful
  - simple metrics only if they stay cheap and legible
- Defer graph complexity that does not clearly improve day-one utility.

##### Exit criteria

- Graph is useful on real vaults, not just demo data.
- Data derivation is incremental and does not require architecture shortcuts.

### Phase 3: Metadata engine and Bases foundation

Goal: build the structured data layer carefully, because Bases, richer graph features, and future metadata views depend on it.

##### Priorities

- Use `src/bases/core/BaseSchema.js`, `src/bases/query/QueryExecutor.js`, and `src/bases/data/FrontmatterParser.js` in Lokus as semantic donors.
- Treat `src/bases/BasesContext.jsx`, `.lokus/bases`, and `window.__WORKSPACE_PATH__` based access as anti-patterns to avoid.
- Parse YAML frontmatter and structured note properties into a dedicated metadata index.
- Keep the metadata cache system-local and derived from Markdown, not a competing source of truth.
- Add a dedicated metadata reactor for file create, modify, rename, and delete flows.
- Build a query executor for property filters, sorting, and derived views.
- Expose the minimal `BasesPort` needed by the frontend.
- Start with the simplest useful views first.
  - table and list before gallery
  - gallery only after the metadata and query model is stable
- Support `.base` definitions only if they genuinely improve usability and remain consistent with the architecture. They are not mandatory just because they appeared in earlier plans.

##### Exit criteria

- Metadata refresh is incremental and reliable.
- Bases queries are deterministic, test-covered, and fast enough for real vault usage.
- The metadata engine strengthens graph and future views instead of forking the model.

### Phase 4: Task and workflow domain

Goal: treat tasks, boards, and scheduling as views over a real underlying model rather than as isolated UI features.

##### Priorities

- Borrow task capture, task mention, and board UX ideas from Lokus.
- Do not borrow workspace-boot flows like `initialize_workspace_kanban` or the external calendar stack.
- Extract markdown tasks into a dedicated task domain and indexed cache.
- Keep tasks grounded in Markdown and metadata, not in a parallel proprietary store.
- Add fast task-creation interactions informed by Lokus only if they fit Carbide’s editor model cleanly.
- Build Kanban on top of the task and metadata layers.
- Build a simple internal calendar or scheduling view only after the task model is stable.
- Keep external calendar sync out of scope until there is a strong user-driven need.

##### Local command tools

Ferrite-style command execution is valuable, but it must stay separate from the plugin system.

- Treat pipeline or command execution as an explicit power-user feature, not as “binary plugins”.
- Make commands user-authored, explicit, and observable.
- Require clear ownership of cwd, stdin, stdout, timeout, and failure behavior.
- Do not let plugin permissions silently inherit command execution privileges.

##### Exit criteria

- Tasks, Kanban, and calendar views all sit on the same underlying task and metadata model.
- Command tooling is powerful without creating a backdoor around plugin security.

### Phase 5: Native plugin host

Goal: add an extensibility system that is actually secure, architecture-compliant, and worth maintaining.

##### Priorities

- Use the security model from `carbide/plugin_system.md` as the source of truth.
- Treat `src/plugins/PluginManager.js`, `src/plugins/api/PluginApiManager.js`, `src/plugins/runtime/PluginRuntime.js`, and `src/plugins/core/PluginManifest.js` in Lokus as anti-donor references.
- Borrow manifest vocabulary and contribution-slot thinking only where they do not weaken Carbide's trust boundaries.
- Build a native Carbide plugin API first.
- Use sandboxed iframes and `postMessage` RPC.
- Expose host-owned contribution points, not arbitrary DOM mutation.
- Start with a narrow but real API surface:
  - commands
  - status bar items
  - sidebar panels
  - limited editor actions
  - vault and metadata access under permission gates
- Add manifest validation, permission checks, runtime isolation, and failure containment from day one.
- Keep plugin distribution local-first until the host model is proven.

##### Explicit non-goals for this phase

- no raw Tauri `invoke()` from plugins
- no PTY or arbitrary shell access from plugins
- no direct network access with ambient credentials
- no Obsidian compatibility shim as a first milestone

##### Exit criteria

- A small set of demo plugins can run safely under clear permission gates.
- Plugin contributions are dynamically registered without breaking the existing architecture.
- Failure in one plugin does not compromise the app or other plugins.

### Phase 6: Canvas (Visual Knowledge Layout)

Goal: ship a functional infinite canvas MVP that supports both Excalidraw drawings and JSON Canvas spatial arrangement.

##### Priorities

- Build a native `canvas` slice in Badgerly.
- Use JSON Canvas as the storage format for spatial note boards.
- Support Excalidraw-only canvas support for now as the drawing experience.
- Ensure canvas references (note links, image embeds) are rename-safe.
- Integrate the canvas viewer into the existing multi-type document viewing stack.

##### Exit criteria

- Users can create, edit, and arrange notes on an infinite canvas.
- Users can create and edit Excalidraw drawings.
- The canvas implementation follows the Badgerly slice architecture and security boundaries.

## Base-switch threshold

Lokus should only become the implementation base if Carbide deliberately changes strategy to prefer raw feature breadth over:

- Badgerly's architecture rules
- strict plugin and command security boundaries
- explicit vault and state ownership
- replay cost for already-landed Carbide work

That is not the current strategy. So the working answer remains no.

## Later, only if justified

These are intentionally downstream:

- plugin marketplace or registry
- Obsidian compatibility layer
- external calendar sync
- multi-root or shared-parent vault scope
- direct ports of Lokus runtime systems

## Bottom line

The priority is not to imitate Lokus or Ferrite mechanically.

The priority is to make Carbide meaningfully better on top of Badgerly by:

- hardening existing capabilities that already matter
- shipping visible customization and graph wins early
- building metadata and tasks on a strong internal model
- treating terminal, command execution, and plugins as separate security domains
- refusing any shortcut that weakens architecture or trust boundaries
