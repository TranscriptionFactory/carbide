# Phase 6 Implementation: Canvas (Excalidraw & JSON Canvas)

This document defines the implementation of a native Carbide canvas feature, supporting both Excalidraw for drawings and JSON Canvas for spatial note arrangement.

## Goal

Ship a functional infinite canvas MVP that allows users to visually arrange notes, images, and drawings, while keeping the data format standard-aligned (JSON Canvas).

## Future-proofing & Interoperability

To ensure Carbide remains the most future-proof implementation in the Markdown ecosystem, the canvas slice follows these mandates:

- **Ecosystem Interoperability:** Use the **JSON Canvas (.canvas)** open specification for all spatial boards. This ensures 1:1 compatibility with Obsidian and other major tools.
- **Data Ownership:** All canvas data is stored as plain JSON, preventing user lock-in.
- **Framework Isolation:** Use a native **Svelte 5 renderer** for the JSON Canvas layer. This avoids the performance and complexity overhead of mixing React into the main Otterly/Carbide runtime.
- **Secure Drawing Host:** Host the **Excalidraw editor** inside a sandboxed iframe. This isolates its React-heavy dependencies and ensures that drawing logic does not interfere with the host app's performance or security.

## What to borrow from Lokus

Lokus serves as a reference for data flow and spatial logic. Carbide borrows:

- **JSON Canvas mapping logic:** Algorithms for node (text, note, file, link) and edge representation.
- **Excalidraw configuration:** The specific theme, fonts, and custom library defaults used in their integration.
- **Spatial Coordinate Logic:** Logic for selection, grouping, and coordinate transformations on an infinite board.
- **Element Portability:** Logic for resolving note paths and file embeds into canvas nodes.

## Current Carbide foundations

- `src/lib/features/document/ui/document_viewer.svelte`: Already handles multi-type viewing; will be extended to dispatch `.canvas` and `.excalidraw` files.
- `src/lib/features/search/db.rs`: Indexing will be extended to crawl JSON Canvas content (text nodes and note references).
- `src-tauri/src/features/search/link_parser.rs`: Will be updated to recognize and rewrite links inside `.canvas` files for rename-safety.

## Canvas Slice architecture

### Frontend

- `src/lib/features/canvas/ports.ts`: Define `CanvasPort` for reading/writing `.canvas` and `.excalidraw` files.
- `src/lib/features/canvas/state/canvas_store.svelte.ts`: Current active canvas state (nodes, edges, metadata).
- `src/lib/features/canvas/application/canvas_service.ts`: Orchestrate canvas operations (create, load, save, node management).
- `src/lib/features/canvas/adapters/canvas_tauri_adapter.ts`: Implement IO via Tauri `fs` commands.
- `src/lib/features/canvas/ui/canvas_viewer.svelte`: The main entry point for canvas documents.
- **`src/lib/features/canvas/ui/json_canvas_renderer.svelte`**: A high-performance, native Svelte 5 renderer for JSON Canvas nodes and edges.
- **`src/lib/features/canvas/ui/excalidraw_host.svelte`**: A sandboxed iframe hosting the Excalidraw drawing environment.

### Backend

- `src-tauri/src/features/canvas/`: Rust-side indexing to ensure canvas text and note references are searchable.

## Data flow

### Initial path

1. `DocumentViewer` identifies a `.canvas` or `.excalidraw` file.
2. `CanvasService` loads the file content through `CanvasPort`.
3. For `.canvas`: The **Svelte renderer** mounts and parses the JSON.
4. For `.excalidraw`: The **iframe host** mounts and initializes the drawing state.

### Update path

1. User moves nodes or draws in the UI.
2. `CanvasService` debounces updates and saves the result to disk.
3. A **Canvas Reactor** watches for note renames in the vault and automatically rewrites references inside `.canvas` files to prevent broken links.


## Integration points

### Frontend composition root

Update:

- `src/lib/app/bootstrap/create_app_stores.ts`
- `src/lib/app/di/app_ports.ts`
- `src/lib/app/create_prod_ports.ts`
- `src/lib/app/di/create_app_context.ts`

### Layout and actions

- Add "New Canvas" and "New Drawing" actions to the file tree and command palette.
- Register `.canvas` and `.excalidraw` extensions in the document viewer dispatch logic.

## Tests

- Canvas store tests (node/edge manipulation).
- JSON Canvas parser/serializer tests.
- Excalidraw data-flow tests.
- Canvas reactor tests (renaming notes should update canvas references).

## Definition of done

Canvas MVP is done when:

- A dedicated canvas slice exists.
- Users can create and edit `.canvas` files with note, text, and file nodes.
- Users can create and edit `.excalidraw` drawings.
- The canvas uses existing document and vault foundations instead of bypassing them.
- Canvas references are rename-safe within the vault.
