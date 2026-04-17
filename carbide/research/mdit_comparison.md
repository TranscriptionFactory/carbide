# Mdit vs Carbide: Comparative Analysis & Port Assessment

**Date:** 2026-04-17
**Source:** `/Users/abir/src/KBM_Notes/mdit/` (Turborepo monorepo — React 19 + Plate.js + Tauri)

---

## Executive Summary

Mdit is a Markdown-first note-taking app built with React 19, Plate.js (Slate), Tauri, and Zustand. Compared to Carbide (SvelteKit 5 + ProseMirror + Tauri), Carbide has stronger architecture (ports/adapters, layering lint, generation-based invalidation, buffer caching) while Mdit has a more mature AI integration and some UX polish worth adopting.

| Area | Winner | Notes |
|---|---|---|
| Architecture | **Carbide** | Ports/adapters, layering lint, action registry |
| Editor session mgmt | **Carbide** | Buffer map, generation counter, diff-apply |
| Markdown pipeline | **Carbide** | Explicit MDAST ↔ PM, greedy mark wrapping, large file threshold |
| Tab management | **Carbide** | Zero-latency switching, structural dirty tracking |
| Layout/UI | **Carbide** | 10 layout variants, activity bar, context rail, terminal |
| Drag & drop | **Carbide** | Section-aware heading drag, structural drop validation |
| AI integration | **Mdit** | Inline menu, streaming, vault tools, multi-provider |
| Graph perf | **Mdit** | Canvas rendering, degradation profiles, edge sampling |
| UX polish | **Mdit** | Focus mode, insert handle, code block language memory |

---

## 1. Draggable Blocks

### Mdit Implementation
- **Library:** `@dnd-kit/react` (external dependency)
- **Architecture:** Plate's `DndPlugin` wraps every block with `<Draggable>` via `render.aboveNodes`
- **Handles:** Two per block — GripVertical (drag) + Plus (insert below)
- **Drag detection:** Pointer events with 4px movement threshold to distinguish click from drag
- **Positioning:** Hard-coded Tailwind `top-*` classes per block type (h1=top-13, h2=top-7, codeBlock=top-1, etc.)
- **Touch:** Detects touch devices, disables context menu
- **Multi-select:** Integrates with `BlockSelectionPlugin` for multi-block operations
- **Context menu:** Right-click on drag handle opens block operations menu

### Carbide Implementation
- **Library:** None (pure ProseMirror plugin)
- **Architecture:** `block_drag_handle_plugin.ts` with native HTML5 drag events
- **Handles:** Single grip handle, 150ms debounced show/hide
- **Section-aware:** Heading drags include all body content until next same-level heading (via heading_fold_plugin)
- **Drop logic:** `resolve_drop_target()` with upper/lower half snap, `apply_block_move()` with stable position math
- **Positioning:** Computed from line-height + padding (dynamic, adaptive)

### Assessment: **Keep Carbide's implementation**

Carbide's section-aware heading drag, pure ProseMirror approach (no external DnD dependency), dynamic handle positioning, and structural drop validation are all superior. Mdit's approach requires an external library and doesn't handle heading sections.

**Small enhancements to adopt:**
- Insert handle (+) next to drag grip for quick block insertion
- Focus mode (auto-hide handles after 4 keystrokes, reset on mouse move)

---

## 2. Block Types

### Mdit has, Carbide doesn't

| Block | Description | Port Priority |
|---|---|---|
| **AI block** | Inline streaming AI node with animated cursor (blue highlight + dot) | **High** — part of inline AI feature |
| **Callout** | Obsidian-style callout syntax (`> [!note]`, `> [!warning]`, etc.) | **Medium** — useful for structured notes |
| **Date picker** | Inline date element with picker UI | Low |
| **Emoji picker** | Emoji Mart integration | Low |
| **Frontmatter table** | Visual YAML key-value editor with type inference | **Medium** — better than raw YAML |
| **Tag inline** | Inline tag elements (not just suggestions) | Low |

### Carbide has, Mdit doesn't

| Block | Description |
|---|---|
| **File embed** | Transclusion (`![[note]]`) with live updates |
| **Excalidraw embed** | Drawing integration |
| **Details block** | Collapsible sections with summary/content |
| **Math block editor** | Dedicated KaTeX editing surface |
| **Canvas** | Full node-edge whiteboard |
| **Image block** | With toolbar, context menu, width control |

---

## 3. Graph Implementation

### Mdit
- **Rendering:** Canvas API (not SVG)
- **Layout:** d3-force — link(80), charge(-1200), center, collide(0.7), x/y(0.05)
- **Size:** Single 19k LOC file (`graph-canvas.tsx`)
- **Performance:**
  - Degradation profiles at 220+ nodes / 800+ edges
  - Reduces tick cap (80-220), edge render limit (500+ min), label visibility
  - Stochastic edge sampling — renders subset, prioritizes unresolved edges
  - Smooth view interpolation (factor 0.24)
- **Node sizing:** `radius = min(6, 2.2 + sqrt(degree) * 0.7)` — visual hierarchy by backlink count
- **Interaction:** Mouse wheel zoom (sensitivity 0.0016), pan, node click → navigation

### Carbide
- **Rendering:** SVG
- **Layout:** d3-force (similar parameters)
- **Architecture:** Well-separated files — `vault_graph_renderer.ts`, `vault_graph_layout.ts`, `spatial_index.ts`, `edge_hit_test.ts`, `geometry.ts`
- **Hit testing:** Spatial tree index for node/edge detection
- **Edge routing:** Bezier curves with accurate proximity detection

### Assessment

Carbide has better code organization. Mdit has critical performance features for large graphs.

**Port candidates:**
- Canvas rendering (SVG → Canvas for perf at scale)
- Degradation profiles for large vaults
- Stochastic edge sampling
- Node radius = f(degree) for visual hierarchy
- Smooth pan/zoom interpolation

---

## 4. Layout / UI / App Shell

### Mdit
- Fixed 3-panel: Sidebar | Editor | Chat Panel
- Modals: Settings, Graph View, Image Preview/Edit, Command Menu
- Touch-aware, platform-specific CSS
- UI lib: `@mdit/ui` (25+ shadcn-style components)

### Carbide
- 10 layout variants (monolith, workbench, hud, zen_deck, theater, triptych, etc.)
- Activity bar + sidebar + editor + context rail + bottom panel
- Virtual file tree with pagination
- Terminal, problems panel, LSP panel, query results
- Dialog system (20+ dialogs)
- Omnibar with semantic search

### Assessment: **Carbide is significantly ahead.** Nothing to port.

---

## 5. AI Integration

### Mdit
- **SDK:** Vercel `ai` v6 with `@ai-sdk/react` hooks
- **Providers:** OpenAI, Anthropic, Gemini, Ollama — unified via `@ai-sdk/*`
- **Inline AI menu:** Selection-anchored popover with model picker, pre-defined + custom commands
- **Streaming:** Real-time chunk insertion into editor nodes with animated cursor
- **AI block:** `AILeaf` renders streaming text with blue highlight + dot cursor animation
- **Chat panel:** Multi-turn sidebar chat with Streamdown markdown rendering
- **Chat tools:** `search_notes`, `edit_note`, `create_note` — AI can interact with vault
- **Custom commands:** User-defined prompt templates stored in localStorage
- **Local server:** Embedded HTTP server for Ollama / MCP protocol

### Carbide
- **Architecture:** AiService + AiStore + AiPort (clean abstraction)
- **Providers:** Generic CLI or API transport
- **Modes:** "edit" (modify content) or "ask" (query only)
- **UI:** AI panel in context rail, diff view for edits
- **Tools:** None — AI can't interact with vault

### Assessment: **Mdit is significantly ahead in AI.**

Carbide's AiPort abstraction is cleaner architecturally, but the feature surface is much thinner. The inline AI menu with streaming insertion is the highest-value port from mdit.

---

## 6. Editor Session & Document Management

### Mdit
- Per-document `content` string in Zustand store, `isSaved` boolean flag
- Multiple editor panes alive in DOM (display: hidden for inactive)
- `sessionEpoch` increment forces editor remount on external file change
- Selection restore via `setTimeout(..., 0)` async deferral
- Tab history: 50-entry per-tab navigation with path updates on rename
- Auto-save: 10s interval + save on blur/close

### Carbide
- `buffer_map` caches EditorState + markdown per tab (zero-latency switching)
- `session_generation` monotonic counter invalidates stale async callbacks
- Dirty tracking via `.eq()` structural doc comparison + markdown diffing
- `apply_markdown_diff()` using `findDiffStart/End` for efficient patching
- `pending_cursor_restore` with markdown_offset + source_offset + scroll_top
- Split view with bidirectional visual ↔ source sync
- Yjs integration (optional, layered) for collaboration
- Large file threshold: 8000 lines / 400KB → skip full scan

### Assessment: **Carbide is significantly ahead.** Nothing to port.

---

## 7. Markdown Pipeline

### Mdit
- Remark plugins: remarkMath, remarkGfm, remarkMdx, remarkMention, remarkFrontmatter, remarkWikiLink, remarkCallout, remarkObsidianCalloutBridge
- Fallback deserialization: MDX → no-MDX → empty paragraph (graceful degradation with logging)
- Frontmatter: Deserializes YAML → key-value rows with auto type inference (string, number, boolean, tags, date)
- Wiki link safety: Rejects Windows paths, parent traversal (`../`), strips extensions
- Image embeds: Extension-based detection, dimension preservation via `hProperties`

### Carbide
- Remark plugins: remarkParse, remarkGfm, remarkMath, remarkFrontmatter(yaml), remarkGemoji, remark_highlight, remark_details
- Explicit MDAST ↔ PM conversion with dedicated `mdast_to_pm.ts` / `pm_to_mdast.ts`
- Mark wrapping: Greedy longest-span algorithm for correct nested mark output
- Embeds: file_embed, excalidraw_embed with parameters (`![[path#page=2&height=400]]`)
- Large file handling: 8000 line / 400KB threshold
- Trailing cleanup: Removes final empty paragraphs

### Assessment: **Carbide is ahead.** One adoption:
- Fallback deserialization chain with diagnostic logging (try parse → fallback → empty doc with warning)

---

## 8. Other Notable Mdit Patterns

### Editor Chunking
```typescript
chunking: { chunkSize: 100, contentVisibilityAuto: true }
```
Uses CSS `content-visibility: auto` to skip rendering off-screen blocks. Worth considering for long documents.

### Code Block Language Memory
When inserting a new code block via slash command, pre-fills language from the last code block in the document.

### Focus Mode
After 4 keystrokes, hides block handles via CSS class. Resets on mouse movement. Reduces visual noise during flow state.

### Pointer Event Precision
Uses pointer events (not mouse events) for cross-device support. Pointer capture for reliable multi-pointer scenarios.

---

## 9. Mdit Technology Stack Reference

| Layer | Technology | Version |
|---|---|---|
| Framework | React 19 | 19.2.4 |
| Editor | Plate.js (on Slate) | 52.3.21+ |
| DnD | @dnd-kit/react | 0.1.21 |
| State | Zustand | — |
| Styling | Tailwind CSS 4.1 | — |
| Desktop | Tauri v2 | 2.10.1 |
| AI SDK | Vercel `ai` | 6.0.91+ |
| Graph | d3-force | 3.0.0 |
| Build | Vite + Turborepo | Vite 8.0.3 |
| Testing | Vitest + Playwright | Vitest 4.1.2 |
| Monorepo | pnpm workspaces | 10.30.0 |
