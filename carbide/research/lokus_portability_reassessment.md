# Lokus Portability Reassessment for Carbide

This document revises the earlier Lokus assessment after direct source inspection of `~/src/lokus` and after the rewrite of `carbide/implementation/unified_ferrite_lokus_roadmap.md`.

The goal is not to decide whether Lokus is impressive. It is. The goal is to decide what Carbide should actually borrow, what should only inform design, and whether Lokus should ever replace Otterly as the implementation base.

## Bottom line

- Keep Otterly as the implementation base.
- Keep Lokus as a donor.
- Borrow slightly more from Lokus than earlier assessments suggested, but mostly as design and data-flow input, not as code.
- Do not port Lokus's plugin runtime or security model.
- Do not switch Carbide to Lokus as the base unless the product strategy changes away from architecture discipline and security-first boundaries.

## The decision in one sentence

Lokus is rich enough to be a better donor than a casual feature survey suggests, but it is still too workspace-centric, too globally coupled, and too permissive in its extension model to be a sound base for Carbide.

## What changed from the earlier assessment

The earlier conclusion was directionally right, but too coarse in two places.

1. Graph internals are more portable than just "graph UX inspiration".
2. Bases internals are more portable than just "database view ideas".

At the same time, direct inspection made the plugin and workspace model look worse for Carbide than a high-level read suggested.

## Architecture reality check

Lokus is still structurally broad and horizontally coupled.

The most important evidence is not a single file. It is the way major systems are wired together:

- `src/views/Workspace.jsx` orchestrates graph, save and export, tabs, file operations, session behavior, plugin detail tabs, workspace events, and workspace initialization.
- `src/stores/editorGroups.js` owns split layout, tab state, focus state, cached content, recent files, and graph state in one store.
- `src/bases/BasesContext.jsx` owns Bases lifecycle, active base, active view, data manager access, and query execution inside a React provider.
- `src/plugins/PluginManager.js`, `src/plugins/api/PluginApiManager.js`, and `src/plugins/runtime/PluginRuntime.js` expose a permissive extension model that conflicts directly with Carbide's security roadmap.

This is productive for broad feature shipping. It is not the structure Carbide wants to build on.

## Donor matrix

### Strong donors

These are worth borrowing aggressively as concepts, algorithms, or feature shape.

#### 1. Graph processing pipeline

Best donor files:

- `src/core/graph/GraphDataProcessor.js`
- `src/core/graph/GraphDatabase.js`
- `src/features/graph/hooks/useGraphEngine.js`

What is worth borrowing:

- multi-stage graph build pipeline
- batch processing for large workspaces
- incremental file-content updates
- phantom-node handling and link resolution ideas
- graph-specific stats and cheap metrics where they remain legible

Why this matters:

Lokus has a clearer graph processing model than a typical graph UI project. It separates indexing, extraction, graph updates, and projection well enough to serve as a real architectural donor for Carbide's future `graph` slice.

What not to borrow:

- React hook ownership model in `useGraphEngine`
- graph state living inside `editorGroups`
- workspace boot assumptions from `Workspace.jsx`

#### 2. Bases schema, metadata, and query shape

Best donor files:

- `src/bases/core/BaseSchema.js`
- `src/bases/core/BaseManager.js`
- `src/bases/data/FrontmatterParser.js`
- `src/bases/data/index.js`
- `src/bases/query/QueryExecutor.js`

What is worth borrowing:

- schema-first base definition concepts
- property extraction model from frontmatter
- query syntax and operator ideas
- query execution pipeline and caching concepts
- folder-scoped query filtering concepts

Why this matters:

Lokus has a concrete, inspectable Bases stack. It is not just a UI concept. Carbide should reuse its useful semantics while rebuilding the implementation inside Otterly-native slices.

What not to borrow:

- `.lokus/bases` persistence conventions
- `window.__WORKSPACE_PATH__`
- `BasesProvider` as a React-owned orchestration boundary
- workspace-global assumptions in data and config management

#### 3. Deep customization breadth

Best donor files:

- `src/core/editor/live-settings.js`
- `src/views/Preferences.jsx`

What is worth borrowing:

- settings taxonomy for typography, spacing, highlights, code blocks, tables, and selection
- preference breadth and grouping strategy
- immediate visual feedback as a product goal

Why this matters:

This is still one of the best short-term wins for Carbide. It is visible, differentiating, and mostly compatible with Otterly's current theme and settings architecture.

What not to borrow:

- global singleton settings model
- broad ad hoc CSS mutation without typed ownership

#### 4. Task and board UX patterns

Best donor files:

- `src/components/KanbanBoard.jsx`
- `src/components/TaskCreationModal.jsx`
- `src/editor/extensions/TaskMentionSuggest.js`

What is worth borrowing:

- task capture affordances
- task mention and board selection interactions
- board and task UI ergonomics

Why this matters:

The UX is useful. The underlying model is not the part to port.

What not to borrow:

- task and board initialization tied to workspace boot
- implicit board discovery patterns that assume a single active workspace runtime

### Medium donors

These are useful, but only after translation into Carbide's architecture.

#### 1. Split layout and editor group ergonomics

Best donor files:

- `src/stores/editorGroups.js`
- `src/components/EditorGroup.jsx`

What is worth borrowing:

- practical split and tab behavior ideas
- auto-closing empty groups
- recent files and recently closed tab ergonomics

Why only medium:

The UX is useful, but the state ownership is too broad and too entangled to adopt directly.

#### 2. Folder-scoped Bases and filtered views

Best donor files:

- `src/bases/BasesContext.jsx`
- folder scope related components and hooks

What is worth borrowing:

- local versus broader scope as a user concept
- filtering queries by current scope before rendering a view

Why only medium:

The concept is good. The React provider and workspace-coupled implementation are not.

### Weak or dangerous donors

These should be studied only as cautionary input or taxonomy references.

#### 1. Plugin runtime and plugin security model

Best evidence files:

- `src/plugins/PluginManager.js`
- `src/plugins/api/PluginApiManager.js`
- `src/plugins/runtime/PluginRuntime.js`
- `src/plugins/core/PluginManifest.js`

Why this is a bad donor for Carbide:

- plugins are dynamically imported from disk
- plugin APIs call Tauri `invoke()` directly
- command execution is exposed through plugin APIs
- dangerous permissions like `execute_commands` and even `all` are part of the model
- validation warns about dangerous permissions, but the overall model is still too permissive

This conflicts directly with Carbide's non-negotiables:

- no raw `invoke()` from plugins
- no PTY or arbitrary shell access from plugins
- no mixed trust boundary between plugins, terminal, and command execution

Conclusion:

Borrow permission naming ideas if useful. Do not borrow runtime architecture.

#### 2. Calendar subsystem

Best evidence file:

- `src/services/calendar.js`

Why this is a bad donor for Carbide right now:

- it is a real sync and auth subsystem, not just a calendar view
- it includes Google auth, CalDAV, deduplication, sync state, and desktop-specific behavior
- it expands operational complexity fast

Conclusion:

Do not port this stack. If Carbide needs calendar later, build a simple internal scheduling surface over the task domain first.

#### 3. Workspace bootstrap and global workspace state

Best evidence files:

- `src/views/Workspace.jsx`
- `src/mcp-server/index.js`
- `src/mcp-server/utils/workspaceManager.js`

Why this is a bad donor for Carbide:

- `workspacePath` is a structural assumption, not just a parameter
- major subsystems boot from the active workspace context
- global state and implicit workspace context bleed into many systems

Conclusion:

This is one of the clearest reasons not to adopt Lokus as a base.

## Detailed portability conclusions by subsystem

### Graph

Verdict: port the approach, not the slice.

What Carbide should borrow:

- batch graph build flow
- incremental update pipeline
- phantom and unresolved link handling
- graph-specific stats that are cheap and useful

What Carbide should rebuild:

- all frontend state ownership
- all UI wiring
- integration with links, note lifecycle, and reactors

### Bases

Verdict: reuse semantics aggressively, reimplement architecture completely.

What Carbide should borrow:

- Base schema ideas
- query and filter semantics
- frontmatter extraction model
- folder-scoped filtering concepts

What Carbide should rebuild:

- metadata cache ownership
- persistence conventions
- frontend data flow
- all state and lifecycle wiring

### Customization

Verdict: one of the best early donors.

What Carbide should borrow:

- breadth of settings categories
- preference layout ideas
- live preview expectation

What Carbide should rebuild:

- settings typing
- vault versus global scoping
- host-owned theme application

### Tasks and Kanban

Verdict: UX donor only.

What Carbide should borrow:

- task creation gestures
- board ergonomics
- quick task workflows

What Carbide should rebuild:

- task extraction and indexing
- persistence model
- board derivation from task and metadata layers

### Calendar

Verdict: defer as a product donor, not an implementation donor.

What Carbide should borrow:

- maybe a few scheduling interaction ideas later

What Carbide should not borrow:

- auth flows
- external provider integration
- sync model

### Plugins

Verdict: taxonomy donor, runtime anti-donor.

What Carbide should borrow:

- contribution slot thinking
- manifest classification ideas
- plugin manager UX ideas

What Carbide should rebuild from scratch:

- runtime isolation
- permission enforcement
- host-owned APIs
- command and network mediation

## Should more be ported now?

A little more should be mined from Lokus than the earlier docs suggested.

Specifically:

1. graph processing internals
2. Bases semantics and query model
3. folder-scoped view concepts
4. split ergonomics and tab UX patterns
5. customization breadth

That does not change the implementation strategy. It just sharpens what counts as a useful donor.

## Should Lokus ever replace Otterly as the base?

Not under the current Carbide strategy.

If Carbide switched to Lokus as the base, it would be choosing:

- faster feature breadth over architectural discipline
- weaker extension trust boundaries
- more global runtime assumptions
- a large replay cost for terminal, document, git, and existing Carbide-specific work

That is not a technical shortcut. It is a different product strategy.

### The only scenario where switching bases makes sense

Switching to Lokus only makes sense if Carbide explicitly changes strategy to:

- optimize for maximum feature surface immediately
- accept broader coupling and global state
- accept a looser plugin and command security posture
- deprioritize Otterly's architectural rules

That is not the strategy reflected in the current roadmap. So the answer is no.

## Updated recommendation

Use this decision rule going forward:

- **Port directly only when the logic is local, decoupled, and security-neutral.**
- **Reimplement when the idea is valuable but the ownership model is wrong.**
- **Do not port when the feature depends on global workspace state, direct `invoke()` exposure, or dangerous runtime permissions.**

Applied to Lokus:

- **Port or adapt aggressively:** graph internals, Bases semantics, customization breadth, task UX, folder scope concepts
- **Reimplement cautiously:** split ergonomics, query execution details, board workflows, plugin contribution taxonomy
- **Do not port:** plugin runtime, command-execution exposure, calendar auth and sync stack, workspace bootstrap model

## Recommended study list after this reassessment

If Carbide work continues on the current roadmap, the most valuable Lokus files to keep open are:

1. `src/core/graph/GraphDataProcessor.js`
2. `src/core/graph/GraphDatabase.js`
3. `src/bases/core/BaseSchema.js`
4. `src/bases/query/QueryExecutor.js`
5. `src/bases/data/FrontmatterParser.js`
6. `src/bases/BasesContext.jsx`
7. `src/core/editor/live-settings.js`
8. `src/views/Preferences.jsx`
9. `src/components/KanbanBoard.jsx`
10. `src/components/TaskCreationModal.jsx`

The files to keep open as anti-pattern warnings are:

1. `src/plugins/PluginManager.js`
2. `src/plugins/api/PluginApiManager.js`
3. `src/plugins/runtime/PluginRuntime.js`
4. `src/plugins/core/PluginManifest.js`
5. `src/views/Workspace.jsx`
6. `src/services/calendar.js`
