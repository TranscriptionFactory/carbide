---
"carbide": patch
---

### Features

- **`@` palette prefix legend**: the `@` command palette now renders a compact legend above the dropdown listing the active prefixes (`#tag`, `[[note]]`, `>cmd`, etc.) so the available routes are discoverable without memorising them. Lives entirely in `at_palette_plugin.ts` + `editor.css`.

- **Task list: truncated section labels with full path on hover**: `task_list_item.svelte` now shows only the leaf segment of a heading-stack section (`Subproject B` instead of `Project A/Subproject B`) and exposes the full ancestry in a native `title` tooltip. Keeps the list scannable for deeply-nested headings.

### Performance

- **Embeddings: f16 weights on Metal + larger batches**: `features/search/embeddings.rs` and `service.rs` load model weights as f16 on Metal devices, run pooling and L2 normalisation on the CPU side, and bump the encode batch size from 16 → 32. Measurable speedup for vault-wide re-embeds without changing output semantics.

### Fixes

- **Editor: `is_canvas_tab` guard survives the minifier**: rewrote the helper in `note_editor.svelte` so the production minifier no longer strips the parens that gated tab-type detection, preventing canvas tabs from being treated as note tabs after a release build.
- **Editor: `active_tab` no longer crashes on transient null**: the deriveds in `note_editor.svelte` that consume `active_tab` now guard against the brief null between `workspace.close_tab` and the next render, fixing the intermittent "Cannot read properties of null" crash when closing the last tab.
- **Vite: unstick override that pinned the workspace to v6**: removed the stale `pnpm.overrides` entry that held `vite` at v6 across the workspace and blocked the v8 upgrade. Drops ~50 transitive duplicates from the lockfile.

### Dependencies

- **Tauri 2.10 → 2.11** with a re-vendored `wry` 0.55.1 patch under `src-tauri/patches/wry-0.55.1/` (replaces the old 0.54.4 patch). `@tauri-apps/*` npm packages aligned to match the Rust side.
- **Vite 8, Vitest 4, TypeScript 6, Svelte plugins 7** (wave 2). Test helpers (`svelte_client_runtime.ts`, plugin RPC tests, `link_repair_fixture.test.ts`) updated for the new APIs.
- **`pdfjs-dist` 4.10 → 6.0** (wave 4) with `pdf_viewer.svelte` and `file_embed_view_plugin.ts` updated for the new worker entrypoint.
- **`@lucide/svelte` + `lucide-static` 0.56 → 1.17** (wave 3); the old per-icon import workaround in `vite.config.ts` is no longer needed.
- **Wave 1 minor/patch npm bumps** across the workspace, plus `pnpm.overrides` moved from `package.json` to `pnpm-workspace.yaml` to satisfy pnpm 10's new placement rule.

### Dev / DX

- **Error handler logs origin object**: the global error/rejection handler in `+layout.svelte` now also calls `console.error` with the original error (in addition to the throttled toast) so a devtools-attached build sees the full stack and cause chain.
- **`tauri.conf.json` formatted**: Prettier-style single-line arrays + trailing newline; no behaviour change.
