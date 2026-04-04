# Carbide Lite — Bootstrap Split Plan

**Date:** 2026-04-03  
**Status:** In Progress

## Purpose

This document defines the **first implementation slice** for Carbide Lite: split the current app-layer bootstrap into **full-app** and **lite-app** entrypoints before pruning features.

This is intentionally the first step because it creates a clean architectural seam. Without this seam, Lite would devolve into a large set of `if lite` conditionals spread through the current Carbide shell.

## Current state

The current app bootstrap is centralized around:

- `src/routes/+page.svelte`
- `src/lib/app/di/create_app_context.ts`
- `src/lib/app/action_registry/register_actions.ts`
- `src/lib/reactors/index.ts`
- `src/lib/app/bootstrap/ui/app_shell.svelte`
- `src/lib/app/bootstrap/ui/workspace_layout.svelte`

Today this app layer is effectively a **single full-Carbide product shell**.

### Observed coupling points

#### Bootstrap / composition root

- `create_app_context.ts` constructs nearly all services and plugin/sidebar registrations
- the file is the main composition root and is the right split point

#### Actions

- `register_actions.ts` currently registers the common/full action set
- feature-specific actions are also registered directly in `create_app_context.ts`

#### Reactors

- `src/lib/reactors/index.ts` mounts a broad full-product reactor set
- the reactor context currently assumes many optional features are always present

#### UI shell

- `app_shell.svelte` and `workspace_layout.svelte` represent the current main workspace product
- `workspace_layout.svelte` contains the densest product-level feature composition

## Key decision

The split should happen at the **app layer**, not the feature layer.

### Shared layer stays shared

- `src/lib/features/*`
- shared stores/services/adapters/domain
- shared UI primitives

### Product shell becomes separate

- full app shell/bootstrap
- lite app shell/bootstrap

## Recommended target structure

Keep the existing app internals intact initially, but begin introducing explicit full/lite app-layer modules.

## Proposed structure

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
    create_shared_stores.ts
    shared app boot helpers
```

The exact naming can change, but the main rule is:

> full and lite should each have their own composition-root, action-registration entrypoint, reactor-entrypoint, and shell component.

## Recommended migration strategy

Do this in **two sub-phases**.

### Phase A — Structural extraction with no behavior change

Goal: preserve existing Carbide behavior while creating full/lite app boundaries.

#### Steps

1. Copy/rename the current main app layer into explicit **full** modules
2. Keep the current route booting the full app only
3. Add a parallel lite entrypoint skeleton that is not yet feature-pruned
4. Keep shared code paths as thin helpers where useful

#### Result

The repo now has an explicit product-shell split even before Lite is fully simplified.

### Phase B — Lite pruning

After the split lands:

1. remove unneeded action registration from lite
2. remove unneeded reactor mounting from lite
3. replace the full workspace layout with a lite shell
4. leave full Carbide untouched

## Minimal first refactor

The safest first code move is:

### 1. Duplicate the app shell entrypoints

Create:

- `src/lib/app/full/create_full_app_context.ts`
- `src/lib/app/full/register_full_actions.ts`
- `src/lib/app/full/mount_full_reactors.ts`
- `src/lib/app/full/ui/full_app_shell.svelte`
- `src/lib/app/full/ui/full_workspace_layout.svelte`

### 2. Add lite placeholders

Create:

- `src/lib/app/lite/create_lite_app_context.ts`
- `src/lib/app/lite/register_lite_actions.ts`
- `src/lib/app/lite/mount_lite_reactors.ts`
- `src/lib/app/lite/ui/lite_app_shell.svelte`
- `src/lib/app/lite/ui/lite_workspace_layout.svelte`

Initially these lite files can reuse or proxy to full behavior until the pruning pass begins.

### 3. Keep shared context provider

Keep:

- `src/lib/app/context/app_context.svelte.ts`

This should remain the shared dependency injection boundary consumed by components.

## Routing / boot recommendation

The existing route is:

- `src/routes/+page.svelte`

### Near-term recommendation

Keep `+page.svelte` booting full Carbide until the lite shell exists.

Then introduce one of:

- route-based selection for development
- launch-param-based selection for packaging
- separate Tauri window entry/bootstrap path

The specific packaging path can be deferred. The important part now is creating a **second app bootstrap entrypoint** in code.

## Existing files to treat as "full" by default

These should become the sources for the first full extraction:

- `src/lib/app/di/create_app_context.ts`
- `src/lib/app/action_registry/register_actions.ts`
- `src/lib/reactors/index.ts`
- `src/lib/app/bootstrap/ui/app_shell.svelte`
- `src/lib/app/bootstrap/ui/workspace_layout.svelte`
- `src/lib/app/bootstrap/ui/bottom_panel.svelte`
- `src/lib/app/bootstrap/ui/activity_bar.svelte`

## Lite bootstrap requirements

Lite should eventually keep only the systems needed for:

- markdown editing
- document viewing
- file explorer
- tabs
- starred tabs
- links
- outline
- terminal
- problems

This implies the lite bootstrap should preserve:

- note
- document
- folder
- tab
- editor
- terminal
- links
- outline
- lint/diagnostics
- watcher if needed
- shell/settings basics

## Action-registration split plan

## Current issue

`register_actions.ts` is a monolithic "base/full" registration entrypoint.

## Recommendation

Split into:

- `register_core_actions`
- `register_full_actions`
- `register_lite_actions`

### Core actions should include

- app
- vault
- note
- folder
- tab
- settings
- help
- ui
- shell
- document actions needed for viewer flow
- terminal actions
- lint/problem actions if present

### Full-only actions

- graph
- task
- tags
- plugin
- bases
- reference
- ai
- query
- lsp result actions
- git-heavy UI actions if Lite omits them

## Reactor split plan

## Current issue

`mount_reactors()` in `src/lib/reactors/index.ts` assumes a broad full-product context.

## Recommendation

Split reactors into:

- `mount_core_reactors`
- `mount_full_reactors`
- `mount_lite_reactors`

### Likely core/lite reactors

- editor sync
- editor appearance
- autosave
- op toast
- recent notes persist
- starred persist
- tab dirty sync
- tab persist
- find in file if kept
- backlinks/local links sync
- window title
- file open
- watcher
- document cache
- terminal reconcile
- lint/diagnostics active file

### Likely full-only reactors

- git autocommit/fetch
- graph refresh
- bases refresh
- task sync
- embedding model loaded
- suggested links refresh
- markdown/code LSP lifecycle if Lite does not keep them
- metadata sync
- plugin lifecycle
- reference-library load
- linked source tree
- plugin note indexed
- update-check behavior if products diverge

## UI split plan

The current densest product shell is `workspace_layout.svelte`.

### Recommendation

Do **not** turn `workspace_layout.svelte` into a giant capabilities matrix.

Instead:

- extract the current file to `full_workspace_layout.svelte`
- build a new `lite_workspace_layout.svelte`
- share only smaller presentational subcomponents where that reuse is natural

This keeps the product shells readable.

## Suggested implementation order

### Step 1

Introduce explicit full modules by moving or wrapping current modules:

- full context factory
- full action registration
- full reactor mounting
- full shell/layout

No behavior changes yet.

### Step 2

Add lite module skeletons that compile but temporarily proxy to full internals where needed.

### Step 3

Switch route/bootstrap selection to choose full vs lite entrypoint in development.

### Step 4

Begin Lite pruning:

- simplified activity bar
- simplified context rail
- simplified bottom panel
- simplified sidebar/workspace shell

### Step 5

Prune lite action registration and reactors.

## Risks

### Risk 1 — accidental duplication

If the full/lite split copies too much shared behavior, the app layer will drift.

Mitigation:

- share low-level helpers
- duplicate only product-shell composition

### Risk 2 — optional dependency churn

Making current composition-root dependencies optional too early can create a large compile-time ripple.

Mitigation:

- first create parallel full/lite entrypoints
- only later simplify the lite dependency graph

### Risk 3 — route/packaging premature complexity

Trying to solve packaging at the same time as the bootstrap split will slow the architectural cleanup.

Mitigation:

- first make both app boot paths exist in code
- package later

## Immediate next implementation task

The next code change should be:

> Extract the current app bootstrap into explicit **full-app** modules and add parallel **lite-app** bootstrap placeholders, without changing existing runtime behavior.

That is the cleanest possible starting point for implementing Carbide Lite.

## Implementation progress

Completed on 2026-04-03:

- explicit full/lite boot selection in `src/routes/+page.svelte`
- explicit full/lite composition root selection in `create_app_context.ts`
- explicit full/lite action registration entrypoints
- explicit full/lite reactor mounting entrypoints
- explicit lite shell/layout components that no longer proxy directly to full shell/layout
- first lite UI pruning pass: activity bar limited to explorer/starred/help/settings, context rail limited to links/outline, bottom panel limited to terminal/problems

Remaining in this plan slice:

- prune lite-only action registration once the reduced lite shell no longer references full-only actions
- prune lite-only reactor mounting once removed surfaces are fully disconnected
- trim remaining lite shell reuse such as full dialog wiring where needed
