# Graph Settings, Advanced Filters, and Query Groups — Implementation Plan

## Goal

Extend the Graph tab in the Settings panel so users can control graph rendering more directly, then add a second, more capable layer for graph filtering and query-based grouping without turning the settings model into a mess.

## Why this needs a staged plan

This request is really two different pieces of work:

1. cheap and worthwhile graph appearance settings
2. graph data and query model expansion

Treating those as one undifferentiated feature is how we end up with a bloated settings schema, fake toggles, and brittle graph code.

## Current state

### What already exists

- `src/lib/features/settings/ui/settings_dialog.svelte` already has a `graph` category
- that category currently exposes only four force-layout controls:
  - `graph_force_link_distance`
  - `graph_force_charge_strength`
  - `graph_force_collision_radius`
  - `graph_force_charge_max_distance`
- full-vault graph rendering already uses the Pixi renderer in:
  - `src/lib/features/graph/ui/vault_graph_canvas.svelte`
  - `src/lib/features/graph/domain/vault_graph_renderer.ts`
- neighborhood graph rendering already supports orphan links in:
  - `src/lib/features/graph/domain/graph_canvas_view.ts`
- metadata infrastructure already exists and is indexed in SQLite:
  - tags via `note_inline_tags`
  - sections via `note_sections`
  - properties via `note_properties`
  - query surface via Bases and search DB helpers

### Important limitations

- current graph filtering is only a plain text title or path filter
- full-vault graph snapshot contains only note nodes and note to note edges
- orphan nodes exist only in neighborhood view today
- attachment nodes do not exist in graph data today
- `src/lib/features/settings/application/settings_actions.ts` currently does not include the existing `graph_force_*` keys in `SETTINGS_COMPARE_KEYS`, so graph-only edits do not correctly participate in dirty-state detection

## Product goals

### Phase 1 goals

- add more useful graph appearance and behavior controls
- keep them inside the existing Graph settings tab
- wire them cleanly into both neighborhood and full-vault views

### Phase 2 goals

- support advanced graph filtering
- support query-based graph groups
- reuse the existing metadata and indexing stack instead of inventing a second graph database or a parallel query system

## Non-goals

- nested boolean query builders
- graph hulls, cluster physics, or layout-changing group behavior
- cross-vault graph grouping
- adding attachment toggles before attachment nodes exist
- stuffing complex graph configuration into the flat `EditorSettings` type

## Key decisions

### D1. Split simple graph settings from advanced graph configuration

Use two persistence shapes:

1. `EditorSettings` for simple scalar rendering and behavior defaults
2. a new vault-scoped `GraphPreferences` object for structured filters and query groups

This keeps common controls simple while avoiding a flat settings blob full of array-heavy graph state.

### D2. Do not grow `settings_dialog.svelte` further inline

The settings dialog is already large. Extract the Graph tab UI into its own component instead of adding another several hundred lines to the current file.

Recommended new UI module:

- `src/lib/features/settings/ui/graph_settings_panel.svelte`

### D3. Reuse the metadata index, but keep the frontend command surface graph-specific

Graph queries should be served by graph-specific commands in `src-tauri/src/features/graph/service.rs`, even if the heavy lifting lives in `src-tauri/src/features/search/db.rs`.

That keeps the frontend mental model clean:

- graph asks graph for graph data
- search and metadata remain internal dependencies

### D4. Treat attachments as a separate graph model expansion

A toggle to filter attachment nodes is fake if attachment nodes do not exist.

So:

- neighborhood orphan filtering is valid now
- tag/property/section/filepath/filename/keyword filtering is valid now for note nodes
- attachment filtering is only valid after attachment nodes become part of graph snapshots

### D5. Keep grouping visual only in the first iteration

Initial group behavior should be:

- color or ring decoration on nodes
- group legend
- enable or disable groups
- optional filter to only show nodes in selected groups

Do not start with:

- hulls
- cluster containers
- group-driven layout forces
- edge recoloring by group intersections

## Proposed architecture

## Phase 0: cleanup and groundwork

### Scope

- fix current graph settings dirty-state bug
- extract Graph settings UI into a dedicated subcomponent

### Files

- `src/lib/features/settings/application/settings_actions.ts`
- `src/lib/features/settings/ui/settings_dialog.svelte`
- `src/lib/features/settings/ui/graph_settings_panel.svelte`
- `tests/unit/actions/register_settings_actions.test.ts`

### Required change

Add existing graph keys to `SETTINGS_COMPARE_KEYS`:

- `graph_force_link_distance`
- `graph_force_charge_strength`
- `graph_force_collision_radius`
- `graph_force_charge_max_distance`

Without this, the current graph settings flow is already wrong.

## Phase 1: graph appearance and interaction settings

### Recommended settings to add to `EditorSettings`

These are simple scalars and booleans, so they belong in `src/lib/shared/types/editor_settings.ts`.

- `graph_show_labels: boolean`
- `graph_node_radius_px: number`
- `graph_edge_width_px: number`
- `graph_edge_opacity: number`
- `graph_dimmed_node_opacity: number`
- `graph_selected_node_scale: number`
- `graph_hovered_node_scale: number`
- `graph_semantic_edge_width_px: number`
- `graph_semantic_edge_opacity: number`
- `graph_neighborhood_show_orphans: boolean`

### Why these belong in `EditorSettings`

They are:

- scalar
- global by nature
- cheap to render
- easy to search and reset in the existing settings UI

### Frontend wiring

#### Settings UI

- add controls in `graph_settings_panel.svelte`
- register settings search metadata in `src/lib/features/settings/domain/settings_catalog.ts`

#### Neighborhood graph

Wire into:

- `src/lib/features/graph/domain/graph_canvas_view.ts`
- `src/lib/features/graph/ui/graph_canvas.svelte`

Use `graph_neighborhood_show_orphans` to hide orphan nodes and orphan edges in the resolved neighborhood view.

#### Full-vault graph

Wire into:

- `src/lib/features/graph/ui/graph_panel.svelte`
- `src/lib/features/graph/ui/graph_tab_view.svelte`
- `src/lib/features/graph/ui/vault_graph_canvas.svelte`
- `src/lib/features/graph/domain/vault_graph_renderer.ts`

Renderer changes should be strictly visual:

- label visibility
- node radius
- edge width and opacity
- semantic edge width and opacity
- selected and hovered scale multipliers
- dimmed node opacity

### Tests

- `tests/unit/actions/register_settings_actions.test.ts`
- `tests/unit/stores/graph_store_vault.test.ts`
- `tests/unit/domain/vault_graph_layout.test.ts`
- new renderer-focused tests where practical

## Phase 2: structured graph preferences

### New model

Add a graph-specific persisted model owned by the graph feature and edited from the settings panel.

Recommended types:

```ts
export type GraphQueryClause =
  | { kind: "filepath"; operator: "contains" | "eq"; value: string }
  | { kind: "filename"; operator: "contains" | "eq"; value: string }
  | { kind: "tag"; operator: "eq" | "prefix"; value: string }
  | { kind: "keyword"; operator: "contains"; value: string }
  | { kind: "section"; operator: "contains" | "eq"; value: string }
  | {
      kind: "property";
      key: string;
      operator: "eq" | "contains" | "gt" | "lt" | "gte" | "lte";
      value: string;
    };

export type GraphNodeQuery = {
  mode: "all" | "any";
  clauses: GraphQueryClause[];
};

export type GraphGroupDefinition = {
  id: string;
  label: string;
  color: string;
  enabled: boolean;
  query: GraphNodeQuery;
};

export type GraphPreferences = {
  hide_orphans_by_default: boolean;
  groups: GraphGroupDefinition[];
};
```

### Scope and persistence

`GraphPreferences` should be vault-scoped.

Reason:

- filepath, filename, tags, properties, and sections are vault-specific
- grouping rules are tied to actual vault content
- global persistence here would be more confusing than helpful

### Recommended storage path

Persist under a new key, not inside the flat editor settings payload.

Recommended key:

- `graph_preferences`

### Frontend ownership

- schema in graph feature
- persistence orchestration in settings feature
- runtime application in graph feature

### Files

- `src/lib/features/graph/types/graph_preferences.ts` or equivalent graph domain file
- `src/lib/features/settings/application/settings_service.ts`
- `src/lib/features/settings/application/settings_actions.ts`
- `src/lib/features/settings/ui/graph_settings_panel.svelte`
- `src/lib/app/bootstrap/ui/app_shell_dialogs.svelte`
- UI state shape for the settings dialog draft in `UIStore`

## Phase 3: graph query backend

### Objective

Add graph-specific commands that resolve:

1. node memberships for saved groups
2. node path sets for graph filters

### Do not do this

- do not issue one IPC call per group and per node
- do not scan Markdown files from the frontend
- do not reimplement metadata parsing in TypeScript

### Rust surface

Recommended new commands in `src-tauri/src/features/graph/service.rs`:

- `graph_query_node_paths(vault_id, query) -> Vec<String>`
- `graph_resolve_groups(vault_id, groups) -> Vec<{ id, paths }>`

### Query implementation

Implement DB helpers in `src-tauri/src/features/search/db.rs` and call them from graph service.

#### Query sources

- filepath: `notes.path`
- filename: path leaf or stem derived from `notes.path`
- tag: `note_inline_tags`
- section: `note_sections`
- property: `note_properties`
- keyword: existing FTS-backed note content search, returning path sets instead of UI hits

### Important note on keyword queries

Keyword groups and filters should use the indexed search DB, not ad hoc file reads.

If the current search helper shape is awkward for this, add a path-only helper instead of trying to repurpose the higher-level search result objects.

## Phase 4: advanced graph filters and groups in the frontend

### Runtime state

Add structured runtime state to `GraphStore`, separate from the existing plain text filter query.

Recommended additions:

- active saved filter state
- resolved group memberships
- active group ids
- whether group highlighting is enabled

This should remain runtime state only. Persistence stays in `GraphPreferences`.

### UI behavior

#### Settings panel

Graph tab sections:

1. Layout and appearance
2. Default filtering
3. Query groups

#### Graph panel and graph tab

Add:

- group legend
- toggle to enable or disable group highlighting
- optional control to filter graph to selected groups

### Rendering behavior

#### Full-vault graph

- group membership decorates note nodes
- decoration should be color tint, outline, or ring
- non-grouped nodes remain neutral

#### Neighborhood graph

- decorate only existing note nodes in the first pass
- orphan nodes stay visually distinct and are not group-aware initially

## Phase 5: optional attachment-node expansion

This is not required for the first useful version.

It becomes necessary only if we want attachment filtering to mean anything real.

### Required model change

Expand graph node types beyond note nodes.

Example:

```ts
type GraphNodeKind = "note" | "orphan" | "attachment";
```

This implies coordinated changes in:

- `src-tauri/src/features/graph/types.rs`
- `src-tauri/src/features/graph/service.rs`
- `src/lib/features/graph/ports.ts`
- `src/lib/features/graph/domain/vault_graph_renderer.ts`
- graph layout and neighborhood view mapping

### Recommendation

Do not bundle this with the initial settings and grouping work.

It is a separate graph-domain expansion and deserves its own plan.

## BDD scenarios

### Scenario 1: graph-only setting edits become dirty

- Given the settings dialog is open
- When the user changes only a graph setting
- Then the dialog should show unsaved changes
- And save should persist those changes correctly

### Scenario 2: hide orphans in neighborhood view

- Given a note neighborhood includes orphan links
- When `graph_neighborhood_show_orphans` is false
- Then orphan nodes and their dashed edges are not rendered

### Scenario 3: tag-based group coloring

- Given a saved graph group with query `tag = project/carbide`
- When the vault graph is loaded
- Then matching nodes are decorated with the group color

### Scenario 4: property-based group membership

- Given a saved graph group with query `property status = active`
- When the graph resolves groups
- Then only notes with that property value join the group

### Scenario 5: section-based filtering

- Given a filter query for section title `Roadmap`
- When advanced graph filters are enabled
- Then matching notes are kept and non-matching notes are dimmed or hidden according to filter mode

### Scenario 6: keyword query uses indexed content

- Given notes containing a keyword in body content
- When a graph group uses a keyword clause
- Then group membership comes from indexed search data, not direct file reads

### Scenario 7: attachment controls remain honest

- Given attachment nodes are not yet part of graph snapshots
- When the user opens advanced graph settings
- Then attachment filtering is either hidden, disabled, or clearly labeled as unavailable

## Risks

### R1. Settings dialog bloat

The current dialog is already too large for more inline feature-specific UI.

Mitigation:

- extract `graph_settings_panel.svelte`

### R2. Flat settings model rot

Query groups do not belong in `EditorSettings`.

Mitigation:

- separate `GraphPreferences`

### R3. Slow group resolution

Naive per-group or per-node IPC will be too slow.

Mitigation:

- batch graph query commands in Rust

### R4. Keyword filter performance

Keyword matching can get expensive if implemented at the wrong layer.

Mitigation:

- use indexed search DB helpers returning path sets

### R5. Attachment scope creep

Attachment filtering sounds small but is actually a node-model expansion.

Mitigation:

- explicitly keep it out of the initial implementation

## Recommended delivery sequence

### PR 1

- fix graph settings dirty-state bug
- extract graph settings panel component
- add first-pass graph appearance settings

### PR 2

- add `GraphPreferences`
- add settings draft and persistence support
- add graph query backend for filepath, filename, tag, property, section, keyword

### PR 3

- add query group UI
- add group legend and node decoration
- add advanced graph filtering behavior

### PR 4

- optional attachment-node expansion if product still wants attachment filtering after the first three PRs land

## Recommended file touch list

### Frontend

- `src/lib/shared/types/editor_settings.ts`
- `src/lib/features/settings/ui/settings_dialog.svelte`
- `src/lib/features/settings/ui/graph_settings_panel.svelte`
- `src/lib/features/settings/domain/settings_catalog.ts`
- `src/lib/features/settings/application/settings_service.ts`
- `src/lib/features/settings/application/settings_actions.ts`
- `src/lib/app/bootstrap/ui/app_shell_dialogs.svelte`
- `src/lib/features/graph/state/graph_store.svelte.ts`
- `src/lib/features/graph/application/graph_service.ts`
- `src/lib/features/graph/ui/graph_panel.svelte`
- `src/lib/features/graph/ui/graph_tab_view.svelte`
- `src/lib/features/graph/ui/vault_graph_canvas.svelte`
- `src/lib/features/graph/domain/vault_graph_renderer.ts`
- `src/lib/features/graph/domain/graph_canvas_view.ts`

### Rust

- `src-tauri/src/features/graph/service.rs`
- `src-tauri/src/features/graph/types.rs`
- `src-tauri/src/features/search/db.rs`

### Tests

- `tests/unit/actions/register_settings_actions.test.ts`
- `tests/unit/services/settings_service.test.ts`
- `tests/unit/features/graph/application/graph_service.test.ts`
- `tests/unit/reactors/graph_refresh_reactor_vault.test.ts`
- new Rust tests for graph query helpers

## Bottom line

The right implementation is:

1. fix the existing graph settings flow
2. add real renderer and neighborhood toggles first
3. introduce a separate vault-scoped graph preferences model for advanced filters and groups
4. reuse metadata and search DB infrastructure for query resolution
5. defer attachment filtering until attachment nodes are real graph nodes

That sequence gives a useful feature early without burying the graph feature under fake settings and bad persistence decisions.
