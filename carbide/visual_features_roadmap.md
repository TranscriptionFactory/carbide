# Visual Features Roadmap

**Date:** 2026-05-12
**Scope:** Four high-value visual features, ordered by implementation phase

---

## Overview

| Phase | Feature | Effort | Key Leverage |
|-------|---------|--------|--------------|
| 1 | Bases: Kanban / Gallery / Calendar views | Medium | Turns table into flexible workspace; reuses existing query engine |
| 2 | Graph: Cluster detection + Focus mode | Medium | Makes vault graph actionable instead of decorative |
| 3 | Canvas: Note embedding in file nodes | Low-Medium | Makes canvas a spatial thinking tool, not just boxes with names |
| 4 | Canvas: Auto-layout from graph | Low | Bridges graph → canvas; highest value when combined with Phase 3 |

---

## Phase 1 — Bases: Kanban / Gallery / Calendar Views

### Current State

- `BasesStore.active_view_mode` supports `"table" | "list"`
- `BaseViewDefinition.view_mode` persists as `"table" | "list"` in saved views
- `bases_panel.svelte` (~880 lines) handles view switching, filtering, and result display
- `bases_table.svelte` renders dynamic columns from `BaseNoteRow[]`
- Query engine in Rust is powerful: filters on frontmatter properties, tags, tasks, FTS, with pagination
- `PropertyInfo` provides `unique_values` (capped at 20) for low-cardinality properties — directly usable for kanban columns
- `BaseNoteRow` has `properties`, `tags`, `stats` (including `next_due_date`) — all needed for alternate views

### Design

Extend `active_view_mode` to `"table" | "list" | "kanban" | "gallery" | "calendar"`. Each view is a Svelte component receiving the same `BaseNoteRow[]` result set.

#### 1a. Kanban View

**Concept:** Group notes into columns by a user-chosen property (status, tag, priority, or any frontmatter key). Drag between columns = update that property's value in frontmatter.

**Data flow:**
- User picks a "group by" property from `available_properties`
- Group `result_set` rows by that property's value → `Map<string, BaseNoteRow[]>`
- Columns ordered by `PropertyInfo.unique_values` (or alphabetically)
- Uncategorized notes go to an "Unset" column

**New types:**
```typescript
// In bases domain
type KanbanConfig = {
  group_by: string;           // property name to group by
  column_order?: string[];    // optional manual column ordering
};
```

**UI component:** `bases_kanban.svelte`
- Horizontal scroll container of columns
- Each column: header (property value + count) + vertical list of note cards
- Cards show: title, 2-3 preview properties, tags, task progress
- Drag-and-drop between columns (use native drag API or a small lib)
- Drop = call a new `BasesPort.update_property(vault_id, note_path, key, new_value)` → Rust writes frontmatter

**Backend work:**
- New Tauri command: `bases_update_property(vault_id, note_path, key, value)` — reads note, parses YAML frontmatter, updates key, writes back atomically
- This is the only new Rust work; everything else is frontend

**Store additions:**
```typescript
// BasesStore
kanban_config: KanbanConfig | null;
```

**Persistence:** Add `kanban_config` to `BaseViewDefinition` (optional). Saved views remember their grouping.

#### 1b. Gallery View

**Concept:** Card grid showing each note as a visual card with title, first image (if any), opening paragraph snippet, and key properties.

**Data flow:**
- Same `result_set` as table, rendered as CSS grid of cards
- First image: either extract from note content at query time (new) or show a placeholder
- Snippet: first ~100 chars of content (can reuse FTS snippet if available, or add a `snippet` field to `BaseNoteRow`)

**Backend consideration:** To show first image + snippet without reading full note content for every result:
- Option A: Add `first_image` and `snippet` columns to the notes table during indexing (preferred — index-time cost, zero query-time cost)
- Option B: Lazy-load per card on mount (simpler but slower for large result sets)
- Recommend Option A: extract during `insert_note` in `db.rs`, store alongside existing `word_count` etc.

**UI component:** `bases_gallery.svelte`
- CSS grid, responsive columns (auto-fill, minmax ~240px)
- Card: image area (aspect ratio container) + title + property chips + tag pills
- Click to open note

**New fields (Rust indexing):**
```rust
// In notes table or a new note_previews table
first_image_path: Option<String>,  // relative path to first image in note
content_snippet: Option<String>,   // first ~150 chars, stripped of markdown
```

#### 1c. Calendar View

**Concept:** Place notes on a month calendar by a date property. Default to `next_due_date` (from tasks), but allow picking any date-typed frontmatter property (e.g., `created`, `deadline`, `published`).

**Data flow:**
- User picks a date property
- Query with sort by that date property
- Render month grid; place note titles in day cells
- Navigate months; clicking a day filters to that date

**UI component:** `bases_calendar.svelte`
- Month grid (7 columns × 5-6 rows)
- Each cell: day number + stacked note titles (truncated, max ~3 visible with "+N more")
- Month navigation arrows
- Highlight today
- Click note title → open note
- Click day → filter bases to that date

**No backend work required** — dates already available as properties or `next_due_date` in `NoteStats`.

### Implementation Steps

1. [x] Extend `active_view_mode` type union + `BaseViewDefinition` schema — add kanban/gallery/calendar
2. [x] Add view mode switcher UI (icon buttons in panel header) — verify: modes toggle correctly
3. [x] **Kanban:**
   - [x] `bases_kanban.svelte` — grouping logic + column layout — verify: columns render from grouped data
   - [x] Drag-and-drop between columns — verify: cards move visually
   - [x] `bases_update_property` Tauri command — verify: frontmatter updates on disk
   - [x] Wire drop → property update → re-query — verify: card persists in new column after refresh
4. [x] **Gallery:**
   - [x] Add `content_snippet` + `first_image_path` to indexing pipeline — verify: fields populated on reindex
   - [x] Extend `BaseNoteRow` / query to include new fields — verify: fields returned from Rust
   - [x] `bases_gallery.svelte` — card grid — verify: renders with images and snippets
5. [x] **Calendar:**
   - [x] `bases_calendar.svelte` — month grid with note placement — verify: notes appear on correct days
   - [x] Month navigation + date property picker — verify: navigating months shows different notes
6. [x] Update saved view serialization to include view-specific config (kanban grouping, calendar date field)
7. [x] Tests: store grouping logic, property update round-trip, calendar date bucketing

---

## Phase 2 — Graph: Cluster Detection + Focus Mode

### Current State

- Vault graph uses **Pixi.js + D3 force simulation** in a Web Worker
- Force params: link distance 80, charge -200, collision radius 20
- Already has folder-based grouping with convex hull rendering in `vault_graph_renderer.ts`
- `SearchGraphStore` supports per-tab instances with expansion
- Degradation system handles large vaults (>220 nodes → reduced ticks, sampled edges)
- Semantic edges (embedding kNN) and smart link edges already computed and togglable
- Right-click context menu exists ("Find similar notes", "Open note")

### Design

#### 2a. Cluster Detection

**Concept:** Automatically detect dense communities in the graph and color/group nodes by cluster. Replace the current folder-based grouping with link-topology-based grouping.

**Algorithm:** Label Propagation (simple, fast, no hyperparams) or Louvain (better quality, slightly more complex). Both work on the adjacency list already computed in the Web Worker.

**Implementation location:** `vault_graph_worker.ts` — run clustering after force simulation converges.

**New domain module:** `graph_clustering.ts`
```typescript
type ClusterAssignment = Map<string, number>; // node path → cluster ID

function label_propagation(
  nodes: string[],
  edges: Array<{ source: string; target: string }>
): ClusterAssignment;
```

**Integration with renderer:**
- After clustering, assign `node.group = cluster_id` (reuse existing group field)
- Convex hull rendering already works for groups — clusters get hulls automatically
- Color palette: assign each cluster a distinct hue (existing renderer supports per-node tinting)
- Add toggle: "Group by: Folder | Cluster | None" in graph panel controls

**Worker message protocol extension:**
```typescript
// Add to worker output
type WorkerResult = {
  positions: ...;
  clusters?: ClusterAssignment;  // new
};
```

#### 2b. Focus Mode (Neighborhood Radial Layout)

**Concept:** Click a node in the vault graph → transition to a radial layout showing 1-2 hop neighbors with relationship types labeled. A "focused exploration" mode that's richer than the existing neighborhood panel (which uses static column layout).

**How it differs from existing neighborhood view:**
- Current neighborhood view (`graph_canvas.svelte`) is SVG with fixed column layout — backlinks left, outlinks right
- Focus mode renders *inside the vault graph canvas* (Pixi.js) with radial positioning
- Shows semantic + smart link edges (neighborhood view doesn't)
- Animated transition from vault → focus (zoom into selected node, fade non-neighbors)

**Implementation approach:**
- New layout function in worker: `radial_layout(center, neighbors_1hop, neighbors_2hop)`
  - Center node at origin
  - 1-hop neighbors on inner ring (radius ~150px), evenly spaced
  - 2-hop neighbors on outer ring (radius ~300px), positioned near their 1-hop parent
- Trigger: double-click or context menu "Focus" on a node
- Transition: animate camera zoom to center node, alpha-fade non-neighbor nodes to 0.1, reposition neighbors radially
- Edge labels: show relationship type (wiki/semantic/smart_link) on hover or always in focus mode
- Exit: click background or press Escape → restore vault layout positions

**State additions to GraphStore:**
```typescript
focus_node_path: string | null;      // active focus center
focus_mode_active: boolean;
```

**No backend work** — all data already loaded in vault snapshot + semantic/smart link edges.

### Implementation Steps

1. [x] `graph_clustering.ts` — label propagation on adjacency list — verify: produces reasonable clusters on test data
2. [x] Integrate clustering into `vault_graph_worker.ts` — run post-simulation — verify: cluster IDs returned
3. [x] Wire cluster assignments to renderer grouping — verify: convex hulls + colors per cluster
4. [x] "Group by" toggle in graph panel UI (Folder / Cluster / None) — verify: toggles between grouping modes
5. [x] Radial layout function — verify: nodes positioned in concentric rings
6. [x] Focus mode trigger (double-click / context menu) — verify: transitions to radial view
7. [x] Animated transition (zoom + fade + reposition) — verify: smooth animation
8. [x] Edge labels in focus mode — verify: relationship types visible
9. [x] Focus mode exit (Escape / click background) — verify: restores vault positions
10. [x] Tests: clustering algorithm correctness, radial layout geometry

---

## Phase 3 — Canvas: Note Embedding in File Nodes

### Current State

- `canvas_node.svelte` renders `FileNode` as `📄 filename` — no content preview
- `FileNode` type already has `subpath?: string` field (for heading-scoped embedding)
- Canvas surface is read-only (pan/zoom only, no node interaction beyond viewing)
- `CanvasStore` has `update_node(tab_id, node_id, fields)` for patching node properties
- Remark pipeline (`remark_processor.ts`) handles full markdown parsing (GFM, math, frontmatter, callouts, wiki embeds, etc.)
- No lightweight markdown-to-HTML renderer exists yet — the editor uses ProseMirror, not remark-to-HTML

### Design

**Concept:** When a canvas `FileNode` points to a `.md` file in the vault, render the note's markdown content (read-only) inside the node's bounding box instead of just showing the filename.

**Rendering approach:**

Use a **lightweight remark → HTML pipeline** (separate from ProseMirror). This is intentionally simpler than the full editor — it's read-only preview, not an editing surface.

```typescript
// New domain module: canvas_note_renderer.ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

function render_note_preview(markdown: string, subpath?: string): string {
  // If subpath specified, extract section under that heading
  // Run remark → rehype → sanitized HTML string
  // Return HTML for injection into node DOM
}
```

**Content loading:** When a canvas is opened, for each `FileNode` pointing to a `.md` file:
1. Read note content via `NotesPort.read(vault_id, file_path)`
2. If `subpath` is set (e.g., `#heading-name`), extract content under that heading
3. Render to HTML via lightweight pipeline
4. Cache rendered HTML in a reactive map: `Map<node_id, string>`

**Component changes to `canvas_node.svelte`:**
```svelte
{:else if node.type === "file"}
  {#if rendered_content}
    <div class="CanvasNode__content CanvasNode__content--embedded">
      <div class="CanvasNode__embedded-header">{filename}</div>
      <div class="CanvasNode__embedded-body">{@html rendered_content}</div>
    </div>
  {:else}
    <!-- existing icon + filename fallback -->
  {/if}
{/if}
```

**Styling:** Scoped CSS for embedded markdown (headings, lists, code, bold/italic). Reuse subset of `editor.css` or `prose` styles. Content overflows with `overflow-y: auto` inside the node's fixed height.

**Interaction:** Click anywhere on embedded node → open the note in the editor (via existing action).

**Performance considerations:**
- Render lazily: only process visible nodes (check against camera viewport)
- Cache HTML: re-render only when note content changes (watch via existing file watcher)
- Cap rendering: if a note is >5000 chars, truncate with "..." — canvas previews don't need full content
- Debounce: if many file nodes, stagger rendering to avoid blocking

**Subpath support:**
- `FileNode.subpath` can be `#heading-slug` — extract section from MDAST between that heading and the next heading of equal or higher level
- This already conceptually exists in the type system — just needs implementation

### Implementation Steps

1. [x] `canvas_note_renderer.ts` — remark → rehype → HTML pipeline — verify: converts sample markdown to clean HTML
2. [x] Subpath extraction function (heading-scoped sections from MDAST) — verify: extracts correct section
3. [x] Content loading layer — read notes for file nodes on canvas open — verify: content fetched
4. [x] Update `canvas_node.svelte` to render HTML for file nodes — verify: embedded content visible in node
5. [x] Scoped CSS for embedded markdown — verify: headings, lists, code render correctly
6. [x] Click-to-open interaction on embedded nodes — verify: opens note in editor
7. [ ] Viewport-based lazy rendering — verify: off-screen nodes don't render content (deferred — optimization)
8. [x] Truncation for large notes — verify: graceful handling of 10k+ char notes
9. [x] Tests: renderer output, subpath extraction, content caching

---

## Phase 4 — Canvas: Auto-Layout from Graph

### Current State

- `graph_canvas_view.ts` already converts `GraphNeighborhoodSnapshot` → positioned visual nodes + edges (column layout)
- Canvas types (`CanvasNode`, `CanvasEdge`, `CanvasData`) are structurally similar to graph visual types
- `CanvasService.create_canvas()` writes `CanvasData` to a `.canvas` file
- Graph has vault-wide snapshots (`VaultGraphSnapshot`) and neighborhood snapshots
- Search graph has subgraph extraction with scored neighbors

### Design

**Concept:** Generate a `CanvasData` from a graph snapshot and open it as a canvas. "Materialize" a graph view into an editable spatial workspace.

**Domain function:**
```typescript
// New: graph_to_canvas.ts
function graph_to_canvas(input: {
  nodes: Array<{ path: string; title: string; kind?: string }>;
  edges: Array<{ source: string; target: string; label?: string }>;
  layout: "column" | "radial" | "force";
  center_path?: string;
}): CanvasData;
```

**Layout options:**
- `column`: Reuse `graph_canvas_view.ts` logic (backlinks left, center, outlinks right) — simplest, works now
- `radial`: Center node + concentric rings — reuse Phase 2 radial layout
- `force`: Run D3 force simulation synchronously (small graphs only, <100 nodes) — positions from simulation

**Entry points (3 ways to trigger):**

1. **From neighborhood panel:** "Open as Canvas" button → converts current neighborhood to canvas
2. **From vault graph:** Right-click node → "Export neighborhood as Canvas" → builds neighborhood snapshot, converts
3. **From search graph:** "Export results as Canvas" → converts search subgraph to canvas

**Flow:**
1. User triggers export action
2. Build `CanvasData` via `graph_to_canvas()` with appropriate layout
3. Generate filename: `graph-{note-title}-{timestamp}.canvas` or `search-{query}-{timestamp}.canvas`
4. Save via `CanvasService.create_canvas()` then write content
5. Open the new canvas in a tab

**Graph → Canvas type mapping:**
```
GraphNode.path    → FileNode.file
GraphNode         → FileNode { x, y, width: 240, height: 160 }
GraphEdge         → CanvasEdge { fromNode, toNode, toEnd: "arrow" }
Cluster/Group     → GroupNode (if clustering from Phase 2)
```

**Node sizing:**
- Default: 240×160 (enough for embedded preview from Phase 3)
- Center node: 280×200 (slightly larger)
- If Phase 3 is implemented, file nodes immediately show content — the combination is the payoff

### Implementation Steps

1. [x] `graph_to_canvas.ts` — conversion function with column layout — verify: produces valid CanvasData
2. [x] Action: "Open as Canvas" in neighborhood panel — verify: creates + opens canvas file
3. [x] Action: right-click "Export as Canvas" in vault graph — verify: creates canvas from node neighborhood
4. [x] Action: "Export as Canvas" in search graph tab — verify: creates canvas from search results
5. [x] (Optional) Force-directed layout option for small graphs — verify: positioned nodes don't overlap
6. [x] (Optional) GroupNode generation from clusters (if Phase 2 done) — verify: cluster groups appear as groups
7. [x] Tests: conversion correctness, edge mapping, layout bounds

---

## Dependencies Between Phases

```
Phase 1 (Bases Views) ──── independent ──── Phase 2 (Graph Clusters)
                                                    │
                                                    ▼
Phase 3 (Canvas Embedding) ── independent ── Phase 4 (Graph → Canvas)
                                    │                │
                                    └───── combined ──┘
                                    (Phase 3 + 4 = spatial thinking)
```

- Phases 1 and 2 are fully independent — can be parallelized
- Phase 3 is independent but delivers most value when Phase 4 follows
- Phase 4 benefits from Phase 2 (cluster grouping) and Phase 3 (content in nodes) but doesn't require either
- The full vision (graph → canvas with embedded note content, clustered into groups) requires all of 2 + 3 + 4

## Shared Backend Work

One Rust command is needed across features:

| Command | Phase | Purpose |
|---------|-------|---------|
| `bases_update_property` | 1 (Kanban) | Write single frontmatter property to note |
| `note_content_snippet` | 1 (Gallery) | Extract snippet + first image at index time |

All other work is frontend-only (TypeScript/Svelte).

## Risk Notes

- **Kanban drag-and-drop:** Frontmatter write-back must preserve YAML structure (don't re-serialize and lose formatting). Use targeted key update, not full YAML rewrite.
- **Gallery image extraction:** Must handle relative paths, wiki-style image links, and missing images gracefully. Index-time extraction keeps query path fast.
- **Canvas embedding performance:** Many file nodes × large notes = potential jank. Viewport culling + truncation + lazy render are non-negotiable.
- **Graph clustering quality:** Label propagation can produce unstable results on sparse graphs. Consider falling back to folder grouping when cluster count < 2 or > 50% are singletons.
- **Force layout for canvas export:** Must be synchronous (no Web Worker) for small graphs, or use the existing worker with a one-shot run pattern. Don't block the UI thread for >100 nodes.
