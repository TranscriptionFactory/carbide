import type { SearchGraphSnapshot } from "../domain/search_graph_types";

export type SearchGraphStatus = "idle" | "loading" | "ready" | "error";

export type SearchGraphInstance = {
  query: string;
  status: SearchGraphStatus;
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

function create_instance(query: string): SearchGraphInstance {
  return {
    query,
    status: "idle",
    error: null,
    snapshot: null,
    auto_expanded_ids: new Set(),
    user_expanded_ids: new Set(),
    selected_node_id: null,
    hovered_node_id: null,
    scroll_to_path: null,
    show_semantic_edges: false,
    show_smart_link_edges: false,
  };
}

export class SearchGraphStore {
  instances = $state<Map<string, SearchGraphInstance>>(new Map());

  create_instance(tab_id: string, query: string): void {
    const next = new Map(this.instances);
    next.set(tab_id, create_instance(query));
    this.instances = next;
  }

  remove_instance(tab_id: string): void {
    const next = new Map(this.instances);
    next.delete(tab_id);
    this.instances = next;
  }

  get_instance(tab_id: string): SearchGraphInstance | undefined {
    return this.instances.get(tab_id);
  }

  set_loading(tab_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    inst.status = "loading";
    inst.error = null;
  }

  set_snapshot(
    tab_id: string,
    snapshot: SearchGraphSnapshot,
    auto_expanded_ids: Set<string>,
  ): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    inst.snapshot = snapshot;
    inst.auto_expanded_ids = auto_expanded_ids;
    inst.status = "ready";
    inst.error = null;
  }

  set_error(tab_id: string, message: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    inst.status = "error";
    inst.error = message;
    inst.snapshot = null;
  }

  select_node(tab_id: string, node_id: string | null): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    inst.selected_node_id = node_id;
    inst.scroll_to_path = node_id;
  }

  set_hovered_node(tab_id: string, node_id: string | null): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    inst.hovered_node_id = node_id;
  }

  toggle_user_expanded(tab_id: string, node_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    const next = new Set(inst.user_expanded_ids);
    if (next.has(node_id)) {
      next.delete(node_id);
    } else {
      next.add(node_id);
    }
    inst.user_expanded_ids = next;
  }

  clear_scroll_to(tab_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    inst.scroll_to_path = null;
  }

  toggle_semantic_edges(tab_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    inst.show_semantic_edges = !inst.show_semantic_edges;
  }

  toggle_smart_link_edges(tab_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    inst.show_smart_link_edges = !inst.show_smart_link_edges;
  }

  update_query(tab_id: string, query: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    inst.query = query;
  }
}
