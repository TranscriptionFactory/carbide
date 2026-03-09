# Upstream Comparison Performance Plan

## Goal

Implement the performance fixes identified in `carbide/upstream_comparison.md` without cutting the feature direction described in:

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

Targets should be explicit before implementation starts:

- reduce default client output materially from the current baseline
- reduce startup-loaded optional dependency surface
- remove eager full-document PDF text extraction on open
- cap document-tab content retention
- reduce split-view incremental cost
- avoid repeated starred-tree full rescans on every relevant state change

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

### Expected Wins

- smaller startup JS surface
- lower parse and compile cost
- lower idle memory on non-terminal, non-document, non-source flows

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
- PDF search activation behavior
- split-view mode/profile transitions
- starred-tree derivation from shared indexed data

### Test Principles

- deterministic
- focused
- semantically grouped under top-level `tests/`
- no tests that merely assert implementation trivia

Browser-only interactions that are hard to cover in unit tests can remain in manual validation, but the underlying policy and store/service behavior should be unit-tested.

## Recommended Delivery Sequence

1. Baseline instrumentation and acceptance targets
2. Lazy-load terminal, document viewer, and source editor
3. Stabilize chunking in `vite.config.ts`
4. Refactor document state into metadata plus cache ownership
5. Make PDF text extraction lazy and query-driven
6. Introduce split-view light profile and focus promotion
7. Refactor starred derivation onto shared indexed tree data
8. Re-measure and update `carbide/upstream_comparison.md` with actual deltas

## Non-Goals

To keep the work disciplined, this plan should not expand into:

- feature removal
- plugin-system implementation
- an Obsidian-compatibility layer
- broad architecture rewrites
- speculative workerization of every expensive path before measuring the simpler lazy-loading fixes

## Bottom Line

The right plan is not to make Carbide smaller by making it less capable. The right plan is to make the app pay for optional capability only when that capability is actually used.

The most important implementation idea is consistent across all phases:

- keep baseline state lightweight
- keep optional code off the default path
- keep heavy work demand-driven
- keep future plugin and split-view development from inflating startup cost by default
