# Upstream Optimization Second Pass

## Goal

Land the next optimization pass after `carbide/upstream_opt.md`, focusing on the remaining startup regressions without reopening the document-cache, PDF-search, split-view profile, or starred-tree work that already landed.

## Architecture Constraints

Per `docs/architecture.md`:

- ports and adapters own IO boundaries
- stores stay synchronous and side-effect free
- async orchestration belongs in services
- reactors keep persistent side effects
- components should not absorb adapter or service logic just to improve performance

This pass therefore targets import-graph cleanup and lazy adapter composition, not cross-layer shortcuts.

## Current Read

The first pass landed the major structural work:

- optional-surface shells for terminal, document viewer, and source editor
- document metadata vs payload cache split
- demand-driven PDF search extraction
- split-view secondary profile policy
- shared starred-tree derivation

The remaining hot spot is startup/editor bootstrap cost.

Observed before this pass:

- emitted client output remains around `9.9 MB`
- the built app still preloads one very large startup chunk
- `src/lib/app/create_prod_ports.ts` eagerly constructs the Milkdown editor adapter
- runtime imports still go through `src/lib/features/editor/index.ts`, which mixes store/service exports with UI exports and the heavy editor adapter

## Second-Pass Implementation Plan

### 1. Refresh the startup root analysis

- confirm which startup imports still retain the heavy editor graph
- treat startup modulepreloads as a first-class measurement, not only total emitted bytes

### 2. Move editor adapter construction off bootstrap

- replace eager `create_milkdown_editor_port()` composition with a lazy editor-port proxy
- keep the change inside the editor adapter layer so the rest of the app still depends on `EditorPort`
- rely on the existing async `EditorPort.start_session()` contract

### 3. Remove barrel coupling from startup imports

- stop importing runtime editor code from `src/lib/features/editor/index.ts` in startup-path modules
- use direct imports for editor store, service, status bar, and source-editor shell
- keep the editor barrel available where helpful, but remove it from the critical path

### 4. Re-measure before chasing deeper editor plugin splits

- build after the lazy-adapter and barrel cleanup lands
- only do deeper Milkdown/plugin splitting if the startup path is still too large afterward

### 5. Validate against concrete gates

- reduce emitted client output toward the realistic `< 8.3 MB` target band
- eliminate the oversized non-worker startup chunk if possible
- ensure the editor still mounts correctly in primary and split view

## Progress

- [x] Review `carbide/upstream_opt.md` and associated docs
- [x] Confirm current build still has a large startup chunk
- [x] Implement lazy editor-port bootstrap
- [x] Remove the eager Milkdown adapter from the editor feature entrypoint
- [x] Re-measure bundle output
- [x] Run full validation commands

## Implementation Notes

- Started with the smallest architecture-safe change set: keep all cross-feature imports on feature entrypoints, but make the editor feature entrypoint light
- Added `src/lib/features/editor/adapters/lazy_milkdown_adapter.ts`
- Updated `src/lib/features/editor/index.ts` so `create_milkdown_editor_port` now resolves through the lazy adapter instead of statically re-exporting the heavy Milkdown adapter
- Kept `src/lib/app/create_prod_ports.ts` on the public editor/document feature entrypoints so layering rules still pass
- Extended `scripts/measure_build.mjs` to report startup `modulepreload` weight from the built `index.html`
- Added `tests/unit/adapters/lazy_milkdown_adapter.test.ts` to verify deferred load behavior and adapter reuse
- Deliberately did not reopen document cache, PDF worker, or split-view policy in this pass because measurement showed the remaining startup hotspot is the main visual editor runtime, not those already-landed subsystems

## Validation

Completed:

- `pnpm check`
- `pnpm lint`
- `pnpm test`
- `cd src-tauri && cargo check`
- `pnpm build`
- `pnpm measure:build`
- `pnpm format`

`pnpm check` still reports the same two pre-existing Svelte warnings outside this change:

- `src/lib/features/document/ui/pdf_viewer.svelte`
- `src/lib/features/editor/ui/source_editor_content.svelte`

No new type or lint failures were introduced.

## Measured Result

Latest `pnpm measure:build` output:

- emitted client total: `9.90 MB`
- startup `modulepreload` total: `2.25 MB`
- largest startup preload: `2.17 MB`

Largest emitted artifacts after this pass:

- `chunks/BtMZdyVh.js` — `2.30 MB`
- `chunks/LEDuwk4L.js` — `2.17 MB`
- `assets/pdf.worker.*.mjs` — `2.11 MB`

Important interpretation:

- total emitted bytes barely changed
- startup preload weight improved materially
- the previously observed `4.48 MB` startup-preloaded chunk is no longer the cold-start anchor
- the remaining startup hotspot is now the base visual-editor runtime chunk, not the optional Mermaid/KaTeX chunk

Chunk inspection after the pass shows:

- startup-preloaded `LEDuwk4L.js` is dominated by core `milkdown` and `codemirror`
- non-startup `BtMZdyVh.js` holds `mermaid` and `katex`
- `xterm` remains isolated in its own chunk
- `pdf.worker` remains a large emitted asset but is not part of the startup preload set

## What This Pass Achieved

- removed the eager Milkdown adapter from app bootstrap
- preserved architecture and layering rules
- added a reproducible startup-preload measurement so future passes can optimize for actual cold-start cost instead of only total emitted bytes

## Remaining Follow-Up

The next optimization pass, if we do one, should target the main editor runtime itself:

- split optional Milkdown/editor enrichments from the base visual editor where feasible
- verify whether code-block, syntax, or other editor-only enhancements can become more demand-driven
- use the new startup-preload measurement as the acceptance gate, not total emitted bytes alone
