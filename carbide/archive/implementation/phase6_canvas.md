# Phase 6 Implementation: Canvas (Excalidraw & JSON Canvas)

This document defines the implementation of a native Carbide canvas feature, supporting both Excalidraw for drawings and JSON Canvas for spatial note arrangement.

## Goal

Ship a functional infinite canvas MVP that allows users to visually arrange notes, images, and drawings, while keeping the data format standard-aligned (JSON Canvas).

## Future-proofing & Interoperability

- **Ecosystem Interoperability:** Use the **JSON Canvas (.canvas)** open specification (v1.0) for all spatial boards. 1:1 compatibility with Obsidian and other major tools.
- **Data Ownership:** All canvas data is stored as plain JSON, preventing user lock-in.
- **Framework Isolation:** Use a native **Svelte 5 renderer** for the JSON Canvas layer. No React in the main runtime.
- **Secure Drawing Host:** Host the **Excalidraw editor** inside a sandboxed iframe with CSP. Isolates React dependencies from the host app.

## What to borrow from Lokus

- **JSON Canvas mapping logic:** Algorithms for node (text, file, link, group) and edge representation.
- **Excalidraw configuration:** Theme, fonts, and custom library defaults.
- **Spatial Coordinate Logic:** Selection, grouping, and coordinate transformations on an infinite board.
- **Element Portability:** Logic for resolving note paths and file embeds into canvas nodes.

## Current Carbide foundations

- `src/lib/features/document/ui/document_viewer.svelte`: Already handles multi-type viewing; will be extended to dispatch `.canvas` and `.excalidraw` files.
- `src/lib/features/search/db.rs`: Indexing will be extended to crawl JSON Canvas content (text nodes and note references).
- `src/lib/features/plugin/ui/plugin_iframe_host.svelte`: Reference implementation for the shared `SandboxedIframe` primitive that Phase 6 depends on.

## Design decisions

### D1 — Rendering approach (review #17)

HTML nodes with CSS `transform` for text/file/link/group nodes. SVG overlay for edges with bezier curves between connection points.

- **Viewport:** A single container div with `transform: translate(x, y) scale(zoom)` applied via CSS. All node positions are in canvas-space; the viewport transform handles pan/zoom.
- **Nodes:** Each node type is a Svelte component rendered as an absolutely-positioned `<div>` inside the viewport container. Native text selection, standard CSS styling, easy composition with existing shadcn primitives.
- **Edges:** An SVG element overlays the viewport container. Edges are `<path>` elements with cubic bezier curves. Connection sides (`top`/`right`/`bottom`/`left`) map to anchor points on node bounding boxes.
- **Why not Canvas2D:** Text selection, accessibility, and Svelte component reuse all require DOM nodes. Canvas2D would need a parallel hit-testing system and custom text rendering.
- **Why not pure SVG:** foreignObject inside SVG has inconsistent browser behavior for rich text. HTML nodes with an SVG edge overlay is the proven pattern (React Flow, tldraw).

### D2 — Excalidraw bundling (review #18)

Vendor Excalidraw as a separate Vite entrypoint, built into a standalone HTML+JS bundle. Serve via `badgerly-excalidraw://` custom protocol (same pattern as `badgerly-plugin://`). No CDN — desktop app, must work offline.

**Build pipeline:**

- New Vite config at `src/excalidraw/vite.config.ts` producing a single `index.html` + JS bundle.
- Output directory: `src-tauri/excalidraw-dist/`. Registered as a Tauri custom protocol in `app/mod.rs`.
- Build step added to the main build script (`pnpm build:excalidraw`).

**postMessage bridge (stateful):**

- `init_scene { scene }` — Host sends initial Excalidraw scene data on iframe load.
- `update_scene { elements, appState }` — Host pushes external changes (theme sync, programmatic edits).
- `on_change { elements, appState }` — Excalidraw sends diffs back on every change.
- `get_scene` / `scene_response { scene }` — Host requests full scene before save; Excalidraw responds.
- `theme_sync { theme }` — Host pushes theme changes.

**Save coordination:**

- Host owns the save timer (debounced, same pattern as note autosave).
- Excalidraw sends `dirty: true` flag with `on_change` events.
- Before save, host sends `get_scene`, waits for `scene_response`, then writes to disk.
- Race guard: host tracks a `save_generation` counter. Stale responses are discarded.

### D3 — Viewport / camera state (review #19)

Canvas store includes `camera: { x: number, y: number, zoom: number }`.

**Persistence:** Sidecar file at `.carbide/canvas_meta/<filename>.json`. Not stored in the `.canvas` file — keeps the spec-compliant file clean of app-specific state.

**Format:**

```json
{ "camera": { "x": 0, "y": 0, "zoom": 1 } }
```

**Lifecycle:** Load on canvas open (fall back to `{ x: 0, y: 0, zoom: 1 }`). Save on canvas close and on debounced viewport change. The sidecar directory is created lazily on first write.

### D4 — Canvas creation flow (review #20)

Follow the existing note creation UX pattern.

- **"New Canvas":** Prompts for filename, creates `<name>.canvas` with content `{ "nodes": [], "edges": [] }`. Opens in the canvas viewer.
- **"New Drawing":** Prompts for filename, creates `<name>.excalidraw` with an empty Excalidraw scene. Opens in the Excalidraw host.
- Both register as actions in the action registry. Surfaced in: command palette, file tree context menu, "New" dropdown.
- File path follows the same rules as note creation (created in the currently selected folder, or vault root).

### D5 — File path semantics (review #21)

Vault-relative paths for all `file` field references in canvas nodes. Matches Obsidian's format for interop.

- Resolution: `<vault_root>/<file_field_value>`.
- The canvas service resolves these relative to the vault root, same as wiki-link resolution.
- When creating a file-type node via drag-and-drop from the file tree, the service computes the vault-relative path from the absolute path.

### D6 — Search indexing (review #22)

Two separate indexing concerns, both handled by `canvas_indexer.rs`:

1. **Full-text indexing:** Extract `text` content from text-type nodes. Index alongside note content in the search DB with a new `canvas_text` source type. Enables omnibar full-text search across canvas content.
2. **Backlinks graph:** Extract `file` field values from file-type nodes as outgoing links. Feed into the existing `LinksStore` / backlinks infrastructure. Canvas files participate in the link graph — opening backlinks for a note shows which canvases reference it.

### D7 — Canvas link extractor (review #23)

New `canvas_link_extractor.rs` (separate from `link_parser.rs`). Parses JSON and extracts:

- `file` references from file-type nodes (vault-relative paths).
- Wiki-links embedded in text-type node content (reuse existing wiki-link regex on the text content).

`link_parser.rs` is untouched — it handles markdown files only. The canvas link extractor is invoked by the canvas indexer and by the canvas reactor for rename rewriting.

### D8 — JSON Canvas spec version (review #24)

Pin to JSON Canvas spec 1.0.

- Rust: `const CANVAS_SPEC_VERSION: &str = "1.0"` in the canvas module.
- TypeScript: `export const CANVAS_SPEC_VERSION = "1.0"` in the canvas feature.
- Parser validates against this version. Unknown fields are preserved on round-trip (forward compat). Unknown node types log a warning and are rendered as inert placeholder nodes.

### D9 — Excalidraw iframe CSP (review #25)

Same sandboxing as the plugin iframe:

```html
<iframe
  sandbox="allow-scripts"
  csp="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; connect-src none;"
/>
```

No network access. All Excalidraw assets (fonts, icons) are bundled in the Vite output.

### D10 — Shared iframe host (review #26)

**Pre-work before Phase 6 milestones.** Extract a generic `SandboxedIframe` component from `plugin_iframe_host.svelte` into `src/lib/shared/ui/sandboxed_iframe.svelte`.

**`SandboxedIframe` responsibilities:**

- Iframe element binding and `bind:this` exposure.
- Origin-scoped `message` event handling: filters by `event.origin` and `event.source`.
- `post_message(message)` method scoped to the iframe's origin.
- CSP attribute passthrough.
- Cleanup on destroy (remove event listeners).

**Consumers:**

- `PluginIframeHost` composes `SandboxedIframe`, adds plugin-specific command dispatch and `badgerly:plugin-command` event handling.
- `ExcalidrawHost` composes `SandboxedIframe`, adds the Excalidraw-specific postMessage bridge (init scene, onChange, get scene, theme sync).

## Canvas slice architecture

### Frontend

```
src/lib/features/canvas/
├── index.ts
├── ports.ts                          # CanvasPort: read/write .canvas and .excalidraw files, camera sidecar
├── state/
│   └── canvas_store.svelte.ts        # Nodes, edges, camera, dirty state, spec version
├── application/
│   ├── canvas_service.ts             # Load, save, create, node/edge CRUD
│   ├── canvas_actions.ts             # Action registry entries
│   └── canvas_constants.ts           # CANVAS_SPEC_VERSION, default camera, empty canvas template
├── domain/
│   ├── canvas_parser.ts              # JSON Canvas parse/serialize with validation
│   ├── canvas_types.ts               # CanvasNode, CanvasEdge, CanvasFile, Camera
│   └── viewport_math.ts             # Pan/zoom/screen-to-canvas coordinate transforms
├── adapters/
│   └── canvas_tauri_adapter.ts       # Tauri IPC adapter implementing CanvasPort
└── ui/
    ├── canvas_viewer.svelte          # Entry point: dispatches to renderer or Excalidraw host
    ├── json_canvas_renderer.svelte   # Viewport container, pan/zoom, node/edge rendering
    ├── nodes/
    │   ├── canvas_text_node.svelte
    │   ├── canvas_file_node.svelte
    │   ├── canvas_link_node.svelte
    │   └── canvas_group_node.svelte
    ├── edges/
    │   └── canvas_edge_renderer.svelte  # SVG overlay with bezier paths
    └── excalidraw_host.svelte        # Composes SandboxedIframe + Excalidraw bridge
```

### Shared

```
src/lib/shared/ui/
└── sandboxed_iframe.svelte           # Generic iframe host (extracted from plugin_iframe_host)
```

### Backend

```
src-tauri/src/features/canvas/
├── mod.rs                            # Command registration
├── canvas_indexer.rs                 # Full-text indexing of text nodes, backlinks from file nodes
└── canvas_link_extractor.rs          # Extract file refs and wiki-links from .canvas JSON
```

### Excalidraw bundle

```
src/excalidraw/
├── vite.config.ts                    # Separate Vite entrypoint
├── index.html                        # Excalidraw app shell
├── main.tsx                          # Excalidraw React mount + postMessage bridge
└── bridge.ts                         # Message protocol types and handlers
```

## Data flow

### Initial path

1. `DocumentViewer` identifies a `.canvas` or `.excalidraw` file.
2. `CanvasService` loads the file content through `CanvasPort`.
3. For `.canvas`: `canvas_parser.ts` validates and deserializes. Store is hydrated. `JsonCanvasRenderer` mounts with viewport restored from sidecar.
4. For `.excalidraw`: `ExcalidrawHost` mounts, loads the iframe via `badgerly-excalidraw://`, sends `init_scene` via postMessage bridge.

### Update path

1. User moves nodes, edits text, draws edges, or draws in Excalidraw.
2. `CanvasService` debounces updates and saves the result to disk via `CanvasPort`.
3. For Excalidraw: host requests `get_scene` before save, waits for `scene_response`, then writes.

### Rename path

1. A note is renamed in the vault.
2. The **Canvas Reactor** watches for rename events.
3. It scans all `.canvas` files using `canvas_link_extractor` logic, rewrites matching `file` references, and saves the updated canvas files.

## Integration points

### Frontend composition root

Update:

- `src/lib/app/bootstrap/create_app_stores.ts` — add `CanvasStore`
- `src/lib/app/di/app_ports.ts` — add `CanvasPort`
- `src/lib/app/create_prod_ports.ts` — add `CanvasTauriAdapter`
- `src/lib/app/di/create_app_context.ts` — wire `CanvasService`, register actions, mount canvas reactor

### Layout and actions

- Add "New Canvas" and "New Drawing" actions to the action registry.
- Surface in command palette, file tree context menu, and "New" dropdown.
- Register `.canvas` and `.excalidraw` extensions in the document viewer dispatch logic.

### Rust registration

- Register `badgerly-excalidraw://` custom protocol in `app/mod.rs`.
- Register canvas indexer commands for search integration.

## Milestones

### Pre-work: Extract shared iframe host

**Scope:** Extract `SandboxedIframe` from `plugin_iframe_host.svelte`. Update `PluginIframeHost` to compose it. Verify no plugin regressions.

**Files:**

- Create: `src/lib/shared/ui/sandboxed_iframe.svelte`
- Modify: `src/lib/features/plugin/ui/plugin_iframe_host.svelte`

**Tests:** Existing plugin iframe tests pass. New unit test for `SandboxedIframe` origin filtering.

**Done when:** `PluginIframeHost` delegates iframe management to `SandboxedIframe`. All existing plugin behavior unchanged.

---

### Milestone 1: Canvas slice skeleton + JSON Canvas parser

**Scope:** Establish the canvas feature slice. Implement JSON Canvas parsing/serialization. Wire creation flow. Register file types in document viewer.

**Files to create:**

- `src/lib/features/canvas/index.ts`
- `src/lib/features/canvas/ports.ts`
- `src/lib/features/canvas/state/canvas_store.svelte.ts` (includes `camera` state)
- `src/lib/features/canvas/application/canvas_service.ts`
- `src/lib/features/canvas/application/canvas_actions.ts`
- `src/lib/features/canvas/application/canvas_constants.ts` (`CANVAS_SPEC_VERSION`, empty templates)
- `src/lib/features/canvas/domain/canvas_parser.ts`
- `src/lib/features/canvas/domain/canvas_types.ts`
- `src/lib/features/canvas/adapters/canvas_tauri_adapter.ts`
- `src/lib/features/canvas/ui/canvas_viewer.svelte`

**Files to modify:**

- `src/lib/app/bootstrap/create_app_stores.ts`
- `src/lib/app/di/app_ports.ts`
- `src/lib/app/create_prod_ports.ts`
- `src/lib/app/di/create_app_context.ts`
- `src/lib/features/document/ui/document_viewer.svelte`

**Tests:**

- `tests/unit/domain/canvas_parser.test.ts` — parse valid canvas, reject malformed, preserve unknown fields, warn on unknown node types.
- `tests/unit/stores/canvas_store.test.ts` — node/edge CRUD, camera state, dirty tracking.
- `tests/unit/services/canvas_service.test.ts` — create canvas, create drawing, load/save round-trip.

**Done when:** "New Canvas" and "New Drawing" create valid files. `.canvas` and `.excalidraw` files open in the document viewer (rendering is a stub at this point). Parser round-trips spec-compliant JSON Canvas files without data loss.

---

### Milestone 2: Svelte 5 canvas renderer

**Scope:** Build the interactive JSON Canvas renderer with pan/zoom, node rendering, edge rendering, and viewport persistence.

**Files to create:**

- `src/lib/features/canvas/ui/json_canvas_renderer.svelte`
- `src/lib/features/canvas/ui/nodes/canvas_text_node.svelte`
- `src/lib/features/canvas/ui/nodes/canvas_file_node.svelte`
- `src/lib/features/canvas/ui/nodes/canvas_link_node.svelte`
- `src/lib/features/canvas/ui/nodes/canvas_group_node.svelte`
- `src/lib/features/canvas/ui/edges/canvas_edge_renderer.svelte`
- `src/lib/features/canvas/domain/viewport_math.ts`

**Behavior:**

- Viewport: mouse wheel zooms, middle-click or space+drag pans. CSS `transform` on the container.
- Nodes: absolutely positioned divs. Click to select, drag to move, corner handles to resize.
- Edges: SVG bezier paths. Connection sides determine anchor points.
- Group nodes render as a labeled container; child nodes inside the group's bounds are visually contained.
- File nodes resolve vault-relative paths and render the file name (preview content is a stretch goal).
- Camera state persists to `.carbide/canvas_meta/<filename>.json` on close and debounced viewport changes. Restored on re-open.

**Tests:**

- `tests/unit/domain/viewport_math.test.ts` — screen-to-canvas transforms, zoom clamping, pan bounds.
- `tests/unit/services/canvas_service.test.ts` — camera persistence save/load round-trip.

**Done when:** Users can view and spatially interact with a JSON Canvas file. Nodes render by type. Edges connect nodes visually. Viewport state survives re-open.

---

### Milestone 3: Excalidraw integration

**Scope:** Bundle Excalidraw, serve via custom protocol, implement the postMessage bridge, wire save coordination.

**Files to create:**

- `src/excalidraw/vite.config.ts`
- `src/excalidraw/index.html`
- `src/excalidraw/main.tsx`
- `src/excalidraw/bridge.ts`
- `src/lib/features/canvas/ui/excalidraw_host.svelte`

**Files to modify:**

- `src-tauri/src/app/mod.rs` — register `badgerly-excalidraw://` custom protocol.
- `package.json` — add `build:excalidraw` script.

**Bridge protocol:**

| Direction         | Message          | Payload                         |
| ----------------- | ---------------- | ------------------------------- |
| Host → Excalidraw | `init_scene`     | `{ scene }`                     |
| Host → Excalidraw | `update_scene`   | `{ elements, appState }`        |
| Host → Excalidraw | `get_scene`      | `{}`                            |
| Host → Excalidraw | `theme_sync`     | `{ theme: "light" \| "dark" }`  |
| Excalidraw → Host | `on_change`      | `{ elements, appState, dirty }` |
| Excalidraw → Host | `scene_response` | `{ scene }`                     |

**Save coordination:**

- Host debounces saves (same interval as note autosave).
- On save trigger: host sends `get_scene`, awaits `scene_response`, writes file.
- `save_generation` counter discards stale responses.

**Tests:**

- `tests/unit/services/excalidraw_bridge.test.ts` — message serialization, save generation guard, dirty tracking.

**Done when:** Users can create and edit `.excalidraw` files. Drawings persist across sessions. Theme syncs with the app theme.

---

### Milestone 4: Search indexing + rename safety

**Scope:** Index canvas content for search. Extract links for backlinks. Ensure rename-safety for note references inside canvas files.

**Files to create:**

- `src-tauri/src/features/canvas/mod.rs`
- `src-tauri/src/features/canvas/canvas_indexer.rs`
- `src-tauri/src/features/canvas/canvas_link_extractor.rs`
- Canvas reactor: `src/lib/reactors/canvas.reactor.svelte.ts`

**Files to modify:**

- `src-tauri/src/app/mod.rs` — register canvas commands.
- `src-tauri/src/features/search/` — add `canvas_text` source type to search DB schema.

**Behavior:**

- `canvas_indexer.rs` parses `.canvas` files, extracts text content from text-type nodes, inserts into the search index with `canvas_text` source type.
- `canvas_link_extractor.rs` extracts `file` references from file-type nodes and wiki-links from text-type node content (reuses existing wiki-link regex).
- Extracted links feed into `LinksStore` as outgoing links. Canvas files appear in backlinks panels.
- Canvas reactor watches note rename events. On rename, scans `.canvas` files for matching `file` references and text-node wiki-links, rewrites them, saves.

**Tests:**

- `tests/unit/db/canvas_indexer.test.ts` — full-text extraction from text nodes.
- `tests/unit/domain/canvas_link_extractor.test.ts` — file ref extraction, wiki-link extraction from text content.
- `tests/unit/reactors/canvas_reactor.test.ts` — rename rewrite: file references updated, non-matching references untouched.
- Rust tests in `src-tauri/src/features/canvas/` — parser, indexer, link extractor.

**Done when:** Canvas text content appears in omnibar search results. Notes referenced by canvas files show canvas backlinks. Renaming a note updates all canvas file references.

## Definition of done

Canvas MVP is complete when all four milestones (plus pre-work) pass their acceptance criteria:

- [ ] **Pre-work:** `SandboxedIframe` extracted; `PluginIframeHost` composes it; no plugin regressions.
- [ ] **M1:** Canvas slice exists. Parser round-trips JSON Canvas. "New Canvas" / "New Drawing" create valid files. Document viewer dispatches `.canvas` and `.excalidraw`.
- [ ] **M2:** Canvas renderer displays nodes by type with pan/zoom. Edges render as bezier curves. Nodes are selectable, draggable, resizable. Viewport persists across sessions.
- [ ] **M3:** Excalidraw loads in sandboxed iframe via custom protocol. postMessage bridge handles init, change, save, and theme. Drawings persist.
- [ ] **M4:** Canvas text is full-text searchable. File references appear as backlinks. Note renames rewrite canvas references.
- [ ] All validation checks pass: `pnpm check`, `pnpm lint`, `pnpm test`, `cargo check`, `pnpm format`.
