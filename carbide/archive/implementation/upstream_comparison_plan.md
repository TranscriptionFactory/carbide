# Upstream Comparison Performance Plan

## Goal

Implement the performance fixes identified in `carbide/implementation/upstream_comparison.md` without cutting the feature direction described in:

- `carbide/carbide-project-guide.md`
- `carbide/TODO.md`
- `carbide/plugin_system.md`
- `docs/architecture.md`

The central design constraint is straightforward:

- keep the current feature breadth
- make optional features truly optional at load time
- move heavy work to demand-driven paths
- keep future plugin and split-view work from multiplying baseline cost

This should be treated as a staged performance program with measurement gates after each phase, not a one-shot refactor.

## Architectural Constraints

Per `docs/architecture.md`, the fixes should follow the existing layering rules rather than bypass them for expedience.

- IO remains behind ports and adapters
- stores remain synchronous and side-effect free
- async orchestration belongs in services
- persistent observation belongs in reactors
- UI triggers go through the action registry

That matters here because most of the regressions are not caused by broken architecture. They are caused by composition granularity and cache ownership. The plan should therefore improve feature boundaries, loading strategy, and state shape without introducing cross-layer shortcuts.

## Review Findings To Incorporate

This plan is directionally correct, but there are a few gaps that should be treated as first-class design constraints during implementation.

### 1. Document caching needs a stable metadata layer, not only viewer-state slimming

The current Phase 2 direction correctly treats heavy document payloads as cache material rather than durable store state.

That said, Carbide's future plugin system and metadata-provider work need a stable metadata surface for files that is not coupled to whether full document content is resident in memory.

Implication:

- do not reduce `DocumentStore` to only transient viewer mechanics and then rediscover metadata needs later
- define document metadata ownership explicitly during the cache refactor
- distinguish durable metadata from evictable payload content up front

Practical requirement:

- keep durable file/document metadata available independently of content eviction
- ensure future APIs such as metadata providers or `metadata.getFileCache(path)` do not depend on keeping full file payloads resident

### 2. Startup optimization should create reusable optional-surface boundaries, not three one-off lazy wrappers

Phase 1 correctly prioritizes lazy-loading terminal, document viewer, and source editor.

However, Carbide's future direction also includes runtime-extensible commands, status bar items, sidebar panels, and other plugin contribution points. If Phase 1 only introduces bespoke lazy wrappers for the current heavy components, the app will likely have to reopen the same composition-root work later when plugin-hosted UI arrives.

Implication:

- treat this as a general optional-surface loading problem, not only a terminal/document/source problem
- reserve host patterns that can support both built-in optional features and future plugin-provided surfaces

Practical requirement:

- keep parent shells small and synchronous
- make optional UI surfaces load through explicit boundaries that can later be reused by plugin-hosted panels and contributions
- avoid reintroducing startup bloat when the plugin system adds dynamic UI

#### Alternatives considered

There are a few viable alternatives, but they are weaker overall for Carbide's combination of performance, modularity, and future extensibility:

- static composition of all optional surfaces at startup
- per-feature ad hoc lazy wrappers with no shared host pattern
- route-level lazy loading only
- conditional rendering without module-level lazy loading
- runtime registries without explicit lazy UI boundaries

Why these are weaker:

- static composition is simplest, but keeps baseline startup cost too high
- ad hoc lazy wrappers help startup, but fragment loading/error/teardown behavior
- route-level splitting is insufficient for a workspace app with many optional surfaces inside one screen
- visibility-only gating reduces mounted work but not baseline bundle/parse cost
- registries alone help extensibility but do not guarantee optional code stays off the default path

#### Recommended direction

The preferred design is a small reusable optional-surface host pattern.

This should not become a large framework. It only needs to provide a consistent boundary for:

- when an optional surface is mounted
- when its module is loaded
- how loading and error states are handled
- how teardown is performed when the surface is no longer needed

This is the best balance for Carbide because it improves:

- efficiency by keeping optional code off the default startup path
- modularity by giving built-in optional features a shared loading contract
- extensibility by giving future plugin-provided panels and other optional UI the same composition mechanism

### 3. Split view needs an explicit capability/profile contract before more editor features land

Phase 3 correctly identifies that the secondary pane should not pay the full editor cost by default.

The risk is that Carbide still has more editor features planned, and the plugin roadmap expects richer editor-mediated contributions over time. Without an explicit contract for what the light profile includes, excludes, or defers, new editor features will drift into split view by default and erase the intended performance win.

Implication:

- "light profile" cannot remain an informal implementation detail
- every editor-adjacent feature should declare whether it is available in light mode, promoted-on-focus only, or disabled for large-note fallback

Practical requirement:

- define a split-view capability matrix up front
- make new editor features and future plugin-mediated editor contributions integrate against that profile policy
- prevent accidental regressions where the secondary pane silently becomes "full editor all the time" again

### 4. Phase 0 needs quantitative gates, not only qualitative goals

The plan describes this as a staged performance program with measurement gates after each phase. That is the right framing.

The acceptance targets should therefore be concrete enough to determine whether a phase actually succeeded. The comparison document already provides a realistic optimization band for emitted client output, so the implementation plan should use explicit numbers rather than only phrases like "reduce materially."

Practical requirement:

- define quantitative bundle targets where possible
- define a measurable startup-surface target for optional dependencies
- use concrete before/after thresholds for the highest-cost regressions rather than qualitative language alone

## Performance Themes

The comparison points to five main problem areas:

1. startup bundle and parse cost
2. eager document loading and retention
3. split view duplicating the full editor stack
4. expensive starred-tree recomputation
5. optional feature code being rooted too close to the main app path

The implementation order should reflect payoff:

1. establish baseline measurement
2. reduce startup surface
3. make document flows demand-driven
4. cheapen split view
5. optimize derived sidebar structures

## Phase 0: Baseline And Guardrails

Before changing behavior, add a repeatable measurement workflow so each later phase can be validated.

### Deliverables

- a documented build measurement routine for `pnpm build`
- tracked emitted client bytes, file count, and largest chunks
- a small runtime measurement checklist for:
  - cold app start
  - opening a large PDF
  - activating split view
  - expanding starred folders in a large vault

### Acceptance Targets

Targets must be quantitative where possible. The comparison document provides the reference numbers.

Bundle targets:

- reduce emitted client output from `11.28 MB` to below `8.3 MB` (realistic band from comparison)
- no single non-worker chunk above `500 kB` in the default startup path
- optional feature dependencies (xterm, pdfjs-dist, mermaid, CodeMirror viewer) must not appear in the main app chunk

Runtime targets:

- cold startup must not load xterm, pdfjs-dist, mermaid, or CodeMirror viewer modules
- PDF text extraction must not run on document open (must require explicit search activation)
- document-tab content must have a defined eviction policy with a configurable inactive-tab limit
- split-view secondary pane must not instantiate the full editor plugin set until focused
- starred-tree derivation must not re-filter the full notes/folder collections per expanded root on every state change

### Notes

This phase does not need elaborate tooling. A small script or written routine is enough as long as the numbers are reproducible.

## Phase 1: Reduce Startup Surface

This is the highest-value phase and should land before deeper runtime tuning.

### Problem

Optional surfaces are statically imported too close to the main app shell:

- `src/lib/app/bootstrap/ui/workspace_layout.svelte`
- `src/lib/features/note/ui/note_editor.svelte`

This pulls terminal, document-viewer, and source-editor machinery into the default path even when unused.

### Plan

#### 1. Introduce explicit lazy component boundaries

Convert the following to dynamic boundaries:

- terminal panel
- document viewer
- source editor

The objective is not only lazy rendering. It is lazy module loading.

#### 2. Separate feature-shell components from heavy implementations

Keep parent UI modules small and synchronous. Heavy implementations should sit behind feature-local lazy wrappers so the import graph clearly communicates optionality.

Likely structure:

- lightweight shell component in the existing UI path
- lazy-loaded implementation component inside the feature slice
- loading and error states owned by the shell

#### 3. Add manual chunking only after the graph is clean

Once static imports are removed from the main path, add targeted Vite manual chunking for:

- `pdfjs-dist`
- xterm-related dependencies
- Mermaid
- viewer-oriented CodeMirror code

Do not start with manual chunking. It should be used to stabilize the result after boundary cleanup, not to mask accidental coupling.

### Architectural Placement

- loading state: component-local or `UIStore` if shared
- no direct adapter calls from components
- no service logic inside lazy wrappers beyond action dispatch

### Plugin System Integration

The optional-surface host pattern introduced here is the same boundary that plugin-contributed UI will use. Per `carbide/plugin_system.md`, the plugin system defines contribution points for:

- sidebar panels (`ui.addSidebarPanel()`)
- status bar items (`ui.addStatusBarItem()`)
- ribbon icons (`ui.addRibbonIcon()`)

Each of these is an optional UI surface that must not inflate the default app path. The lazy boundary pattern from Phase 1 should be designed so that:

- built-in optional panels (terminal, document viewer) and future plugin-provided panels share the same loading/error/teardown contract
- the workspace layout's panel slots accept both statically-known optional surfaces and dynamically-registered plugin surfaces through the same composition mechanism
- adding a new plugin panel never requires modifying the workspace layout's import graph

This prevents reopening the composition-root work when the plugin system ships.

### Expected Wins

- smaller startup JS surface
- lower parse and compile cost
- lower idle memory on non-terminal, non-document, non-source flows
- reusable optional-surface boundaries ready for plugin-hosted UI

## Phase 2: Make Document Handling Demand-Driven

This phase should address both CPU spikes and steady-state memory growth.

### Problem A: PDF search work is eager

`src/lib/features/document/ui/pdf_viewer.svelte` loads the PDF and immediately extracts text for every page. That is the wrong default because search is optional.

### Plan For PDF

#### 1. Separate render path from search-index path

Opening a PDF should only:

- load the document
- render the initial page
- initialize minimal viewer state

It should not extract all text on open.

#### 2. Start extraction only when search is actually used

Trigger text extraction when:

- the search UI opens, or
- the user submits a query

If search is never used, extraction should never run.

#### 3. Cache text lazily per page

Instead of materializing the entire document text eagerly:

- fetch page text on demand
- cache by page number
- reuse cached results across repeated searches while the document is active

#### 4. Leave worker/off-main-thread indexing as a later optimization

Do not over-engineer the first pass. First make extraction lazy. Only move indexing work off the main thread if profiling still shows unacceptable cost after that change.

### Problem B: Document store retains heavy content too long

`src/lib/features/document/application/document_actions.ts` and `src/lib/features/document/state/document_store.svelte.ts` currently treat document content as durable tab state.

That is too expensive for:

- code files
- CSV files
- text files
- restored document sessions

### Plan For Document Content Ownership

#### 1. Split metadata state from content cache

`DocumentStore` should keep only durable viewer metadata such as:

- tab id
- file path
- file type
- zoom
- scroll position
- current PDF page
- lightweight load status

Heavy payloads should move into a document-content cache managed outside the durable store.

#### 2. Introduce a document service/cache layer

Add a document service responsible for:

- loading content on activation
- resolving whether content is present
- evicting inactive content past configured limits
- reloading content when a tab becomes active again

This aligns with the architecture decision tree:

- async load/evict policy belongs in a service
- stores should only hold synchronous state

#### 3. Evict inactive content with explicit policy

Use a simple policy first:

- keep active document content resident
- keep a small number of recent inactive payloads
- evict older or larger payloads

The first version should optimize for explicitness over sophistication.

### Plugin API Reconciliation

The plugin system (`carbide/plugin_system.md`) defines `vault.read(path)` and `metadata.getFileCache(path)` as core plugin APIs. The document cache refactor must reconcile these with content eviction:

- `vault.read(path)` must always go through the port (filesystem IO), not the document content cache. Plugin code cannot know whether content is resident. This operation is inherently async and should not depend on whether a document tab happens to be open.
- `metadata.getFileCache(path)` must return durable metadata (frontmatter, links, headings, tags) independently of whether full file content is cached. The metadata layer must be stable across content eviction cycles.
- `DocumentStore` metadata (tab id, file path, file type, zoom, scroll position, PDF page) is viewer state, not plugin-accessible document metadata. The plugin metadata surface is a separate concern backed by the MetadataCache infrastructure defined in `plugin_system.md` Phase 2.

This distinction prevents two failure modes:

1. plugins silently depending on document content residency and breaking when eviction runs
2. the metadata layer being coupled to the viewer lifecycle instead of the file/vault lifecycle

### Future-Facing Rationale

This design is also the right base for the plugin system. Plugins will need stable document metadata and explicit host APIs, but they should not inherit a model where every open document permanently retains full payloads in shared app state.

## Phase 3: Cheapen Split View

The current split view is correct in behavior but too expensive in implementation strategy.

### Problem

`src/lib/features/split_view/application/split_view_service.ts` creates a second editor store and second editor service, which means the secondary pane pays for the full editor stack.

That cost will grow as Carbide adds more editor-adjacent capability, including future plugin-mediated contributions.

### Plan

#### 1. Define a secondary editor profile

Do not treat the secondary pane as identical to the primary pane by default.

Add an explicit profile policy for the secondary pane:

- light profile on open
- full profile on focus
- fallback behavior for large notes

#### 2. Start with a light profile

The initial light profile can disable or defer the heaviest optional editor behaviors in the secondary pane until the user actively focuses it.

Candidates include:

- rich preview-heavy plugins
- expensive derived structures
- nonessential decorations

#### 3. Promote to full editor on focus

When the secondary pane becomes the active editing target, upgrade it to the full profile. This preserves UX while avoiding unnecessary cost when the split pane is only being used for reference.

#### 4. Define a large-note fallback

For sufficiently large notes, the secondary pane should be allowed to open in a reduced mode such as:

- read-only
- source mode
- text-only fallback

The exact threshold can be decided during implementation, but the policy should exist up front.

### Plugin System Integration

The plugin system expects editor-mediated contributions: content transforms, decorations, metadata providers. Without a profile contract, every plugin-provided editor feature will silently double its cost in split view.

The profile policy must:

- define which plugin contributions are active in light mode vs full mode
- provide a declarative way for plugin-registered editor extensions to specify their profile behavior (e.g., `profile: "full-only"` or `profile: "always"`)
- prevent the secondary pane from accumulating every new editor contribution by default

### Important Constraint

Do not regress the product direction from:

- `carbide/carbide-project-guide.md`
- `carbide/TODO.md`

Document-level split view is still a core capability. The goal is to reduce its incremental cost, not weaken the feature.

## Phase 4: Optimize Starred Tree Derivation

This is lower priority than startup and document fixes, but it should still be addressed because it affects large-vault responsiveness.

### Problem

`src/lib/app/bootstrap/ui/workspace_layout.svelte` rebuilds starred subtree data by repeatedly scanning global note and folder collections for each root.

That scales poorly and duplicates work already conceptually present in the main file-tree domain.

### Plan

#### 1. Build a shared indexed tree representation

Move tree indexing into the folder/file-tree domain so both:

- the main file tree
- the starred tree

can derive from a shared representation.

#### 2. Precompute prefix membership once per tree revision

For each file-tree revision, build the prefix membership/index data once, then derive starred subsets from that structure rather than filtering the full collections repeatedly.

#### 3. Keep starred state incremental

Expanded/collapsed starred nodes should only affect the traversal result, not trigger reconstruction of subtree inputs from scratch.

### Architectural Placement

This belongs in pure domain/derived logic, not in a UI component loop. The component should consume a prepared derived structure instead of rebuilding it ad hoc.

## Phase 5: Validation And Hardening

After the main fixes land, validate the whole result as a coherent system.

### Validation Areas

- production bundle output after each phase
- cold startup behavior
- large PDF open and first-search behavior
- memory growth from many document tabs
- split-view responsiveness and correctness
- large-vault sidebar responsiveness

### Regression Checks

Ensure the improvements identified in the comparison are preserved:

- browse mode still avoids vault-only work
- cheaper vault note counting remains intact
- existing lazy imports for `pdfjs-dist`, Mermaid, `jspdf`, and some CodeMirror support are not accidentally undone

## Testing Plan

Performance work still needs functional tests.

### Add Or Expand Tests For

- lazy feature loading boundaries where practical
- document cache load and eviction policy
- `vault.read()` returns correct content regardless of document cache eviction state
- PDF search activation behavior (extraction must not run until search is opened)
- split-view mode/profile transitions
- starred-tree derivation from shared indexed data

### Test Principles

- deterministic
- focused
- semantically grouped under top-level `tests/`
- no tests that merely assert implementation trivia

Browser-only interactions that are hard to cover in unit tests can remain in manual validation, but the underlying policy and store/service behavior should be unit-tested.

## Recommended Delivery Sequence

1. Baseline instrumentation and quantitative acceptance targets
2. Design reusable optional-surface host pattern (shared by built-in and future plugin panels)
3. Lazy-load terminal, document viewer, and source editor using the host pattern
4. Stabilize chunking in `vite.config.ts`
5. Refactor document state into metadata plus cache ownership; define `vault.read()` as port-level (cache-independent)
6. Make PDF text extraction lazy and query-driven
7. Introduce split-view light profile, focus promotion, and plugin contribution profile policy
8. Refactor starred derivation onto shared indexed tree data
9. Re-measure and update `carbide/implementation/upstream_comparison.md` with actual deltas

## Non-Goals

To keep the work disciplined, this plan should not expand into:

- feature removal
- plugin-system implementation (but the performance work must produce boundaries and contracts that the plugin system can reuse — this is preparation, not implementation)
- an Obsidian-compatibility layer
- broad architecture rewrites
- speculative workerization of every expensive path before measuring the simpler lazy-loading fixes

## Follow-Up Revisions For Existing Roadmap Docs

The performance plan now adds cross-cutting constraints that should also be reflected in the broader Carbide roadmap docs.

### `carbide/TODO.md`

The following sections should be updated so the task tracker reflects the new performance and architecture constraints:

- `Phase 0: Audit & Bootstrap`
  - add performance-baseline and measurement-gate tasks
  - track reproducible bundle/runtime measurement work explicitly instead of leaving it implicit
- `Phase 4: Document Split View`
  - add tasks for a secondary-pane light profile
  - add tasks for focus promotion to full profile
  - add tasks for large-note fallback behavior
  - add tests for profile transitions and split-view cost controls
- `Phase 6: Terminal Panel`
  - add follow-up tasks for lazy-loading and optional-surface isolation
  - add validation tasks for bundle impact after terminal isolation
- `Phase 6e: Editor Feature Ports`
  - add an explicit requirement that new editor features declare split-view profile behavior
  - prevent future editor work from silently bypassing the split-view performance contract
- `Phase 7: In-App Document Viewer`
  - add tasks for splitting durable metadata from evictable content payloads
  - add tasks for lazy PDF text extraction
  - add tasks for document-content eviction policy and activation reload behavior
  - add tests for metadata/cache separation and demand-driven loading
- `Phase 8: Plugin System`
  - add prerequisite tasks or notes for dynamic contribution registries
  - add prerequisite tasks or notes for reusable optional-surface hosting
  - add prerequisite tasks or notes for stable metadata APIs that do not depend on full document content staying resident

### `carbide/carbide-project-guide.md`

The following sections should be updated so the product/architecture guide stays aligned with the performance plan:

- `What We Build New`
  - add the cross-cutting rule that optional features must be optional at load time, not only optional in UI
- `Document Split View`
  - clarify that split view should support a reduced-cost secondary pane profile rather than assuming two always-equivalent full editors
- `Terminal Panel`
  - note that terminal integration should live behind a reusable lazy boundary so terminal dependencies stay off the default startup path
- `In-App Document Viewer`
  - add demand-driven PDF search/extraction expectations
  - add metadata-versus-payload separation expectations
  - add cache/eviction-policy expectations for non-markdown documents
- `Plugin System`
  - note that plugin UI should reuse the same optional-surface host/boundary model as built-in optional panels
  - note that plugin metadata APIs require a stable metadata layer independent of document payload residency
- `What I Need Right Now / Step 2`
  - include the performance architecture work explicitly as a design constraint
  - mention reusable optional-surface boundaries, document metadata ownership, and split-view profile policy
- `Development Timeline`
  - add a cross-cutting performance-hardening step or note that startup-surface and demand-driven-loading work run alongside terminal, document-viewer, and plugin phases

## Bottom Line

The right plan is not to make Carbide smaller by making it less capable. The right plan is to make the app pay for optional capability only when that capability is actually used — and to do so in a way that directly enables the plugin system.

Every performance fix in this plan produces infrastructure the plugin system needs:

- optional-surface boundaries → plugin panel hosting
- document metadata/content split → stable `metadata.getFileCache()` independent of content residency
- cache-independent `vault.read()` → reliable plugin file access regardless of eviction state
- split-view editor profiles → plugin editor contribution profile policy
- demand-driven loading → the same pattern plugin-contributed features must follow

The most important implementation idea is consistent across all phases:

- keep baseline state lightweight
- keep optional code off the default path
- keep heavy work demand-driven
- keep future plugin and split-view development from inflating startup cost by default
- produce reusable boundaries and contracts, not one-off performance patches
