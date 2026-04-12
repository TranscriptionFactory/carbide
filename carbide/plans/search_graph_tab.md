# Search Graph Tab - Implementation Plan

## 1. Overview

A new `"search_graph"` tab type that combines a force-directed subgraph visualization with a scrollable search results list. When a user searches, instead of rendering the entire vault graph, it shows only the relevant subgraph (search hits + their wiki-link neighbors) alongside contextual snippets with match highlighting.

```
+-----------------------------------------------------+
| [Search: "machine learning"]                    [x]  |
+----------------------+------------------------------+
|                      |  +-------------------------+  |
|    Force-directed    |  | Note A          * hit   |  |
|    subgraph          |  | "...the model uses      |  |
|                      |  |  gradient descent..."   |  |
|   (A)-->>(B)         |  +-------------------------+  |
|    |      |          |  | Note B          * hit   |  |
|   (C)   (D)          |  | "...training loop       |  |
|    |                 |  |  converges after..."    |  |
|   (E)                |  +-------------------------+  |
|                      |  | Note C       . neighbor |  |
|  [hit: solid]        |  | "...backprop computes   |  |
|  [neighbor: faded]   |  |  partial derivatives.." |  |
+----------------------+------------------------------+
| 5 hits . 3 neighbors . wiki: 4  semantic: 2  smart: 1|
+-----------------------------------------------------+
```

**Key behaviors:**
- Search hits = solid nodes, neighbors = faded
- Edge types visually distinguished: wiki=solid, semantic=dashed, smart=dotted
- Progressive disclosure: start with hits + high-connectivity neighbors, click to expand
- Result list with snippets and edge type indicators
- Bidirectional cross-highlight: click result -> highlight in graph, click graph node -> scroll to result
- Independent tab lifecycle: can open multiple, close when done

**Why a new tab (not bolted onto graph panel):**
- Graph panel serves navigation (anchored to active note); search is query-driven and multi-focal
- Needs full workspace width for split layout
- Independent lifecycle (multiple tabs, transient queries)
- Avoids polluting graph panel's neighborhood/vault/hierarchy modes

---

## 2. Domain Types

### 2.1 Tab Kind Extension

**File: `src/lib/features/tab/types/tab.ts`**

Add to `Tab` discriminated union:

```typescript
| { kind: "search_graph"; query: string }
```

Tab ID format: `__search_graph__{nanoid}__` (allows multiple simultaneous tabs, unlike the singleton `__graph__` tab).

### 2.2 Search Graph Types

**New file: `src/lib/features/graph/types/search_graph_types.ts`**

```typescript
type SearchGraphNodeKind = "hit" | "neighbor";

type SearchGraphNode = {
  path: string;
  title: string;
  kind: SearchGraphNodeKind;
  snippet?: string;        // match context (hits only)
  score?: number;          // search relevance (hits only)
};

type SearchGraphEdgeType = "wiki" | "semantic" | "smart_link";

type SearchGraphEdge = {
  source: string;
  target: string;
  edge_type: SearchGraphEdgeType;
  score?: number;
};

type SearchGraphSnapshot = {
  query: string;
  nodes: SearchGraphNode[];
  edges: SearchGraphEdge[];
  stats: {
    hit_count: number;
    neighbor_count: number;
    wiki_edge_count: number;
    semantic_edge_count: number;
    smart_link_edge_count: number;
  };
};
```

---

## 3. Subgraph Extraction Algorithm

**New file: `src/lib/features/graph/domain/search_subgraph.ts`**

Pure function, unit-testable, no side effects.

### `extract_search_subgraph()`

**Inputs:**
- `hits: { path: string; title: string; snippet?: string; score?: number }[]`
- `vault_snapshot: VaultGraphSnapshot` (full vault nodes + wiki edges)
- `semantic_edges?: SemanticEdge[]`
- `smart_link_edges?: SmartLinkEdge[]`
- `options?: { max_neighbors?: number }` (default max: 50)

**Algorithm:**
1. Build `hit_set: Set<string>` from hit paths
2. Build adjacency map from `vault_snapshot.edges` — `Map<string, Set<string>>` (bidirectional)
3. For each hit, collect 1-hop wiki-link neighbors (both inbound/outbound)
4. Score each neighbor by **connectivity to hits**: `score = edges_to_hit_nodes / total_edges`. Neighbors bridging multiple hits are more interesting
5. Cap neighbors at `max_neighbors`, sorted by connectivity score descending
6. Collect all wiki edges between selected node set (hits + neighbors)
7. Collect semantic edges where both endpoints are in selected set
8. Collect smart link edges where both endpoints are in selected set
9. Build `SearchGraphSnapshot` with classified edges and stats

### Progressive Disclosure (computed from snapshot + expansion state)

- `auto_expanded_ids` = neighbors with connectivity >= 2 to hit nodes
- `user_expanded_ids` = nodes user explicitly expanded (maintained in store)
- Visible nodes = hits + auto_expanded + neighbors of user_expanded
- Graph canvas receives only the visible subset

---

## 4. Store

**New file: `src/lib/features/graph/state/search_graph_store.svelte.ts`**

Map-keyed-by-tab-id to support multiple simultaneous tabs:

```typescript
class SearchGraphStore {
  instances = $state<Map<string, SearchGraphInstance>>(new Map());

  create_instance(tab_id: string, query: string): void;
  remove_instance(tab_id: string): void;
  get_instance(tab_id: string): SearchGraphInstance | undefined;
}

type SearchGraphInstance = {
  query: string;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  snapshot: SearchGraphSnapshot | null;
  auto_expanded_ids: Set<string>;
  user_expanded_ids: Set<string>;
  selected_node_id: string | null;
  hovered_node_id: string | null;
  scroll_to_path: string | null;
  show_semantic_edges: boolean;
  show_smart_link_edges: boolean;
};
```

---

## 5. Service Methods

**File: `src/lib/features/graph/application/graph_service.ts`**

Add to `GraphService` (it already depends on `search_port` and `graph_port`):

```
async execute_search_graph(tab_id: string, query: string): Promise<void>
```

Orchestration:
1. `search_port.search_notes(vault_id, parse_search_query(query), 50)`
2. Load vault snapshot if not cached (reuse from `graph_store.vault_snapshot` or load fresh)
3. Optionally load semantic/smart link edges (lazy, behind toggle)
4. Call `extract_search_subgraph(hits, vault_snapshot, ...)`
5. Update `search_graph_store` instance

```
expand_search_graph_node(tab_id: string, node_id: string): void
select_search_graph_node(tab_id: string, node_id: string | null): void
hover_search_graph_node(tab_id: string, node_id: string | null): void
```

Constructor change: add `search_graph_store: SearchGraphStore` dependency.

---

## 6. Actions

**File: `src/lib/app/action_registry/action_ids.ts`** - Add:

```
search_graph_open
search_graph_execute
search_graph_expand_node
search_graph_select_node
search_graph_hover_node
search_graph_scroll_to
search_graph_close
search_graph_toggle_semantic
search_graph_toggle_smart_links
```

**New file: `src/lib/features/graph/application/search_graph_actions.ts`**

Follows `graph_actions.ts` pattern. Key actions:
- `search_graph.open` — create store instance, open tab, optionally execute initial query
- `search_graph.execute` — debounced search + subgraph rebuild
- `search_graph.select_node` — cross-highlight between graph and list
- `search_graph.close` — remove store instance, close tab

---

## 7. Tab System Changes

| File | Change |
|------|--------|
| `src/lib/features/tab/types/tab.ts` | Add `"search_graph"` kind to `Tab`, `PersistedTab`, `ClosedTabEntry` unions |
| `src/lib/features/tab/state/tab_store.svelte.ts` | Add `open_search_graph_tab(tab_id, title, query)` method |
| `src/lib/features/tab/application/tab_service.ts` | Handle `kind: "search_graph"` in `build_persisted_tabs_state` and `restore_tabs` |
| `src/lib/features/note/ui/note_editor.svelte` | Add rendering branch: `active_tab?.kind === "search_graph"` -> `<SearchGraphTabView />` |

On restore: re-create store instance and re-execute the search from persisted query.

---

## 8. UI Components

### 8.1 `search_graph_tab_view.svelte` (main view)

**New file: `src/lib/features/graph/ui/search_graph_tab_view.svelte`**

Split layout using shadcn `Resizable` pane:
- **Toolbar**: search input + edge toggle buttons + close
- **Left pane**: `SearchGraphCanvas` (force-directed subgraph)
- **Right pane**: `SearchGraphResultList` (scrollable cards)
- **Status bar**: hit/neighbor/edge counts

Props: `tab_id: string`, `initial_query: string`

### 8.2 `search_graph_canvas.svelte` (graph pane)

**New file: `src/lib/features/graph/ui/search_graph_canvas.svelte`**

Thin wrapper around `VaultGraphCanvas`. Adapts `SearchGraphSnapshot` to `VaultGraphSnapshot` format:
- `SearchGraphNode[]` -> `VaultGraphNode[]` (path + title)
- Wiki edges -> `VaultGraphEdge[]`
- Semantic edges -> `SemanticEdge[]`
- Smart link edges -> `SmartLinkEdge[]`

Uses a new `filter_override_ids: Set<string> | null` prop on `VaultGraphCanvas` to highlight hit nodes (solid) vs. neighbor nodes (dimmed). This reuses the existing filter/dimming mechanism with minimal change.

### 8.3 `search_graph_result_list.svelte` (result pane)

**New file: `src/lib/features/graph/ui/search_graph_result_list.svelte`**

Scrollable list of cards, each showing:
- Note title + path
- Hit/neighbor badge (with distinct styling)
- Snippet with highlighted search terms
- Edge type indicators (small colored dots/lines showing connection types)
- Single click: select + cross-highlight in graph
- Double click: open note in editor

Props: `nodes`, `edges`, `selected_node_id`, `scroll_to_path`, `on_select`, `on_open`

---

## 9. Modification to Existing Components

### `VaultGraphCanvas` — add `filter_override_ids` prop

**File: `src/lib/features/graph/ui/vault_graph_canvas.svelte`**

Add optional prop:
```typescript
filter_override_ids?: Set<string> | null;  // when set, these IDs are "matched" instead of computing from filter_query
```

When `filter_override_ids` is provided, the renderer uses it to determine which nodes are highlighted (full opacity) vs dimmed, bypassing the text-based filter. This is a surgical, backward-compatible change.

---

## 10. Cross-Highlighting (Graph <-> List)

Bidirectional sync via store:

1. **Graph node click -> List scroll**: sets `selected_node_id` + `scroll_to_path` in store. Result list watches `scroll_to_path`, scrolls matching element into view.
2. **List item click -> Graph highlight**: sets `selected_node_id` in store. Canvas receives via `selected_node_ids` prop, highlights accordingly (existing `VaultGraphRenderer.select_node()` behavior).
3. **Hover**: graph hover sets `hovered_node_id`, result list shows hover styling on matching card (and vice versa).

---

## 11. DI / Wiring

| File | Change |
|------|--------|
| `src/lib/app/bootstrap/create_app_stores.ts` | Add `search_graph: SearchGraphStore` to `AppStores` |
| `src/lib/app/di/create_app_context.ts` | Pass `search_graph_store` to `GraphService`, register `search_graph_actions` |
| `src/lib/features/graph/index.ts` | Export new types, store, components |

---

## 12. Implementation Phases

### Phase 1: Core Domain + Types ✅ (commit df6c92fe)
1. ✅ Create `search_graph_types.ts` — `SearchGraphNode`, `SearchGraphEdge`, `SearchGraphSnapshot`, `SearchGraphStats`
2. ✅ Create `search_subgraph.ts` — `extract_search_subgraph()` + `compute_auto_expanded_ids()` with adjacency map, neighbor scoring by hit-connectivity ratio
3. ✅ Create `search_graph_store.svelte.ts` — multi-instance `SearchGraphStore` keyed by tab_id
4. ✅ Unit tests — 11 tests covering: empty hits, 1-hop neighbors, edge inclusion, max_neighbors cap, connectivity ranking, semantic/smart_link filtering, auto-expansion

### Phase 2: Tab System Integration ✅ (commit a75d02b9)
5. ✅ Extend `Tab` union with `"search_graph"` kind (+ `PersistedTab`)
6. ✅ Add `open_search_graph_tab()` to `TabStore`
7. ✅ Handle in `TabService` persistence/restore (with `crypto.randomUUID()` for tab IDs on restore)
8. ✅ Add `filter_override_ids` prop to `VaultGraphCanvas`
9. ✅ Move `search_graph_types.ts` from `domain/` to `ports.ts` (fix layering violation: stores cannot import domain)
10. ✅ Guard `search_graph` in `tab_action_helpers.ts` (skip closed history) and `tab_actions.ts` (skip copy path)

### Phase 3: Service + Actions ✅ (commit 6a6e611b)
11. ✅ Add `execute_search_graph`, `select_search_graph_node`, `hover_search_graph_node`, `toggle_search_graph_user_expanded` to `GraphService` (optional `search_graph_store` constructor param)
12. ✅ Add 7 action IDs: `search_graph_open`, `execute`, `select_node`, `hover_node`, `close`, `toggle_semantic`, `toggle_smart_links`
13. ✅ Create `search_graph_actions.ts` — open (create instance + tab + optional initial query), execute, select, hover, close, toggle actions
14. ✅ Wire in DI: `SearchGraphStore` in `AppStores`/`create_app_stores`, pass to `GraphService`, register `search_graph_actions` in `create_app_context`

### Phase 4: UI Components ✅ (commit 14339e8c)
13. ✅ `search_graph_result_list.svelte` — scrollable card list with hit/neighbor badges, edge type indicators (wiki=solid, semantic=dashed, smart=dotted), cross-highlight support, scroll-into-view on graph selection
14. ✅ `search_graph_canvas.svelte` — thin adapter over `VaultGraphCanvas`, maps `SearchGraphSnapshot` → `VaultGraphSnapshot` + `SemanticEdge[]` + `SmartLinkEdge[]`, passes `filter_override_ids` for hit/neighbor visual distinction
15. ✅ `search_graph_tab_view.svelte` — split layout with `Resizable.PaneGroup` (55/45 default), toolbar with search input + edge toggles + close, status bar with hit/neighbor/edge counts, loading/error/idle states
16. ��� Add `search_graph` routing branch in `note_editor.svelte` (before graph branch, passes `tab_id` + `initial_query`)
17. ✅ Update exports in `graph/index.ts` — export `SearchGraphTabView`, `SearchGraphCanvas`, `SearchGraphResultList`

### Phase 5: Entry Points + Polish
18. Command palette / keybinding for "Open Search Graph"
19. Context menu integration on existing search results
20. Loading/empty/error states
21. Status bar with edge type stats
22. Style polish and responsive behavior

---

## 13. Risks & Open Questions

1. **Vault snapshot dependency**: Subgraph extraction needs the full vault graph. If not cached, initial load could be slow for large vaults. Mitigation: reuse cached `graph_store.vault_snapshot` when available; show loading indicator otherwise.

2. **Performance on large vaults**: Edge iteration for subgraph extraction is O(E). Pre-built adjacency map makes neighbor lookup O(1). For 10K+ notes this should be fine. PixiJS renderer already handles variable-size graphs well.

3. **Service placement**: Keep search graph methods in `GraphService` (which already has both `search_port` and `graph_port`). Extract to dedicated `SearchGraphService` only if it grows beyond ~6 methods.

4. **Semantic/smart link edges**: Start with wiki edges only. Add semantic/smart link as lazy toggles (matching existing graph tab UX). These require async IPC calls that shouldn't block initial render.

5. **Tab persistence**: Search graph tabs persist with their query. On session restore, re-execute the search. Results may differ if vault content changed — this is expected and correct.

6. **Multiple instances**: Map-keyed-by-tab-id in store is non-standard vs. other singleton stores. Alternative: component-local `$state`. Trade-off: local state is simpler but unreachable by actions. Store approach is consistent with architecture guidance. Keep the store.

7. **No Rust changes needed**: All data comes from existing Tauri commands (`graph_load_vault_graph`, `search_notes`). Subgraph extraction is pure frontend logic.
