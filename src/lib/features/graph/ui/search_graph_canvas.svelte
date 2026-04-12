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
  }: Props = $props();

  function to_vault_snapshot(snap: SearchGraphSnapshot): VaultGraphSnapshot {
    const nodes: VaultGraphNode[] = snap.nodes.map((n) => ({
      path: n.path,
      title: n.title,
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

  const hit_ids = $derived(
    new Set(snapshot.nodes.filter((n) => n.kind === "hit").map((n) => n.path)),
  );

  const vault_snapshot = $derived(to_vault_snapshot(snapshot));
  const semantic_edges = $derived(extract_semantic_edges(snapshot.edges));
  const smart_link_edges = $derived(extract_smart_link_edges(snapshot.edges));
  const selected_list = $derived(selected_node_id ? [selected_node_id] : []);
</script>

<VaultGraphCanvas
  snapshot={vault_snapshot}
  filter_query=""
  filter_override_ids={hit_ids}
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
/>
