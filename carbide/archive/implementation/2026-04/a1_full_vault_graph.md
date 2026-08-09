# A1: Full-Vault Graph View — Implementation Plan

## Decision Log

| #   | Decision                                                                                        | Rationale                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Use `d3-force` (specifically `d3-force` standalone, not all of d3) for force-directed layout    | Battle-tested physics simulation, small bundle (~15KB gzip), runs in a web worker trivially, excellent TypeScript support. Alternatives like `ngraph.forcelayout` are lighter but lack the ecosystem. We don't need WebGL — SVG/Canvas2D handles 5000 nodes fine with proper viewport culling. |
| D2  | SVG rendering (not Canvas2D/WebGL) for the initial implementation                               | Current graph already uses SVG+HTML nodes. Consistent rendering path. At 5000 nodes SVG will be fine with viewport culling (only render visible nodes). Canvas2D migration is a later optimization if needed.                                                                                  |
| D3  | Single new Rust command `graph_load_vault_graph` returning flat node + edge arrays              | A single query is simpler than pagination for a local SQLite DB. 5000 notes with 50K edges serializes to ~5MB JSON — well within IPC limits. Avoids complexity of streaming/chunked protocols.                                                                                                 |
| D4  | Full-vault snapshot cached separately from neighborhood cache                                   | Different cache key namespace (`vault:{vault_id}` vs `{vault_id}:{note_id}`). Full-vault data changes less frequently and is more expensive to compute, so it gets a dedicated cache entry with explicit invalidation.                                                                         |
| D5  | Layout computation runs on the main thread with `requestAnimationFrame` ticks, not a Web Worker | d3-force simulation is incremental — we tick it on each frame and update positions. Worker adds serialization overhead for position arrays on every frame. For 5000 nodes, d3-force ticks in <5ms. If profiling shows jank, we can move to a worker later.                                     |
| D6  | Graph view mode (`neighborhood` vs `vault`) is store state, not a URL param                     | Ephemeral UI concern. Follows the pattern of other panel toggles in `GraphStore`.                                                                                                                                                                                                              |
| D7  | Orphan links (targets that don't exist as notes) are excluded from the full-vault graph         | Full-vault graph shows actual notes as nodes and actual links as edges. Orphan targets are not real notes — including them would clutter a 5000-node graph. They remain visible in neighborhood view where they're contextually useful.                                                        |

## Rejected Alternatives

| Alternative                           | Why Rejected                                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ngraph.forcelayout`                  | Faster but no TypeScript types, less configurable, smaller community. d3-force is the industry standard and our node count doesn't justify the optimization.                 |
| WebGL renderer (pixi-graph, sigma.js) | Over-engineering for up to 5000 nodes. Adds a heavy dependency. SVG with viewport culling is sufficient and keeps the rendering approach consistent with the existing graph. |
| Web Worker for layout                 | Adds complexity (message passing, transferable arrays). d3-force at 5000 nodes is <5ms per tick. Premature optimization.                                                     |
| Paginated/streaming backend response  | Unnecessary for local SQLite. Full vault of 5000 notes with all edges fits in memory trivially. Pagination adds frontend complexity for no real gain.                        |
| Canvas2D rendering                    | Would require reimplementing all node interaction (hover, select, dblclick) that we get for free with SVG/HTML elements. Not worth it at this scale.                         |
| Separate `FullVaultGraphStore` class  | The existing `GraphStore` can be extended with a discriminated union on view mode. Adding a separate store would duplicate selection/hover/filter state.                     |

---

## A. Data Structures

### Rust (new types in `src-tauri/src/features/graph/types.rs`)

```
VaultGraphNode { path: String, title: String }
VaultGraphEdge { source: String, target: String }
VaultGraphSnapshot { nodes: Vec<VaultGraphNode>, edges: Vec<VaultGraphEdge>, stats: VaultGraphStats }
VaultGraphStats { node_count: usize, edge_count: usize }
```

Minimal struct — no `mtime_ms`/`size_bytes` for full-vault nodes. The graph only needs identity + label. This keeps the payload small for large vaults.

### TypeScript (new types in `src/lib/features/graph/ports.ts`)

```
VaultGraphNode { path: string; title: string }
VaultGraphEdge { source: string; target: string }
VaultGraphSnapshot { nodes: VaultGraphNode[]; edges: VaultGraphEdge[]; stats: VaultGraphStats }
VaultGraphStats { node_count: number; edge_count: number }
```

### Layout types (new in `src/lib/features/graph/domain/vault_graph_layout.ts`)

```
ForceNode extends d3.SimulationNodeDatum { id: string; label: string; x: number; y: number }
ForceEdge extends d3.SimulationLinkDatum<ForceNode> { source: string; target: string }
VaultGraphViewState { nodes: ForceNode[]; edges: ForceEdge[]; simulation_running: boolean }
```

---

## B. Rust Backend Changes

### New query in `src-tauri/src/features/search/db.rs`

Add `get_all_graph_edges`:

- SQL: `SELECT DISTINCT source_path, target_path FROM outlinks WHERE source_path IN (SELECT path FROM notes) AND target_path IN (SELECT path FROM notes)`
- Returns `Vec<(String, String)>` — only edges where both endpoints are real notes (no orphans).
- Reuse existing `get_all_notes_from_db` for nodes (already returns `BTreeMap<String, IndexNoteMeta>`). We'll only extract `path` and `title` from it.

### New Tauri command in `src-tauri/src/features/graph/service.rs`

`graph_load_vault_graph(app: AppHandle, vault_id: String, cache_state: State<GraphCacheState>) -> Result<VaultGraphSnapshot, String>`

Logic:

1. Check cache with key `vault:{vault_id}`
2. If miss: open search DB, call `get_all_notes_from_db` + `get_all_graph_edges`
3. Map into `VaultGraphSnapshot { nodes, edges, stats }`
4. Insert into cache, return

### Cache strategy

- Reuse existing `GraphCacheState` (same `ObservableCache<String, _>` but needs to become generic or store an enum). Simpler approach: add a second managed state `VaultGraphCacheState(Mutex<ObservableCache<String, VaultGraphSnapshot>>)` with capacity 4 (one per recently used vault).
- Invalidation: `graph_invalidate_cache` with `note_id: None` already clears all entries for a vault. Extend it to also clear the vault graph cache.

### Registration in `src-tauri/src/app/mod.rs`

- Add `.manage(VaultGraphCacheState::default())`
- Add `graph_load_vault_graph` to the invoke handler list

---

## C. Frontend Changes

### Port extension (`src/lib/features/graph/ports.ts`)

Add to `GraphPort`:

```
load_vault_graph(vault_id: VaultId): Promise<VaultGraphSnapshot>
```

### Adapter extension (`src/lib/features/graph/adapters/graph_tauri_adapter.ts`)

Add implementation calling `tauri_invoke("graph_load_vault_graph", { vaultId: vault_id })` and mapping the response to `VaultGraphSnapshot`.

### Store extension (`src/lib/features/graph/state/graph_store.svelte.ts`)

Add fields:

- `view_mode: "neighborhood" | "vault"` — defaults to `"neighborhood"`
- `vault_snapshot: VaultGraphSnapshot | null`

Add methods:

- `set_view_mode(mode)` — sets the mode
- `set_vault_snapshot(snapshot)` — stores the full-vault data, sets status to ready
- `start_loading_vault()` — sets status to loading for vault mode

The existing `status`, `error`, `selected_node_ids`, `hovered_node_id`, `filter_query` fields are shared across both modes.

### Service extension (`src/lib/features/graph/application/graph_service.ts`)

Add methods:

- `async load_vault_graph()` — calls port, updates store
- `async toggle_view_mode()` — switches mode, loads appropriate data
- `async refresh_current()` — extend to check `view_mode` and refresh accordingly

### New domain module: `src/lib/features/graph/domain/vault_graph_layout.ts`

Force-directed layout engine using `d3-force`:

**`create_vault_graph_simulation(snapshot, config)`** — returns a d3 force simulation configured with:

- `forceLink` — edges as links with distance based on connectivity
- `forceManyBody` — repulsion (charge -200, tuned for readability)
- `forceCenter` — keeps graph centered in viewport
- `forceCollide` — prevents node overlap (radius based on label length)

**`tick_simulation(simulation)`** — advances the simulation by N ticks (for initial stabilization, run ~100 ticks synchronously before first render, then animate remaining convergence via requestAnimationFrame)

**`resolve_vault_graph_view(input)`** — pure function analogous to `resolve_graph_canvas_view`, takes the simulation state + filter/selection/hover state and returns `GraphCanvasView` (reuses the existing visual types). Applies viewport culling: only returns nodes/edges within the current viewport bounds.

### New UI component: `src/lib/features/graph/ui/vault_graph_canvas.svelte`

Renders the force-directed graph:

- SVG layer for edges (lines)
- HTML overlay for nodes (positioned absolutely, same style as current graph nodes but smaller — 10px circles with tooltip labels instead of 176x44px cards, to fit thousands of nodes)
- Pan and zoom via CSS transforms on a container (pointer events for drag-to-pan, wheel for zoom)
- Highlight on hover: connected edges brighten, unconnected nodes fade
- Click node to select, double-click to open note and optionally switch to neighborhood view
- Filter query dims non-matching nodes (opacity 0.15) rather than hiding them — preserves spatial context

### UI changes to `src/lib/features/graph/ui/graph_panel.svelte`

- Add a toggle button in the header (between refresh and close) to switch between "Neighborhood" and "Vault" view modes
- Conditionally render `GraphCanvas` (neighborhood) or `VaultGraphCanvas` (vault) based on `view_mode`
- Stats bar adapts to show vault-level stats when in vault mode
- When in vault mode, subtitle shows "Full vault" instead of the center note title

### Action additions (`src/lib/features/graph/application/graph_actions.ts`)

New actions:

- `graph.toggle_view_mode` — calls `graph_service.toggle_view_mode()`
- `graph.load_vault_graph` — calls `graph_service.load_vault_graph()`

Add to `ACTION_IDS` in `src/lib/app/action_registry/action_ids.ts`.

### Reactor extension (`src/lib/reactors/graph_refresh.reactor.svelte.ts`)

Extend `resolve_graph_refresh_decision` to handle vault mode:

- When `view_mode === "vault"` and `index_completed`, reload the vault graph
- When `view_mode === "vault"`, do NOT reload on active note change (vault graph is note-independent)
- Vault switch clears vault snapshot too

### Index update (`src/lib/features/graph/index.ts`)

Export the new types and `VaultGraphCanvas` component.

---

## D. Edge Cases & Invariants

| Case                                                  | Handling                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty vault (0 notes)                                 | Backend returns `{ nodes: [], edges: [], stats: { node_count: 0, edge_count: 0 } }`. Frontend shows "No notes in vault" message.                                                                                                   |
| Single note, no links                                 | One node rendered at center, no edges. Graph is trivially "stable".                                                                                                                                                                |
| Self-links (note links to itself)                     | SQL query `WHERE source_path != target_path` filters these out. Self-links are meaningless in graph visualization.                                                                                                                 |
| Circular links (A->B->C->A)                           | Handled naturally by force layout. Cycles form tight clusters. No special treatment needed.                                                                                                                                        |
| Duplicate edges (A links to B multiple times in text) | `outlinks` table has `PRIMARY KEY (source_path, target_path)` — already deduplicated at index time. `SELECT DISTINCT` in the query is a safety net.                                                                                |
| Large vault (5000 notes, ~50K edges)                  | Estimated payload: ~3MB JSON. Initial simulation: 100 synchronous ticks (~200ms), then animate. Viewport culling renders only visible nodes. Interactive performance stays >30fps because SVG mutation is limited to the viewport. |
| Very large vault (>5000 notes)                        | Warn in UI if node_count > 5000: "Large vault — graph may be slow". Still render. User can filter. Future: add node-count limit with "show top N most connected" option.                                                           |
| Switching modes while loading                         | Service checks `view_mode` after async operations complete and discards stale results if mode changed during load. Use a revision counter (same pattern as `SearchService`).                                                       |
| Vault switch while vault graph is loading             | Existing reactor logic handles this: vault change triggers clear.                                                                                                                                                                  |
| Filter query in vault mode                            | Dims non-matching nodes to opacity 0.15. Edges to/from dimmed nodes also dim. This preserves the spatial layout while highlighting matches.                                                                                        |
| Node positions during filter                          | Simulation is NOT re-run when filter changes. Filter is visual-only. Re-running the simulation would destroy the user's mental map.                                                                                                |

### Performance bounds

| Metric                                    | Target | Strategy                                                                                          |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Backend query time (5000 notes)           | <50ms  | Two simple SQLite queries, no joins needed for the vault graph (notes table scan + outlinks scan) |
| IPC serialization (5000 nodes, 50K edges) | <100ms | Flat arrays of small structs                                                                      |
| Initial layout stabilization              | <300ms | 100 synchronous d3-force ticks                                                                    |
| Frame rate during animation               | >30fps | Viewport culling, only update visible SVG elements                                                |
| Memory (frontend, 5000 nodes)             | <20MB  | Flat arrays, no deep object graphs                                                                |

---

## E. Test Scenarios (BDD-style)

### Backend

**Scenario: Load vault graph for a vault with notes and links**

- Given: 3 notes exist (A, B, C) with edges A->B, B->C
- When: `graph_load_vault_graph` is called
- Then: response contains 3 nodes and 2 edges, stats are correct

**Scenario: Self-links are excluded**

- Given: note A has a link to itself
- When: vault graph is loaded
- Then: no edge from A to A appears in the response

**Scenario: Orphan edges are excluded**

- Given: note A links to "nonexistent.md" (not in notes table)
- When: vault graph is loaded
- Then: no node for "nonexistent.md" and no edge to it

**Scenario: Empty vault**

- Given: no notes exist in the search DB
- When: vault graph is loaded
- Then: response has 0 nodes, 0 edges

**Scenario: Cache hit**

- Given: vault graph was loaded once
- When: loaded again without invalidation
- Then: returns cached result (verify via cache stats)

**Scenario: Cache invalidated on note change**

- Given: vault graph is cached
- When: `graph_invalidate_cache(vault_id, None)` is called
- Then: next load recomputes from DB

### Frontend — Store

**Scenario: View mode toggle**

- Given: graph store has `view_mode = "neighborhood"`
- When: `set_view_mode("vault")` is called
- Then: `view_mode` is `"vault"`

**Scenario: Setting vault snapshot**

- Given: store is in loading state with `view_mode = "vault"`
- When: `set_vault_snapshot(snapshot)` is called
- Then: `vault_snapshot` is set, `status` is `"ready"`

### Frontend — Service

**Scenario: Load vault graph calls port and updates store**

- Given: vault is active
- When: `load_vault_graph()` is called
- Then: store transitions loading -> ready with the snapshot

**Scenario: Load vault graph with no active vault**

- Given: no vault is open
- When: `load_vault_graph()` is called
- Then: store is cleared, port is NOT called

**Scenario: Toggle to vault mode triggers load**

- Given: view mode is "neighborhood"
- When: `toggle_view_mode()` is called
- Then: mode becomes "vault" and `load_vault_graph` fires

**Scenario: Toggle back to neighborhood re-focuses active note**

- Given: view mode is "vault", an active note exists
- When: `toggle_view_mode()` is called
- Then: mode becomes "neighborhood" and `focus_active_note` fires

### Frontend — Reactor

**Scenario: Index completion refreshes vault graph**

- Given: view mode is "vault", index status transitions to "completed"
- When: reactor fires
- Then: decision is "load" for vault graph

**Scenario: Active note change does NOT refresh vault graph**

- Given: view mode is "vault"
- When: active note changes
- Then: reactor decision is "noop" (vault graph is not note-dependent)

### Frontend — Layout

**Scenario: Simulation produces stable positions**

- Given: 10 nodes with 15 edges
- When: simulation runs 300 ticks
- Then: all node positions are finite numbers, no NaN, no overlapping positions

**Scenario: Filter dims non-matching nodes**

- Given: vault graph with nodes A, B, C and filter "A"
- When: `resolve_vault_graph_view` is called
- Then: node A is full opacity, B and C are dimmed

**Scenario: Empty graph returns empty view**

- Given: vault snapshot with 0 nodes
- When: resolve is called
- Then: returns `{ nodes: [], edges: [] }`

---

## F. Files to Create/Modify

### Create

| File                                                      | Purpose                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/features/graph/domain/vault_graph_layout.ts`     | Force-directed layout engine using d3-force, viewport culling, view resolution |
| `src/lib/features/graph/ui/vault_graph_canvas.svelte`     | Pan/zoom SVG canvas rendering force-directed graph                             |
| `tests/unit/domain/vault_graph_layout.test.ts`            | Unit tests for layout logic                                                    |
| `tests/unit/stores/graph_store_vault.test.ts`             | Tests for new vault-mode store methods                                         |
| `tests/unit/services/graph_service_vault.test.ts`         | Tests for new vault-mode service methods                                       |
| `tests/unit/reactors/graph_refresh_reactor_vault.test.ts` | Tests for reactor vault-mode decisions                                         |

### Modify

| File                                                     | Change                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/features/graph/types.rs`                  | Add `VaultGraphNode`, `VaultGraphEdge`, `VaultGraphSnapshot`, `VaultGraphStats` structs                                           |
| `src-tauri/src/features/graph/service.rs`                | Add `VaultGraphCacheState`, `graph_load_vault_graph` command, extend `graph_invalidate_cache` to clear vault cache                |
| `src-tauri/src/features/search/db.rs`                    | Add `get_all_graph_edges(conn) -> Vec<(String, String)>`                                                                          |
| `src-tauri/src/app/mod.rs`                               | Register `VaultGraphCacheState` and `graph_load_vault_graph` command                                                              |
| `src/lib/features/graph/ports.ts`                        | Add `VaultGraphNode`, `VaultGraphEdge`, `VaultGraphSnapshot`, `VaultGraphStats` types; extend `GraphPort` with `load_vault_graph` |
| `src/lib/features/graph/adapters/graph_tauri_adapter.ts` | Add `load_vault_graph` implementation                                                                                             |
| `src/lib/features/graph/state/graph_store.svelte.ts`     | Add `view_mode`, `vault_snapshot` fields and related methods                                                                      |
| `src/lib/features/graph/application/graph_service.ts`    | Add `load_vault_graph`, `toggle_view_mode`; extend `refresh_current`                                                              |
| `src/lib/features/graph/application/graph_actions.ts`    | Add `graph.toggle_view_mode` and `graph.load_vault_graph` actions                                                                 |
| `src/lib/features/graph/ui/graph_panel.svelte`           | Add view mode toggle button, conditional rendering of neighborhood vs vault canvas                                                |
| `src/lib/features/graph/index.ts`                        | Export new types and components                                                                                                   |
| `src/lib/app/action_registry/action_ids.ts`              | Add `graph_toggle_view_mode`, `graph_load_vault_graph`                                                                            |
| `src/lib/reactors/graph_refresh.reactor.svelte.ts`       | Extend decision logic for vault mode                                                                                              |

---

## G. Dependencies

### npm (new)

| Package           | Version  | Size       | Purpose                                                         |
| ----------------- | -------- | ---------- | --------------------------------------------------------------- |
| `d3-force`        | `^3.0.0` | ~15KB gzip | Force-directed simulation (n-body, links, centering, collision) |
| `@types/d3-force` | `^3.0.0` | dev        | TypeScript types                                                |

No other d3 modules needed. `d3-force` is standalone with zero dependencies.

### Cargo (none)

No new Rust dependencies. The implementation uses existing `rusqlite`, `serde`, and the project's `ObservableCache`.
