# Lokus Assessment for Carbide/Otterly

## Scope

This document compares `/Users/abir/src/lokus` and `/Users/abir/src/otterly` with emphasis on the Lokus areas that are most attractive for Carbide:

- graph view
- bases
- extensions
- kanban/tasks
- calendar
- highly customizable UI/editor settings

The goal is not to identify raw code we can copy. The goal is to identify what is worth porting, what should only inform design, and where Otterly already has enough infrastructure that Carbide should build natively on top of it.

## Executive Summary

The main conclusion is simple:

- port the ideas
- do not port most of the code

Lokus is structurally broad and horizontally organized. Otterly is much cleaner and more explicit, with feature slices, ports/adapters, services, stores, reactors, and an action registry. That makes Otterly the better implementation base for Carbide, but it also means most Lokus subsystems are a poor direct transplant.

The best borrow targets are:

1. deeper UI/editor customization
2. graph view concepts and data-flow shape
3. bases architecture and query concepts

The highest-risk direct ports are:

1. plugin/runtime code
2. kanban/task implementation
3. calendar integration and sync stack

## Important Architectural Difference

### Lokus

Lokus concentrates major capabilities into broad horizontal subsystems:

- `src/core/graph/*`
- `src/bases/*`
- `src/plugins/*`
- `src/editor/*`
- `src/stores/editorGroups.js`
- large React screens in `src/views/*`

This gives it feature breadth, but also creates strong coupling between UI, runtime state, and feature implementation.

### Otterly

Otterly follows a stricter vertical-slice model:

- ports + adapters for IO
- sync stores for state
- services for async workflows
- reactors for persistent observation side effects
- action registry as the single dispatch surface

Important composition seams already exist:

- `docs/architecture.md`
- `src/lib/app/di/create_app_context.ts`
- `src/lib/app/orchestration/ui_store.svelte.ts`
- `src/lib/app/bootstrap/ui/workspace_layout.svelte`

This means Carbide should build new capabilities as first-class Otterly feature slices, not as imported Lokus islands.

## What Otterly Already Has

Otterly already overlaps more with Lokus than expected:

- rich Milkdown/ProseMirror editor with internal plugins
- outline panel
- backlinks/outlinks/context rail
- two-pane split editor
- embedded terminal panel
- document viewer for PDF/image/CSV/code/text
- typed settings catalog
- custom theme editing with live theme controls

Relevant Otterly files:

- `src/lib/features/editor/adapters/milkdown_adapter.ts`
- `src/lib/features/editor/application/editor_service.ts`
- `src/lib/features/outline/*`
- `src/lib/features/links/*`
- `src/lib/features/split_view/*`
- `src/lib/features/document/*`
- `src/lib/features/terminal/*`
- `src/lib/features/settings/domain/settings_catalog.ts`
- `src/lib/shared/types/editor_settings.ts`
- `src/lib/features/settings/ui/theme_settings.svelte`

So the real gaps are narrower:

- graph
- bases
- extension runtime
- task domain
- kanban/calendar views
- deeper live editor customization

## Framework and Tooling Comparison

This comparison matters because the “better base” question is not only about features. It is also about the frontend/runtime stack, build tooling, testing posture, dependency surface, and how easy the project will be to keep efficient over time.

### Frontend Framework

#### Lokus

- React 19
- Vite 7
- large JSX component surfaces
- Zustand-style stores plus React contexts
- Radix React primitives
- Tailwind CSS 3

Practical effect:

- broad ecosystem
- lots of existing component and integration options
- easier to find generic examples for advanced UI surfaces
- more runtime indirection and more risk of broad component growth

#### Otterly

- Svelte 5
- SvelteKit 2
- Vite 5
- feature-local stores plus explicit app stores
- bits-ui + shadcn-svelte
- Tailwind CSS 4

Practical effect:

- smaller and more explicit UI runtime model
- stronger alignment with the existing architecture decision tree
- less generic ecosystem breadth than React
- cleaner mental model for tightly integrated desktop app features

#### Verdict

For Carbide’s long-term maintainability, Otterly’s frontend stack is the better fit.

Lokus’s React stack is more ecosystem-rich. Otterly’s Svelte stack is more architecture-friendly and likely easier to keep disciplined.

### Editor Stack

#### Lokus

- custom ProseMirror-based editor stack
- many hand-built editor extensions
- richer surface already present for tasks, embeds, markdown transforms, and UI affordances

Key paths:

- `src/editor/*`
- `src/editor/extensions/*`

#### Otterly

- Milkdown on top of ProseMirror
- internal adapters/plugins for wiki links, outline, slash commands, image paste, code views, tables, and search highlight

Key paths:

- `src/lib/features/editor/*`

#### Verdict

Both are ultimately ProseMirror-family editors, so the editor engine itself is not the deciding factor.

The deciding factor is integration style:

- Lokus: broader editor affordance surface today
- Otterly: cleaner integration model for future plugin host and service boundaries

### State Management and App Composition

#### Lokus

- Zustand-style global stores
- React contexts
- window/global workspace variables
- several singleton-style managers

Examples:

- `src/stores/editorGroups.js`
- `src/core/editor/live-settings.js`
- `src/core/config/store.js`

#### Otterly

- typed Svelte stores
- explicit `UIStore`, feature stores, `OpStore`
- services and reactors define side-effect ownership clearly

Examples:

- `src/lib/app/orchestration/ui_store.svelte.ts`
- `src/lib/app/orchestration/op_store.svelte.ts`
- `src/lib/app/di/create_app_context.ts`

#### Verdict

Otterly’s composition model is substantially more future-proof.

This is one of the strongest reasons not to switch bases.

### Backend / Tauri Surface

#### Lokus

- Tauri 2
- much larger backend dependency surface
- sync, auth, iCal, deep links, audio capture, crash reporting, iroh, MCP, shell/process plugins, platform-specific features

This gives Lokus more platform breadth, but also more operational and maintenance weight.

#### Otterly

- Tauri 2
- narrower Rust dependency surface
- focused on notes, indexing, git, watchers, terminal, document support

This is a leaner backend core and a better place to add Carbide-specific systems deliberately.

#### Verdict

Lokus has the broader platform toolbox today. Otterly has the cleaner backend base for incremental extension.

### Tooling Discipline

#### Lokus

- npm
- Vitest
- Playwright
- ESLint-based frontend linting
- lots of release and cross-platform build scripts

This is stronger on packaging breadth and end-to-end surface.

#### Otterly

- pinned `pnpm`
- TypeScript-first checks
- `svelte-check`
- Vitest
- `oxlint`
- explicit layering lint
- stylelint
- prettier

This is stronger on internal architectural guardrails.

#### Verdict

Lokus has the broader release/build tooling surface. Otterly has the better architecture-governance tooling.

For Carbide, Otterly’s tooling is more valuable because the major risk is architectural drift, not lack of packaging scripts.

### Dependency Surface

#### Lokus

Frontend dependencies include:

- graphology
- react-force-graph
- sigma
- Excalidraw
- isolated-vm
- MCP SDK
- Supabase
- many ProseMirror packages

This is powerful, but it increases baseline complexity and surface area.

#### Otterly

Frontend dependencies are more focused:

- Milkdown
- CodeMirror
- xterm
- pdfjs
- Mermaid
- Svelte UI primitives

Otterly’s current fork is still too heavy in places, but the overall dependency story is narrower and more intentional.

#### Verdict

Otterly has the more future-proof dependency profile. Lokus has the more ambitious all-in-one tooling profile.

### Testing Posture

#### Lokus

- stronger browser/e2e posture via Playwright
- better coverage for product-surface workflows

#### Otterly

- stronger static and architectural validation
- better alignment with clean-slice internal testing

#### Verdict

Lokus currently has the more complete product-surface testing setup. Otterly has the cleaner internal correctness and architecture guardrails.

### Overall Tooling Verdict

If the question is:

> which stack is more immediately feature-rich and tooling-broad?

the answer is Lokus.

If the question is:

> which stack is the better long-term implementation foundation for an efficient and extensible Carbide?

the answer is Otterly.

The short version is:

- Lokus wins on breadth
- Otterly wins on future-proof implementation discipline

## Area-by-Area Assessment

### 1. Graph View

#### Lokus

Graph is a serious subsystem, not just a screen:

- data + processing: `src/core/graph/GraphData.js`
- graph engine hook: `src/features/graph/hooks/useGraphEngine.js`
- large React UI: `src/views/ProfessionalGraphView.jsx`

`GraphData` handles:

- wikilink extraction
- tag extraction
- node/link maintenance
- realtime document updates
- graph metrics
- optional persistence/indexing behavior

#### Otterly

Otterly has the primitives for a graph MVP, but not the feature:

- links/outlinks/backlinks already exist
- search/index ports already exist
- there is no graph store, graph service, graph panel, or graph action surface

Best existing seams:

- `src/lib/features/links/application/links_service.ts`
- `src/lib/features/links/state/links_store.svelte.ts`
- `src/lib/features/outline/state/outline_store.svelte.ts`
- `src/lib/app/di/create_app_context.ts`

#### Recommendation

- **Portability:** adapt, not direct port
- **What to borrow:** data-flow shape, graph feature boundaries, derived metrics ideas
- **What to rewrite:** all UI and state integration

#### Verdict

Graph is a good near-term Carbide feature. It can be built natively on top of Otterly’s existing link/index model.

### 2. Bases

#### Lokus

Bases is the strongest long-term subsystem in Lokus.

Key files:

- `src/bases/core/BaseSchema.js`
- `src/bases/core/BaseManager.js`
- `src/bases/data/FrontmatterParser.js`
- `src/bases/data/index.js`
- `src/bases/query/QueryExecutor.js`
- `src/bases/BasesContext.jsx`
- `src/bases/BasesView.jsx`

Important properties:

- `.base` definitions
- frontmatter-driven metadata extraction
- property types
- filter/query engine
- grouping, sorting, pagination
- multiple view types in the schema, including table, list, gallery, kanban, calendar, timeline, chart

#### Otterly

Otterly does not yet have the foundations bases needs:

- no structured frontmatter metadata layer
- no property/query model
- no schema system
- no table/gallery/kanban/calendar view infrastructure

#### Recommendation

- **Portability:** adapt heavily
- **What to borrow:** schema concepts, query vocabulary, property model, view-model direction
- **What to rewrite:** storage, parsing, UI, and integration into Otterly architecture

#### Verdict

Bases is probably the highest-value subsystem to borrow architecturally, but it is not the first UI feature to ship. It needs metadata and query foundations first.

### 3. Extensions / Plugin System

#### Lokus

Lokus has a broad plugin/extension surface:

- loader/runtime: `src/plugins/PluginManager.js`, `src/plugins/runtime/PluginRuntime.js`
- manifests/schemas: `src/plugins/manifest/*`, `src/plugins/schemas/*`
- security: `src/plugins/security/*`
- registry/install/publishing: `src/plugins/registry/*`
- editor/plugin APIs: `src/plugins/api/*`

Important files:

- `src/plugins/PluginManager.js`
- `src/plugins/api/EditorAPI.js`
- `src/plugins/api/ExtensionManager.js`
- `src/views/PluginSettings.jsx`
- `src/views/Extensions.jsx`

Useful takeaways:

- contribution model
- manifest shape
- permission vocabulary
- editor contribution points
- enable/disable/install mental model

Important caution:

- parts of the marketplace UI still appear semi-productized rather than fully production-hardened
- the implementation is strongly tied to React, Lokus runtime assumptions, and its editor model

#### Otterly

Otterly currently has no user-installable extension runtime:

- no manifest layer
- no registry
- no sandbox/runtime boundary
- no plugin host

Otterly’s current “plugins” are internal editor adapters, not a product extension system.

#### Recommendation

- **Portability:** adapt concepts only
- **What to borrow:** manifest shape, contribution slots, permission ideas, settings/consent UX
- **What to rewrite:** everything runtime-related

#### Verdict

The Lokus plugin architecture is useful as research input for `carbide/plugin_system.md`, but it should not be ported directly.

### 4. Kanban / Tasks

#### Lokus

Lokus tasks are not just Markdown checkboxes. They form an app-level domain.

Key files:

- `src/components/KanbanBoard.jsx`
- `src/components/TaskCreationModal.jsx`
- `src/editor/extensions/TaskCreationTrigger.js`
- `src/editor/extensions/TaskSyntaxHighlight.js`
- `src/components/Calendar/TaskScheduleSidebar.jsx`

Important observations:

- kanban is persisted through Tauri commands
- editor trigger `!task` opens task-creation flow
- task UI links into scheduling/calendar behavior

This is deeper than a visual board over markdown task list items.

#### Otterly

Otterly has:

- task-list syntax support in the editor
- slash command insertion for todo/checklist items

Otterly does not have:

- task entities
- task store/service
- kanban board model
- scheduling metadata
- task extraction/indexing layer

#### Recommendation

- **Portability:** mostly reimplement
- **What to borrow:** UX patterns, task-creation gestures, syntax highlight ideas
- **What to rewrite:** the entire domain model and persistence strategy

#### Verdict

Do not port kanban first. Define a real Carbide task model first, ideally one that can later feed bases and calendar views.

### 5. Calendar

#### Lokus

Calendar is a full subsystem, not just a calendar component.

Key files:

- `src/components/Calendar/CalendarView.jsx`
- `src/components/Calendar/TaskScheduleSidebar.jsx`
- `src/services/calendar.js`

It includes:

- month/week/day views
- event CRUD
- drag/drop
- task scheduling
- CalDAV
- iCal subscriptions
- auth and sync flows

#### Otterly

Otterly has no calendar slice yet.

#### Recommendation

- **Portability:** adapt UI concepts, reimplement actual system
- **What to borrow:** scheduling UX, sidebars, view modes
- **What to defer:** external calendar sync until there is a clear user need

#### Verdict

Full Lokus-style calendar parity is too expensive to port early. Carbide should only consider calendar after tasks or bases provide a strong internal data model.

### 6. UI and Editor Customization

#### Lokus

This is the best short-term source of product inspiration.

Key files:

- `src/views/Preferences.jsx`
- `src/core/editor/live-settings.js`
- `src/core/config/store.js`

Important behavior:

- large multi-section preferences screen
- many live editor controls
- global CSS-variable mutation at runtime
- typography, spacing, list markers, links, highlights, code blocks, blockquotes, tables, selection styling

This is highly visible and product-differentiating.

#### Otterly

Otterly already has a good foundation:

- typed editor settings
- settings catalog
- theme editor
- global vs vault-scoped persistence split

Important Otterly files:

- `src/lib/shared/types/editor_settings.ts`
- `src/lib/features/settings/domain/settings_catalog.ts`
- `src/lib/features/settings/application/settings_service.ts`
- `src/lib/features/settings/ui/theme_settings.svelte`
- `src/lib/features/theme/application/theme_service.ts`

#### Recommendation

- **Portability:** high-value adapt
- **What to borrow:** control depth, live preview philosophy, editor appearance scope
- **What to avoid:** Lokus’s global config model and singleton-style runtime approach

#### Verdict

This is the best near-term Carbide port target. It fits Otterly’s current architecture and yields immediate product value.

## Portability Matrix

| Area | Recommendation | Notes |
| --- | --- | --- |
| Graph | Adapt | Reuse link/index concepts, rewrite as Otterly `graph` slice |
| Bases | Adapt heavily | Strong strategic value, needs metadata/query foundation first |
| Extensions | Adapt concepts only | Borrow manifest/API ideas, reimplement runtime |
| Kanban | Reimplement | Needs task domain first |
| Tasks | Reimplement | Borrow gestures and UX, not internals |
| Calendar | Adapt UI, reimplement system | External sync is expensive and coupled |
| UI/editor customization | Adapt aggressively | Best short-term win |

## Recommended Build Order for Carbide

### Phase 1

- deeper editor/UI customization
- graph MVP

### Phase 2

- metadata/frontmatter foundation
- bases table/list foundation

### Phase 3

- task domain
- kanban view over task/base data
- simple internal calendar/scheduling view

### Phase 4

- plugin host foundation
- manifest, contribution slots, permissions

### Phase 5

- marketplace/distribution
- external calendar sync if still justified

## Product Recommendation

If Carbide wants the most leverage from Lokus without dragging in its coupling, the right strategy is:

- use Lokus as a product/design reference
- use Otterly as the implementation architecture

The order should be:

1. ship visible customization wins
2. ship a graph MVP
3. build bases foundations carefully
4. treat tasks/kanban/calendar as views over a stronger underlying model
5. build the plugin host natively rather than trying to inherit Lokus runtime code

## Base-Switch Decision: Otterly vs Rebuilding on a Lokus Clone

The practical question is whether Carbide should:

1. continue on Otterly and port selected Lokus ideas, or
2. clone Lokus and replay Carbide-specific work such as vault/global settings, CLI AI integration, and terminal improvements onto it

### Recommendation

Carbide should stay on Otterly.

Lokus is the better source of product inspiration. Otterly is the better implementation base.

### Why Otterly Is the Better Long-Term Base

#### 1. Better architectural extensibility

Otterly is structurally cleaner:

- explicit ports/adapters for IO
- synchronous state stores
- service-owned async workflows
- reactors as the only persistent side-effect observers
- a clear composition root in `create_app_context`

That is a better foundation for the next major Carbide systems:

- graph
- bases
- plugin host
- richer metadata surfaces
- task/calendar domains

Lokus has broader subsystems now, but they are more entangled with large React views, global runtime state, and cross-feature assumptions.

#### 2. Better fit for Carbide’s settings and compatibility goals

Carbide already cares about vault-scoped vs global settings, ecosystem compatibility, and future plugin boundaries.

Otterly already supports that direction:

- `src/lib/features/settings/application/settings_service.ts`
- `src/lib/shared/types/editor_settings.ts`
- `src/lib/features/settings/domain/settings_catalog.ts`

Lokus’s config model is much more global and less disciplined. Its `ConfigManager.update(..., target)` ignores the target and writes globally. That is a poor fit for Carbide’s current direction.

#### 3. Better future-proofing for efficiency work

Otterly has current performance issues in this fork, but they are mostly issues of loading strategy and composition boundaries. Those are fixable.

Lokus’s breadth is attractive, but more of its complexity is baked into how the app is organized:

- large workspace shell assumptions
- centralized editor/layout state
- heavy global preferences model
- richer but more entangled task/calendar/plugin systems

That makes Lokus the faster path to breadth, but the weaker path to sustained efficiency and maintainability.

### When Switching to Lokus Would Make Sense

It would only make sense if Carbide’s top priority changed to:

- shipping maximum feature breadth in the shortest time
- accepting more architectural debt
- tolerating a later core refactor

That is a rational demo strategy, but not the best long-term platform strategy.

### Area-by-Area Base Comparison

| Concern | Better Short-Term Surface | Better Long-Term Base |
| --- | --- | --- |
| Graph | Lokus | Otterly |
| Bases | Lokus | Otterly, after foundation work |
| Extensions | Lokus has more surface | Otterly for a clean native host |
| Tasks/Kanban/Calendar | Lokus | Otterly if built on a stronger domain model |
| Vault/global settings | Otterly | Otterly |
| AI CLI integration | roughly neutral | Otterly |
| Terminal panel | roughly neutral | Otterly |
| Future efficiency work | Lokus has more to untangle | Otterly |
| Future extensibility | Lokus has more existing breadth | Otterly |

### Final Verdict

If the question is:

> which app is more future-proof in efficiency and extensibility?

the answer is Otterly.

If the question is:

> which app already has more flashy product surface?

the answer is Lokus.

For Carbide, the right strategy is:

- keep Otterly as the base
- keep using Lokus as a design and systems reference

## Lokus Design and Vault/Workspace Assumptions

Lokus can open Obsidian-style folders and uses “vault” language in some user-facing places, but its actual implementation model is a **single active workspace root**.

That assumption is important because it influences graph, bases, task boards, calendar, plugins, session restore, and MCP integration.

### 1. Singular active workspace assumption

The central runtime assumption is one current workspace path.

Evidence:

- `src/views/Workspace.jsx` receives a single `path`
- `FolderScopeProvider` and `BasesProvider` are both initialized from that one path
- workspace bootstrap writes `window.__WORKSPACE_PATH__ = path`
- many subsystems receive `workspacePath` as a single argument

Examples:

- `src/features/workspace/useWorkspaceSession.js`
- `src/features/workspace/useWorkspaceEvents.js`
- `src/views/Workspace.jsx`

Lokus may track recent workspaces, but it runs one active workspace at a time.

### 2. Workspace identity is root-folder centric

Lokus’s native object is not a multi-root vault graph. It is a directory root treated as the workspace.

Evidence:

- `src/core/vault/vault.js`
- `src/mcp-server/utils/workspaceManager.js`

Notable behaviors:

- local storage stores one current path under `lokus.workspace.path`
- opening or creating a workspace centers everything around that root folder
- a `.lokus` directory is created/ensured inside the workspace root
- a `notes/` folder is created for new workspaces

This is a stronger product opinion than Otterly’s current model.

### 3. “Any directory can become a workspace” assumption

Lokus is permissive about what counts as a workspace.

In `WorkspaceManager.validateWorkspace(...)`:

- a directory with `.lokus` is a confirmed workspace
- a directory with multiple markdown files may be treated as a workspace
- failing that, a valid directory may still be accepted in production

That is convenient UX, but it means the workspace model is not strict.

For Carbide, this has tradeoffs:

- good for importing existing note folders
- weaker guarantees about internal structure
- easier for feature code to silently assume conventions that might not exist

### 4. Internal state is keyed to the current workspace root

A large amount of Lokus behavior keys off the active workspace path:

- session restore and persistence
- file tree
- graph updates
- kanban initialization
- bases provider
- daily note resolution
- MCP workspace context

Examples:

- `invoke("save_session_state", { workspacePath, ... })`
- `invoke("read_workspace_files", { workspacePath })`
- `invoke("initialize_workspace_kanban", { workspacePath: path })`

This is convenient, but it bakes the single-root assumption deeply into the app.

### 5. Bases assume one workspace-local metadata universe

Lokus bases are conceptually workspace-scoped:

- base definitions are associated with the workspace
- frontmatter scanning resolves against the active workspace
- base data managers and base providers are initialized from that root

That makes bases powerful, but it also means:

- no obvious multi-root data model
- no clean separation between one workspace’s metadata universe and another beyond swapping the active root

### 6. Kanban and calendar also assume one active workspace context

Kanban and calendar are not modeled as globally addressable, workspace-agnostic services.

They bind to the active workspace:

- kanban initialization happens on workspace boot
- calendar task scheduling resolves tasks and boards through the current workspace
- task board discovery uses workspace-scoped commands such as `list_kanban_boards`

That means these features are not trivially portable into a multi-vault or mixed-scope architecture.

### 7. MCP and tooling assume one current workspace context

Lokus’s MCP server also leans into a single current workspace model:

- `workspace-context`
- “current workspace”
- automatic workspace detection and setting

This is practical for AI tools, but again reinforces that Lokus is designed around a current-root model rather than a richer vault topology.

### 8. Vault vocabulary is product-facing, workspace vocabulary is implementation-facing

Lokus uses both “vault” and “workspace,” but the implementation is more clearly “workspace-root plus app metadata.”

Examples:

- onboarding says “Configure your vault and preferences”
- internal APIs, managers, and MCP tooling consistently say `workspacePath`

This mismatch is not fatal, but it does matter when evaluating future-proofing:

- product language suggests Obsidian-style flexibility
- implementation is more opinionated and root-centric

### 9. Implication for Carbide

Carbide currently wants:

- strong Markdown/vault compatibility
- explicit vault/global settings boundaries
- future metadata views like graph/base/orphans/homonyms
- a plugin host that aligns with the existing feature-slice architecture

Those goals fit Otterly better than Lokus’s workspace-root assumptions.

Lokus’s assumptions are not wrong. They are just more opinionated:

- one active root
- root-centric services
- global config bias
- broad feature systems built around that assumption

That makes Lokus a strong source of ideas, but a weaker direct base for Carbide.

## Key Reference Files

### Lokus

- `src/core/graph/GraphData.js`
- `src/features/graph/hooks/useGraphEngine.js`
- `src/views/ProfessionalGraphView.jsx`
- `src/bases/core/BaseManager.js`
- `src/bases/core/BaseSchema.js`
- `src/bases/data/index.js`
- `src/bases/query/QueryExecutor.js`
- `src/plugins/PluginManager.js`
- `src/plugins/api/EditorAPI.js`
- `src/views/Preferences.jsx`
- `src/core/editor/live-settings.js`
- `src/components/KanbanBoard.jsx`
- `src/components/Calendar/CalendarView.jsx`
- `src/services/calendar.js`

### Otterly

- `docs/architecture.md`
- `src/lib/app/di/create_app_context.ts`
- `src/lib/app/orchestration/ui_store.svelte.ts`
- `src/lib/app/bootstrap/ui/workspace_layout.svelte`
- `src/lib/features/editor/adapters/milkdown_adapter.ts`
- `src/lib/features/editor/application/editor_service.ts`
- `src/lib/features/settings/domain/settings_catalog.ts`
- `src/lib/shared/types/editor_settings.ts`
- `src/lib/features/settings/ui/theme_settings.svelte`
- `src/lib/features/links/application/links_service.ts`
