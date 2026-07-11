import type { SearchGraphSnapshot, SearchGraphSortMode } from "../ports";

export type SearchGraphStatus = "idle" | "loading" | "ready" | "error";

export type SearchGraphInstance = {
  query: string;
  status: SearchGraphStatus;
  error: string | null;
  snapshot: SearchGraphSnapshot | null;
  auto_expanded_ids: Set<string>;
  user_expanded_ids: Set<string>;
  selected_node_id: string | null;
  selected_node_ids: Set<string>;
  hovered_node_id: string | null;
  scroll_to_path: string | null;
  show_semantic_edges: boolean;
  show_smart_link_edges: boolean;
  show_neighbors: boolean;
  min_score: number;
  sort_mode: SearchGraphSortMode;
  sort_ascending: boolean;
  graph_expanded: boolean;
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
    selected_node_ids: new Set(),
    hovered_node_id: null,
    scroll_to_path: null,
    show_semantic_edges: false,
    show_smart_link_edges: false,
    show_neighbors: true,
    min_score: 0,
    sort_mode: "relevance",
    sort_ascending: false,
    graph_expanded: false,
  };
}

export class SearchGraphStore {
  instances = $state<Map<string, SearchGraphInstance>>(new Map());

  private update(tab_id: string, patch: Partial<SearchGraphInstance>): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    const next = new Map(this.instances);
    next.set(tab_id, { ...inst, ...patch });
    this.instances = next;
  }

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
    this.update(tab_id, { status: "loading", error: null });
  }

  set_snapshot(
    tab_id: string,
    snapshot: SearchGraphSnapshot,
    auto_expanded_ids: Set<string>,
  ): void {
    this.update(tab_id, {
      snapshot,
      auto_expanded_ids,
      status: "ready",
      error: null,
    });
  }

  set_error(tab_id: string, message: string): void {
    this.update(tab_id, { status: "error", error: message, snapshot: null });
  }

  select_node(tab_id: string, node_id: string | null): void {
    this.update(tab_id, {
      selected_node_id: node_id,
      scroll_to_path: node_id,
    });
  }

  toggle_selected(tab_id: string, node_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    const next = new Set(inst.selected_node_ids);
    if (next.has(node_id)) {
      next.delete(node_id);
    } else {
      next.add(node_id);
    }
    this.update(tab_id, { selected_node_ids: next });
  }

  select_range(
    tab_id: string,
    from_id: string,
    to_id: string,
    ordered_paths: string[],
  ): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    const from_idx = ordered_paths.indexOf(from_id);
    const to_idx = ordered_paths.indexOf(to_id);
    if (from_idx === -1 || to_idx === -1) return;
    const lo = Math.min(from_idx, to_idx);
    const hi = Math.max(from_idx, to_idx);
    const next = new Set(inst.selected_node_ids);
    for (let i = lo; i <= hi; i++) {
      const p = ordered_paths[i];
      if (p != null) next.add(p);
    }
    this.update(tab_id, { selected_node_ids: next });
  }

  clear_selected(tab_id: string): void {
    this.update(tab_id, { selected_node_ids: new Set() });
  }

  select_all_visible(tab_id: string, paths: string[]): void {
    this.update(tab_id, { selected_node_ids: new Set(paths) });
  }

  set_hovered_node(tab_id: string, node_id: string | null): void {
    this.update(tab_id, { hovered_node_id: node_id });
  }

  toggle_user_expanded(tab_id: string, node_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    const next_expanded = new Set(inst.user_expanded_ids);
    if (next_expanded.has(node_id)) {
      next_expanded.delete(node_id);
    } else {
      next_expanded.add(node_id);
    }
    this.update(tab_id, { user_expanded_ids: next_expanded });
  }

  clear_scroll_to(tab_id: string): void {
    this.update(tab_id, { scroll_to_path: null });
  }

  toggle_semantic_edges(tab_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    this.update(tab_id, { show_semantic_edges: !inst.show_semantic_edges });
  }

  toggle_smart_link_edges(tab_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    this.update(tab_id, {
      show_smart_link_edges: !inst.show_smart_link_edges,
    });
  }

  toggle_neighbors(tab_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    this.update(tab_id, { show_neighbors: !inst.show_neighbors });
  }

  set_min_score(tab_id: string, score: number): void {
    this.update(tab_id, { min_score: score });
  }

  set_graph_expanded(tab_id: string, expanded: boolean): void {
    this.update(tab_id, { graph_expanded: expanded });
  }

  set_sort_mode(tab_id: string, sort_mode: SearchGraphSortMode): void {
    this.update(tab_id, { sort_mode });
  }

  toggle_sort_order(tab_id: string): void {
    const inst = this.instances.get(tab_id);
    if (!inst) return;
    this.update(tab_id, { sort_ascending: !inst.sort_ascending });
  }

  update_query(tab_id: string, query: string): void {
    this.update(tab_id, { query });
  }
}
