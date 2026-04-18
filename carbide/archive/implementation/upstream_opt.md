# Upstream Optimization Implementation Log

## Scope Landed

Implemented the highest-value parts of `carbide/implementation/upstream_comparison_plan.md` with the constraints from:

- `carbide/implementation/upstream_comparison.md`
- `carbide/plugin_system.md`
- `docs/architecture.md`

## What Changed

### 1. Optional surface loading boundaries

Added a reusable optional-surface host in `src/lib/shared/ui/optional_surface.svelte`.

Moved the heavy implementations behind explicit lazy module boundaries:

- `src/lib/features/editor/ui/source_editor.svelte`
- `src/lib/features/document/ui/document_viewer.svelte`
- `src/lib/features/terminal/ui/terminal_panel.svelte`

Concrete heavy implementations now live in:

- `src/lib/features/editor/ui/source_editor_content.svelte`
- `src/lib/features/document/ui/document_viewer_content.svelte`
- `src/lib/features/terminal/ui/terminal_panel_content.svelte`

This keeps the parent shells small and synchronous while moving the expensive modules off the default startup path.

### 2. Bundle measurement and chunking guardrails

Added a reproducible build-measurement script:

- `scripts/measure_build.mjs`

Added a package script:

- `pnpm measure:build`

Added targeted Vite manual chunking for:

- `pdfjs-dist`
- xterm / terminal dependencies
- Mermaid
- CodeMirror / viewer-oriented editor dependencies

Files:

- `vite.config.ts`
- `package.json`

### 3. Document metadata vs payload cache split

Refactored document state so durable viewer metadata is separate from evictable payload content.

`DocumentStore` now owns:

- durable `viewer_states`
- evictable `content_states`
- explicit load/error metadata

Added `DocumentService` to own async document loading and cache eviction policy:

- `src/lib/features/document/application/document_service.ts`

Updated document action flow so opening a document goes through the service, not direct store mutation:

- `src/lib/features/document/application/document_actions.ts`

Updated viewer consumers:

- `src/lib/features/note/ui/note_editor.svelte`
- `src/lib/app/bootstrap/ui/viewer_shell.svelte`

Added a reactor so active/open document tabs keep payload residency synchronized with tab state:

- `src/lib/reactors/document_cache.reactor.svelte.ts`

Wiring updated in:

- `src/lib/app/di/create_app_context.ts`
- `src/lib/reactors/index.ts`
- `src/lib/features/document/index.ts`

### 4. PDF search is now demand-driven

Changed `src/lib/features/document/ui/pdf_viewer.svelte` so:

- opening a PDF no longer extracts all text eagerly
- text extraction starts only when search is actually used
- extracted text is cached per page
- repeated searches reuse cached page text

This removes the eager full-document search-index cost from plain document open.

### 5. Split view now has an explicit secondary profile policy

Added explicit secondary-pane profile state:

- `light`
- `full`
- `large-note-fallback`

Files:

- `src/lib/features/split_view/state/split_view_store.svelte.ts`
- `src/lib/features/split_view/ui/split_note_editor.svelte`

Behavior:

- split view opens in a light profile
- focusing the secondary pane promotes it to full mode
- very large notes stay in explicit reduced fallback mode

This is the first concrete profile contract from Phase 3, so future editor work and plugin-mediated editor contributions have a real policy boundary instead of implicit duplication.

### 6. Starred tree derivation moved onto shared indexed tree data

Extracted starred-tree derivation into pure folder-domain logic:

- `src/lib/features/folder/domain/derive_starred_tree.ts`

Exported through:

- `src/lib/features/folder/index.ts`

Updated workspace layout to derive starred nodes from a shared sorted tree instead of rebuilding subtree inputs per starred root:

- `src/lib/app/bootstrap/ui/workspace_layout.svelte`

This removes repeated note/folder filtering and local subtree reconstruction from the component path.

## Tests Added Or Updated

Added:

- `tests/unit/services/document_service.test.ts`
- `tests/unit/domain/derive_starred_tree.test.ts`

Updated:

- `tests/unit/stores/document_store.test.ts`
- `tests/unit/stores/split_view_store.test.ts`

## Validation Run

Completed successfully:

- `pnpm check`
- `pnpm lint`
- `pnpm test`
- `cd src-tauri && cargo check`
- `pnpm build`
- `pnpm measure:build`

Formatting completed with:

- `pnpm format`

Current measured emitted client output after this pass:

- `9.90 MB` total client JS/CSS/assets counted by `scripts/measure_build.mjs`
- top assets/chunks still dominated by:
  - `pdf.worker` at about `2.11 MB`
  - two large optional/runtime chunks at about `2.30 MB` and `2.17 MB`
  - one additional chunk at about `1.26 MB`

The current implementation establishes the structural boundaries and cache behavior from the plan, but bundle splitting still needs another optimization pass if the goal is to move closer to the comparison doc's realistic `6.3 MB` to `8.3 MB` band.

## Notes

- This is not full plugin-system implementation.
- The work intentionally prepares reusable boundaries for future plugin-hosted optional UI and stable metadata/cache behavior.
- The large remaining follow-up item from the comparison plan is deeper measurement against actual production output deltas after a build.
