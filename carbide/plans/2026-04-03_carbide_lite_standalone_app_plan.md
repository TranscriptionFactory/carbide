# Carbide Lite — Standalone Bundled App Plan

**Date:** 2026-04-03  
**Status:** In Progress

## Decision

Carbide Lite should be implemented as a **separate standalone application target inside the same repository**, not as a settings toggle or mode inside the main Carbide app.

This means:

- **same repo**
- **shared feature modules**
- **separate app shell**
- **separate composition root**
- **separate action registration**
- **separate enabled reactors**
- **separate packaging/branding target**

## Why

The product intent for Carbide Lite is:

- stable
- simple
- standalone
- bundled alongside Carbide

That intent conflicts with a hidden-feature mode inside the main app. A mode would tend to:

- inherit feature creep from Carbide
- keep too much runtime coupling
- make startup and behavior harder to reason about
- blur product boundaries

A separate app target gives a harder product boundary while still reusing most of the existing codebase.

## Product definition

Carbide Lite is a **markdown-first local workspace** with lightweight document viewing and essential side panels.

### Keep

- markdown note editing and reading
- file explorer
- tabs
- starred tabs
- links panel
- outline panel
- terminal panel
- problems panel
- non-markdown file viewing already supported by the document system
  - PDF
  - HTML
  - image
  - code/text viewer
  - CSV if already supported

### Remove from Lite

- AI
- graph
- tasks
- tags
- dashboard
- plugin runtime/UI
- bases
- references
- query panel
- LSP results panel
- git-centric UI
- canvas/product surfaces not needed for the lite product

## Architecture direction

Do **not** fork the feature layer. Keep the existing vertical-slice features where possible.

### Shared

- `src/lib/features/*`
- stores, services, ports, adapters, domain logic
- note/editor infrastructure
- document viewer infrastructure
- folder/file-tree logic
- tabs
- terminal implementation
- diagnostics/problems implementation
- links/outline implementation
- shared UI primitives

### Separate for Lite

- app shell
- composition root
- action registration entrypoint
- reactor mounting entrypoint
- branding/window title/menu behavior
- packaging/build target

## Recommended structure

Introduce explicit full-app and lite-app app-layer entrypoints.

Example shape:

```text
src/lib/app/
  full/
    create_full_app_context.ts
    register_full_actions.ts
    mount_full_reactors.ts
    ui/
      full_app_shell.svelte
      full_workspace_layout.svelte

  lite/
    create_lite_app_context.ts
    register_lite_actions.ts
    mount_lite_reactors.ts
    ui/
      lite_app_shell.svelte
      lite_workspace_layout.svelte

  shared/
    app_context.svelte.ts
    common boot helpers
```

The exact folder names can vary, but the split should happen at the **app layer**, not the feature layer.

## Lite composition rules

### Lite composition root should keep

- vault
- note
- folder
- editor
- tab
- shell
- terminal
- document
- links
- outline
- lint/diagnostics
- settings/hotkeys/theme only as required for usability
- watcher if required for note/document freshness

### Lite composition root should not wire

- ai
- graph
- task
- tags
- plugin
- bases
- reference
- query
- separate lsp results surfaces
- git UI/service unless required by some shared code path

## Lite UI shell

### Activity bar

Keep:

- Explorer
- optional Starred sidebar button
- context rail toggle
- Help
- Settings

Remove:

- Dashboard
- Graph
- Tasks
- Tags
- plugin-injected views

### Sidebar

Keep:

- Explorer
- optional Starred tree

Remove:

- Dashboard
- Graph
- Tasks
- Tags
- plugin/bases/reference panels

### Context rail

Keep:

- Links
- Outline

Remove:

- AI
- Meta

### Bottom panel

Keep:

- Terminal
- Problems

Remove:

- Query
- LSP results

## File handling policy

Lite remains markdown-first, but it is **not markdown-only**.

### Primary behavior

- `.md` opens the note editor flow
- supported non-markdown files open through the existing document viewer flow

### Result

Lite keeps the useful reading/viewing abilities of Carbide without inheriting every advanced workspace feature.

## Starred behavior

Lite should keep:

- star/unstar in tabs
- starred persistence

The starred sidebar view is optional. The product requirement is satisfied as long as **starred tabs** remain.

## Problems panel

Problems stays in Lite.

That means Lite must preserve the minimum diagnostics pipeline needed to populate the problems store and panel. The dedicated LSP-results surface should still be removed.

## Recommended implementation milestones

### 1. Create separate app-layer entrypoints

- add lite app shell
- add lite composition root
- add lite action registration
- add lite reactor mounting

### 2. Reuse existing shared features

- keep note/document/tab/terminal/links/outline/lint features
- avoid feature duplication

### 3. Trim the lite shell

- simplified activity bar
- simplified sidebar
- simplified context rail
- simplified bottom panel

### 4. Verify retained workflows

- markdown editing
- PDF viewing
- HTML viewing
- Problems panel
- Terminal panel
- links
- outline
- starred tabs

### 5. Add tests for lite boot and retained flows

- removed surfaces absent
- retained flows work
- removed subsystems do not initialize accidentally

## Immediate implementation starting point

The first implementation step should be to create the **app-layer split**, not to start deleting features from the existing main shell.

### First concrete tasks

1. Extract the current app shell wiring behind a clearer app-layer boundary.
2. Add a new lite entrypoint:
   - lite app context factory
   - lite action registration entrypoint
   - lite reactor mounting entrypoint
   - lite shell/layout component
3. Route one boot path to the lite shell without changing the main Carbide shell behavior.
4. Only then begin pruning Lite’s enabled surfaces.

## Acceptance criteria

- Carbide Lite boots as a separate standalone app target in the repo
- main Carbide behavior is preserved
- Lite shows:
  - explorer
  - markdown editor
  - document viewer
  - links
  - outline
  - terminal
  - problems
  - starred tabs
- Lite does not show:
  - dashboard
  - graph
  - tasks
  - tags
  - plugins
  - bases
  - references
  - query
  - LSP results
- Lite does not unnecessarily initialize removed subsystems

## Conclusion

Implement Carbide Lite as a **second application target sharing the existing feature codebase**, not as a toggle inside the main Carbide UI. The split belongs at the app/bootstrap/composition-root layer.

## Implementation progress

Current repo state on 2026-04-03:

- lite can boot as a distinct app target via `app_target=lite`
- lite now has explicit shell/layout components instead of direct full-shell proxies
- lite activity bar excludes dashboard/graph/tasks/tags/plugin-injected views
- lite context rail excludes AI and metadata
- lite bottom panel excludes query and LSP results
- lite dialog hosting now suppresses full-only surfaces such as git history/checkpoints, canvas creation, quick capture, vault dashboard, and linked-source dialogs
- lite no longer registers git actions in its app-layer action entrypoint, and lite omnibar command availability now hides removed full-product commands
- lite now mounts only the shared/core reactor set, so git/graph/bases/tasks/plugins/references/update-check/LSP/toolchain lifecycle work no longer starts behind the lite shell
- lite bootstrap now skips code-LSP startup, plugin RPC initialization, and built-in plugin sidebar registrations for full-only panels

Still remaining before the product definition is satisfied:

- prune more lite action/service wiring for removed subsystems until the lite composition root only constructs retained capabilities
- verify retained workflows end to end and add focused lite boot/layout tests
