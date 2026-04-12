import type {
  GraphNeighborhoodSnapshot,
  HierarchyTreeNode,
  SemanticEdge,
  SmartLinkEdge,
  VaultGraphSnapshot,
} from "$lib/features/graph/ports";

export type GraphStatus = "idle" | "loading" | "ready" | "error";
export type GraphViewMode = "neighborhood" | "vault" | "hierarchy";

export class GraphStore {
  panel_open = $state(false);
  status = $state<GraphStatus>("idle");
  error = $state<string | null>(null);
  snapshot = $state<GraphNeighborhoodSnapshot | null>(null);
  center_note_path = $state<string | null>(null);
  selected_node_ids = $state<string[]>([]);
  hovered_node_id = $state<string | null>(null);
  filter_query = $state("");
  view_mode = $state<GraphViewMode>("neighborhood");
  vault_snapshot = $state<VaultGraphSnapshot | null>(null);
  semantic_edges = $state<SemanticEdge[]>([]);
  show_semantic_edges = $state(false);
  smart_link_edges = $state<SmartLinkEdge[]>([]);
  show_smart_link_edges = $state(false);
  hierarchy_tree = $state<HierarchyTreeNode[] | null>(null);
  hierarchy_root_key = $state<string | null>(null);

  set_panel_open(open: boolean) {
    this.panel_open = open;
  }

  start_loading(note_path: string) {
    this.center_note_path = note_path;
    this.status = "loading";
    this.error = null;
  }

  set_snapshot(snapshot: GraphNeighborhoodSnapshot) {
    this.snapshot = snapshot;
    this.center_note_path = snapshot.center.path;
    this.status = "ready";
    this.error = null;
    if (!this.selected_node_ids.includes(snapshot.center.path)) {
      this.selected_node_ids = [snapshot.center.path];
    }
  }

  set_error(note_path: string, message: string) {
    this.snapshot = null;
    this.center_note_path = note_path;
    this.status = "error";
    this.error = message;
    this.selected_node_ids = [];
    this.hovered_node_id = null;
  }

  clear_snapshot() {
    this.snapshot = null;
    this.center_note_path = null;
    this.status = "idle";
    this.error = null;
    this.selected_node_ids = [];
    this.hovered_node_id = null;
    this.filter_query = "";
  }

  clear_interaction_state() {
    this.selected_node_ids = [];
    this.hovered_node_id = null;
    this.filter_query = "";
  }

  select_node(node_id: string | null) {
    this.selected_node_ids = node_id ? [node_id] : [];
  }

  set_hovered_node(node_id: string | null) {
    this.hovered_node_id = node_id;
  }

  set_filter_query(query: string) {
    this.filter_query = query;
  }

  set_view_mode(mode: GraphViewMode) {
    this.view_mode = mode;
  }

  start_loading_vault() {
    this.vault_snapshot = null;
    this.status = "loading";
    this.error = null;
  }

  set_vault_snapshot(snapshot: VaultGraphSnapshot) {
    this.vault_snapshot = snapshot;
    this.status = "ready";
    this.error = null;
  }

  set_semantic_edges(edges: SemanticEdge[]) {
    this.semantic_edges = edges;
  }

  toggle_show_semantic_edges() {
    this.show_semantic_edges = !this.show_semantic_edges;
  }

  set_smart_link_edges(edges: SmartLinkEdge[]) {
    this.smart_link_edges = edges;
  }

  toggle_show_smart_link_edges() {
    this.show_smart_link_edges = !this.show_smart_link_edges;
  }

  start_loading_hierarchy() {
    this.hierarchy_tree = null;
    this.status = "loading";
    this.error = null;
  }

  set_hierarchy_tree(tree: HierarchyTreeNode[], root_key: string | null) {
    this.hierarchy_tree = tree;
    this.hierarchy_root_key = root_key;
    this.status = "ready";
    this.error = null;
  }

  clear() {
    this.panel_open = false;
    this.clear_snapshot();
    this.vault_snapshot = null;
    this.hierarchy_tree = null;
    this.hierarchy_root_key = null;
    this.view_mode = "neighborhood";
    this.semantic_edges = [];
    this.show_semantic_edges = false;
    this.smart_link_edges = [];
    this.show_smart_link_edges = false;
  }
}
