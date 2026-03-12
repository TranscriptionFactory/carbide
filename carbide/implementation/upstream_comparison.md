# Upstream HEAD vs Current HEAD: Static Performance Comparison

## Baseline

This repository no longer has an `upstream` remote configured locally, so the comparison baseline is the recorded upstream parent from the merge commit `4d834d3` (`Merge upstream/main: watcher, conflict detection, editor settings, untitled notes fixes`).

- Upstream baseline used here: `334023a725cbd2a02b69d9956e928e72c41a7fe3` (`2026-03-07`, `Bump version to 0.2.0`)
- Current HEAD: `641b251b33a182a804b4428ac3e6533d0ab61d17` (`2026-03-09`, `Allow setting webview zoom in Tauri`)
- Ahead of upstream baseline: `100` commits

This is a static analysis. It uses:

- `git diff` and code inspection across the 100-commit delta
- dependency and feature-surface comparison
- production build output comparison from both revisions

## Executive Summary

The fork is functionally much broader than upstream, but it is materially heavier.

- The client production output grew from about `2.78 MB` to about `11.28 MB` across emitted client files.
- The emitted client file count grew from `24` to `204`.
- The fork now ships two extra multi-megabyte assets in the client build:
  - `pdf.worker.*.mjs` at about `2.21 MB`
  - `DZDWBGLG.js` at about `2.29 MB`
- The largest upstream client bundle was a single route node at about `1.55 MB`; the fork now has many additional 250-470 kB chunks plus the two multi-megabyte artifacts.

Performance-wise, the fork is worse on startup/download cost and likely worse on steady-state memory usage in the editor and document viewing flows. It is better in a few targeted places, especially around not doing vault-only work for browse mode.

The main issue is not that the new features exist. The issue is that several of them are still wired into the main app path too eagerly.

## Measured Build Delta

### Client output

| Revision                    | Client files | Client bytes | Build time |
| --------------------------- | -----------: | -----------: | ---------: |
| Upstream baseline `334023a` |           24 |    2,783,331 |     10.40s |
| Current `HEAD`              |          204 |   11,284,517 |     15.89s |

### Server output

| Revision                    | Server bytes | Build time |
| --------------------------- | -----------: | ---------: |
| Upstream baseline `334023a` |    1,993,618 |     18.13s |
| Current `HEAD`              |    2,237,911 |     25.01s |

### Largest emitted client artifacts at current HEAD

| File                                                               |            Size |
| ------------------------------------------------------------------ | --------------: |
| `.svelte-kit/output/client/_app/immutable/chunks/DZDWBGLG.js`      | 2,290,000 bytes |
| `.svelte-kit/output/client/_app/immutable/assets/pdf.worker.*.mjs` | 2,209,730 bytes |
| `.svelte-kit/output/client/_app/immutable/chunks/C7k81FS8.js`      |   472,995 bytes |
| `.svelte-kit/output/client/_app/immutable/chunks/BtgTlxKO.js`      |   452,861 bytes |
| `.svelte-kit/output/client/_app/immutable/chunks/CyJtwmzi.js`      |   442,413 bytes |

The build also emits Rollup chunk-size warnings at current HEAD.

## What Improved Relative to Upstream

These are real improvements and should not be lost while simplifying:

### 1. Browse mode avoids vault-only work

`src/lib/features/vault/application/vault_service.ts` now cleanly skips dashboard stats, index sync, and vault-scoped settings when the opened folder is in browse mode instead of vault mode. That is a real runtime win for non-vault folders and aligns with the architecture decision tree.

Impact:

- less unnecessary indexing
- less background work on folder-open
- lower IO for browse-only sessions

### 2. Vault note counting is cheaper than the older note-list path

`src-tauri/src/features/vault/service.rs` now uses `WalkDir` to count markdown files instead of going through the full notes listing pipeline just to derive a count.

Impact:

- simpler backend work for vault metadata
- lower allocation pressure than constructing a full note list just to count it

### 3. Some heavy libraries are at least partially lazy

The fork does use dynamic `import()` in a few important places:

- `pdfjs-dist` in `src/lib/features/document/ui/pdf_viewer.svelte`
- `mermaid` in `src/lib/features/editor/adapters/code_block_view_plugin.ts`
- `jspdf` in `src/lib/features/document/domain/pdf_export.ts`
- CodeMirror language support in `src/lib/features/document/ui/code_viewer.svelte`

That is the right direction. The problem is that the component graph is still too eagerly rooted elsewhere, so the overall startup surface is still much larger than upstream.

## Where the Fork Regressed

### 1. Startup and bundle cost regressed sharply

This is the clearest regression.

The fork statically imports optional surfaces directly into the main workspace and editor shells:

- `src/lib/app/bootstrap/ui/workspace_layout.svelte:2-18` (imports TerminalPanel, SplitNoteEditor, and all feature shells at module top level)
- `src/lib/features/note/ui/note_editor.svelte:9-10` (imports DocumentViewer, SourceEditor)
- `src/lib/features/terminal/ui/terminal_panel.svelte:2-5` (imports xterm, addon-fit, tauri-pty, xterm CSS)

The workspace layout imports `TerminalPanel` at module load time even though the terminal is conditional at runtime. `TerminalPanel` itself imports:

- `@xterm/xterm`
- `@xterm/addon-fit`
- `tauri-pty`
- xterm CSS

Those symbols are present in the current large client chunk, which is exactly what the build output suggests: the optional terminal feature is not isolated well enough from the main app startup path.

`NoteEditor` also statically imports `DocumentViewer` and `SourceEditor`, which means the primary editing surface now pulls in document-viewing and alternate-editor machinery through the main note shell.

Design problem:

- optional features are still composed as always-present module dependencies instead of lazy feature boundaries

Practical effect:

- slower startup
- larger initial JS/CSS parse cost
- more memory retained even when users never open terminal, PDF, CSV, or source mode

Plugin system implication:

- the plugin system (`carbide/plugin_system.md`) defines contribution points for sidebar panels, status bar items, and editor contributions — all of which are optional UI surfaces
- if these static import patterns are not resolved before plugin UI arrives, every plugin-contributed panel will inherit the same eager-loading problem
- the fix should establish reusable optional-surface boundaries that both built-in features and future plugin-provided panels can share

Best fix:

1. Lazily load `TerminalPanel`, `DocumentViewer`, and `SourceEditor` with dynamic component boundaries using a shared optional-surface host pattern.
2. Split viewer-only code out of the main note editor path.
3. Add explicit manual chunking for `pdfjs-dist`, xterm, Mermaid, and CodeMirror viewer code if Vite still coalesces them badly.
4. Design the lazy boundary pattern so future plugin-hosted panels and sidebar contributions can reuse the same loading/error/teardown contract.

### 2. Split view duplicates the full editor stack

`src/lib/features/split_view/application/split_view_service.ts:35-54` (`mount_secondary`) creates a second `EditorStore` and second `EditorService`, then mounts a fully independent editor session for the secondary pane.

That is the simplest implementation, but it is expensive because the primary editor already carries a rich plugin set:

- code block views
- Mermaid previews
- image/table toolbars
- wiki-link processing
- outline extraction
- find highlighting

Every split-view session effectively doubles the editor runtime surface for the active workspace.

This is probably acceptable for correctness in the short term, but performance-wise it is a clear step down from upstream, which did not pay this duplicated editor cost.

Design opportunity:

- keep the current UX, but use a cheaper secondary editor profile

Good options:

- disable the heaviest plugins in the secondary pane
- make the secondary pane read-only until focused
- use a text-only or source-only fallback for large notes
- share more derived state instead of recomputing everything in a second full session

Plugin system implication:

- the plugin system expects editor-mediated contributions (decorations, content transforms, metadata providers)
- without an explicit secondary editor profile, every new plugin contribution will silently double its cost when split view is active
- the profile contract needs to exist before plugin-provided editor features land, not after

### 3. PDF viewer eagerly does full-document extraction and keeps it in memory

`src/lib/features/document/ui/pdf_viewer.svelte:55-106` loads the full PDF, renders the first page, then immediately calls `extract_all_text(doc)` (line 80).

That extraction:

- walks every page sequentially
- requests every page text payload
- joins all text into a `pages_text` array
- keeps the result in component state for later search

This is a heavy default for large PDFs, especially because search is optional and may never be used.

The viewer then also performs span-by-span highlight application over the rendered text layer in `apply_highlights`.

Design problem:

- search indexing is eager rather than demand-driven

Practical effect:

- large CPU spike on open for PDFs
- large memory retention for `pages_text`
- slower first-interaction time after opening big PDFs

Best fix:

1. Do not extract all text on open.
2. Start extraction only when the search UI is opened or when the user enters a query.
3. Cache per-page text lazily instead of materializing the whole document at once.
4. Consider offloading extraction/search indexing to a worker if PDF search becomes a core workflow.

### 4. Document viewer state has no eviction strategy

`src/lib/features/document/application/document_actions.ts` (the `document_open` action, lines 18-57) loads document content or asset URLs and stores them in `DocumentStore`.

For text/code/CSV documents, this means the full file content is retained in store state as long as the tab stays alive. The current design is straightforward, but unlike note tabs there is no equivalent cache policy, eviction policy, or size guard.

That matters now because document tabs are persisted and restored alongside note tabs.

Practical effect:

- opening many large documents raises memory steadily
- the app retains payloads longer than necessary
- restored document sessions can repopulate heavy state easily

Plugin system implication:

- the plugin API (`plugin_system.md`) defines `vault.read(path)` for plugins to read file content and `metadata.getFileCache(path)` for cached metadata
- if `DocumentStore` permanently retains full payloads, the plugin system inherits a model where every plugin-opened document bloats memory indefinitely
- conversely, if content is evicted, `vault.read(path)` must be defined to always go through the port (not the cache), since plugin code cannot know whether content is resident
- the metadata/content split must be designed so plugin metadata APIs do not depend on full file payloads staying resident

Best fix:

- treat document content like a cache, not a permanent store payload
- keep metadata in `DocumentStore`, load content on activation, and evict inactive content past a limit
- define `vault.read(path)` as a port-level operation independent of the document content cache, so plugins always get correct results regardless of eviction state

### 5. The starred tree derivation is more expensive than it needs to be

`src/lib/app/bootstrap/ui/workspace_layout.svelte:91-267` rebuilds `starred_nodes` (approximately 175 lines of derived logic) by:

- sorting all starred paths
- repeatedly scanning `stores.notes.notes`
- repeatedly scanning `stores.notes.folder_paths`
- rebuilding and sorting subtree structures per starred folder

This is fine for small vaults, but it is a clear asymptotic regression from upstream because it adds another derived tree-building path on top of the main flattened file tree.

The expensive part is not one individual loop. It is that the same global collections are filtered again for every expanded starred folder root.

Practical effect:

- more recomputation when notes/folders/starred state changes
- more work in exactly the part of the UI users expect to stay instant

Best fix:

- derive starred nodes from a shared indexed tree representation instead of rebuilding subtree inputs ad hoc
- pre-index note/folder membership by prefix once per file-tree revision

### 6. Source editor introduces a second editing implementation with separate state flow

`src/lib/features/note/ui/note_editor.svelte` switches between the visual editor and a completely separate `SourceEditor`.

That is a reasonable product feature, but it adds:

- another editing runtime
- another outline derivation path
- another dirty-state path
- another cursor/scroll persistence mechanism

The build warning from `src/lib/features/editor/ui/source_editor.svelte:34` also indicates the component captures only the initial prop value for `initial_markdown`. That is primarily a correctness warning, but it is also a sign that this second editor path still has integration rough edges.

This is not the most expensive regression in the repo, but it increases maintenance complexity and makes performance tuning harder because there are now two editor pipelines.

Design opportunity:

- define a smaller shared editor-session contract used by both visual and source modes
- avoid duplicating outline, dirty tracking, and persistence logic in parallel code paths

## Secondary Observations

### Dependency surface increased substantially

Compared with the upstream baseline, the fork adds at least these notable runtime dependencies:

- `@xterm/xterm`
- `@xterm/addon-fit`
- `tauri-pty`
- `pdfjs-dist`
- `papaparse`
- `mermaid`
- `jspdf`
- `node-emoji`
- more direct CodeMirror packages

That expansion is justified by feature scope, but it raises the bar for chunking discipline. Right now the code organization has not fully caught up to the dependency weight.

### The current build shows feature-weight concentration

The current build does not just have one larger route node. It has many additional medium-large chunks plus two multi-megabyte artifacts. That usually means the app is paying both:

- broader baseline download cost
- more parse/compile work after navigation

### Terminal feature cost is probably higher than necessary

`src/lib/features/terminal/ui/terminal_panel.svelte:84-126` initializes xterm, FitAddon, a PTY, and a `ResizeObserver` on mount. That is fine when the panel is open. The problem is mainly that the feature is not isolated enough before mount.

## Architectural Read

The repo still broadly follows the architecture document:

- services orchestrate IO
- stores remain synchronous
- actions remain the dispatch surface
- reactors are used for persistence and follow-up effects

The main performance problem is therefore not architectural rule-breaking. It is composition granularity.

The fork adds several correct feature slices, but the composition root currently wires too many of them into the default app path. In other words:

- feature modularity is decent
- feature loading strategy is not yet disciplined enough

That is good news, because the likely fixes are mostly compositional, not fundamental rewrites.

This also matters for the plugin system. The plugin roadmap (`carbide/plugin_system.md`) adds runtime-extensible commands, sidebar panels, status bar items, and editor contributions — all of which are optional surfaces that need explicit loading boundaries. The composition granularity problems identified here are exactly the problems that would compound when plugin-contributed UI arrives. Fixing them now produces infrastructure the plugin system requires.

## Priority Recommendations

### Priority 1: reduce startup surface

Do this first. It has the best payoff.

- lazy-load `TerminalPanel`
- lazy-load `DocumentViewer`
- lazy-load `SourceEditor`
- isolate viewer-only and terminal-only dependencies into separate chunks
- verify chunking after each step with a production build

Expected result:

- biggest immediate win in startup cost
- likely the largest reduction in client output size
- reusable optional-surface boundaries ready for plugin panel hosting

### Priority 2: make document handling demand-driven

- lazy text extraction for PDFs
- lazy document-content loading for inactive tabs
- add document-content eviction policy

Expected result:

- better memory behavior
- fewer CPU spikes for large files
- stable metadata layer for plugin `metadata.getFileCache()` API
- cache-independent `vault.read()` for reliable plugin file access

### Priority 3: cheapen split view

- secondary editor should be a reduced-cost profile
- disable nonessential plugins until focused
- consider read-only or source-mode fallback for large notes

Expected result:

- better responsiveness in split mode
- lower memory and plugin overhead
- explicit profile contract for plugin-provided editor contributions

### Priority 4: stop rebuilding starred subtrees from scratch

- cache prefix membership
- reuse a shared indexed tree
- keep starred rendering incremental

Expected result:

- smoother sidebar behavior in large vaults

## Bottom Line

Relative to the upstream baseline, this fork is more capable but clearly heavier.

The current fork likely performs:

- worse on startup/download/parse cost
- worse on memory usage when split view, terminal, and document viewers are active
- worse on large-PDF open cost
- slightly better for browse-mode folder opens because it avoids vault-only background work

The highest-value design change is not removing features. It is making optional features truly optional at load time.

## Realistic Output-Size Savings Estimate

This section answers a narrower question than the rest of the document:

- not "how close can the fork get to upstream"
- but "how much emitted client output can likely be saved through optimization alone, without cutting features"

### Current measured client output

- Current fork: about `11.28 MB`
- Upstream baseline: about `2.78 MB`

The full `8.5 MB` gap is not a realistic optimization target. A large part of that delta is real feature weight:

- PDF viewing
- PDF worker
- terminal
- Mermaid
- document viewers
- source editor
- expanded editor/plugin surface

### Practical estimate

| Scenario                        |   Likely savings | Resulting client output |
| ------------------------------- | ---------------: | ----------------------: |
| Conservative                    | `2 MB` to `3 MB` |    `8.3 MB` to `9.3 MB` |
| Realistic                       | `3 MB` to `5 MB` |    `6.3 MB` to `8.3 MB` |
| Aggressive without feature cuts | `5 MB` to `6 MB` |    `5.3 MB` to `6.3 MB` |

The realistic planning number is `3 MB` to `5 MB`.

### Why not more?

Some heavy assets are intrinsic to the current feature set.

- The PDF worker asset alone is about `2.21 MB`.
- The terminal stack brings in real `xterm` and PTY-related code.
- Mermaid is large even when loaded lazily because it carries many diagram implementations.

Optimization can move these costs out of the default app path and reduce duplication, but it cannot make them disappear unless the feature set changes.

### Feature-by-feature savings table

| Area                                 | Problem today                                                                                                                |    Realistic savings |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------: |
| Terminal feature isolation           | `TerminalPanel` is imported too close to the main app path, so xterm-related code is retained in a very large shared chunk   | `0.6 MB` to `1.2 MB` |
| Document viewer isolation            | `DocumentViewer` is wired into the primary editor shell, so document-viewer machinery is harder for the bundler to isolate   | `0.4 MB` to `0.8 MB` |
| Source editor isolation              | `SourceEditor` is imported in the main note editor path instead of being a lazy mode boundary                                | `0.2 MB` to `0.5 MB` |
| Mermaid/editor plugin chunking       | Mermaid and related editor tooling are only partially isolated; some shared app chunks still retain too much of that surface | `0.8 MB` to `1.5 MB` |
| Code viewer / CodeMirror viewer path | Viewer-oriented CodeMirror pieces can likely be split more cleanly from the default route                                    | `0.3 MB` to `0.7 MB` |
| Shared route-chunk cleanup           | Better manual chunking and less accidental coalescing across the main route can trim the large shared app chunk              | `0.5 MB` to `1.0 MB` |
| CSS and smaller shared assets        | Secondary cleanup wins after the main chunking work                                                                          | `0.2 MB` to `0.5 MB` |

These ranges overlap somewhat, so they should not be summed mechanically. They describe where the recoverable size is likely hiding, not independent additive buckets.

### What is probably not recoverable without cutting features

- most of the `pdf.worker` asset
- a meaningful part of Mermaid's total footprint
- a meaningful part of xterm's total footprint

Those can be made more lazy and less startup-critical, but they are still shipped if those features remain available in the app.

### Best path to the realistic `3 MB` to `5 MB` win

1. Design a reusable optional-surface host pattern that built-in features and future plugin panels share.
2. Move `TerminalPanel`, `DocumentViewer`, and `SourceEditor` behind explicit lazy boundaries using that pattern.
3. Add manual chunking for PDF, Mermaid, xterm, and viewer-only CodeMirror surfaces.
4. Rebuild and inspect the manifest after each step, rather than doing one large bundling refactor.
5. Stop optional features from being imported by the main editing shell unless active.

If done well, the fork should still remain well above upstream's `2.78 MB`, but it should not need to stay near `11.28 MB`. More importantly, the resulting boundaries are exactly the infrastructure the plugin system needs for dynamic UI contributions.
