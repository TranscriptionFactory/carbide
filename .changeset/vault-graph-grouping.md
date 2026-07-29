---
"carbide": minor
---

feat(graph): vault graph folder grouping, cluster tints, and a toolbar grouping control

- **Folder grouping is live**: the vault graph adapter now tags every node with its containing folder, and grouping forces are always sent to the layout worker instead of only for search graphs — so folders actually pull apart and get convex hulls.
- **Cluster grouping is visible**: computed cluster assignments feed back into the canvas as node groups, re-running the layout with cluster forces and painting nodes and hulls per group. Group tints come from new `--graph-group-1..5` tokens — chart-token hues re-stepped in OKLCH until every pair clears colorblind-separation, chroma, and contrast thresholds against both the light and dark surface.
- **Grouping control**: the graph tab toolbar gets a Folder / Cluster / No grouping select (previously grouping could only be cycled blind from the small panel's icon button), backed by a new `graph.set_group_mode` action.
- **Cleanup**: the dead `graph_tauri_adapter`, which invoked Tauri commands the backend never registered, is archived out of the feature.
