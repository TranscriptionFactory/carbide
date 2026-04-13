<script lang="ts">
  import type {
    SearchGraphSnapshot,
    SearchGraphEdge,
    VaultGraphSnapshot,
    VaultGraphNode,
    VaultGraphEdge,
    SemanticEdge,
    SmartLinkEdge,
  } from "$lib/features/graph/ports";
  import type { Theme } from "$lib/shared/types/theme";
  import VaultGraphCanvas from "$lib/features/graph/ui/vault_graph_canvas.svelte";

  type Props = {
    snapshot: SearchGraphSnapshot;
    selected_node_id: string | null;
    hovered_node_id: string | null;
    show_semantic_edges: boolean;
    show_smart_link_edges: boolean;
    theme: Theme;
    on_select_node: (node_id: string) => void;
    on_hover_node: (node_id: string | null) => void;
    on_open_node: (path: string) => void;
    on_expand_node?: (path: string) => void;
  };

  let {
    snapshot,
    selected_node_id,
    hovered_node_id,
    show_semantic_edges,
    show_smart_link_edges,
    theme,
    on_select_node,
    on_hover_node,
    on_open_node,
    on_expand_node,
  }: Props = $props();

  function folder_from_path(path: string): string {
    const idx = path.lastIndexOf("/");
    return idx >= 0 ? path.slice(0, idx) : "";
  }

  function normalize_scores(
    nodes: SearchGraphSnapshot["nodes"],
  ): Map<string, number> {
    let max_score = 0;
    for (const n of nodes) {
      if (n.score != null && n.score > max_score) max_score = n.score;
    }
    const result = new Map<string, number>();
    for (const n of nodes) {
      result.set(
        n.path,
        max_score > 0 && n.score != null ? n.score / max_score : 0,
      );
    }
    return result;
  }

  function to_vault_snapshot(snap: SearchGraphSnapshot): VaultGraphSnapshot {
    const scores = normalize_scores(snap.nodes);
    const nodes: VaultGraphNode[] = snap.nodes.map((n) => ({
      path: n.path,
      title: n.title,
      kind: n.kind,
      score: scores.get(n.path) ?? 0,
      group: folder_from_path(n.path),
    }));
    const edges: VaultGraphEdge[] = snap.edges
      .filter((e) => e.edge_type === "wiki")
      .map((e) => ({ source: e.source, target: e.target }));
    return {
      nodes,
      edges,
      stats: {
        node_count: nodes.length,
        edge_count: edges.length,
      },
    };
  }

  function extract_semantic_edges(
    snap_edges: SearchGraphEdge[],
  ): SemanticEdge[] {
    return snap_edges
      .filter((e) => e.edge_type === "semantic")
      .map((e) => ({
        source: e.source,
        target: e.target,
        distance: e.score ?? 0,
      }));
  }

  function extract_smart_link_edges(
    snap_edges: SearchGraphEdge[],
  ): SmartLinkEdge[] {
    return snap_edges
      .filter((e) => e.edge_type === "smart_link")
      .map((e) => ({
        source: e.source,
        target: e.target,
        score: e.score ?? 0,
        rules: [],
      }));
  }

  const vault_snapshot = $derived(to_vault_snapshot(snapshot));
  const semantic_edges = $derived(extract_semantic_edges(snapshot.edges));
  const smart_link_edges = $derived(extract_smart_link_edges(snapshot.edges));
  const selected_list = $derived(selected_node_id ? [selected_node_id] : []);
</script>

<VaultGraphCanvas
  snapshot={vault_snapshot}
  filter_query=""
  selected_node_ids={selected_list}
  {hovered_node_id}
  {semantic_edges}
  {show_semantic_edges}
  {smart_link_edges}
  {show_smart_link_edges}
  {theme}
  {on_select_node}
  {on_hover_node}
  {on_open_node}
  {on_expand_node}
/>
