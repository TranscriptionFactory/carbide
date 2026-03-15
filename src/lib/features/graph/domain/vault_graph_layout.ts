import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { SemanticEdge, VaultGraphSnapshot } from "$lib/features/graph/ports";

export type ForceNode = SimulationNodeDatum & {
  id: string;
  label: string;
};

export type ForceEdge = SimulationLinkDatum<ForceNode> & {
  source_id: string;
  target_id: string;
};

export type VaultGraphViewNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  connected_to_hovered: boolean;
};

export type VaultGraphViewEdge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dimmed: boolean;
  highlighted: boolean;
  semantic: boolean;
  distance?: number;
};

export type VaultGraphView = {
  nodes: VaultGraphViewNode[];
  edges: VaultGraphViewEdge[];
};

export type VaultGraphSimulationState = {
  simulation: Simulation<ForceNode, ForceEdge>;
  nodes: ForceNode[];
  edges: ForceEdge[];
};

export function create_vault_graph_simulation(
  snapshot: VaultGraphSnapshot,
): VaultGraphSimulationState {
  const nodes: ForceNode[] = snapshot.nodes.map((n) => ({
    id: n.path,
    label: n.title,
  }));

  const node_set = new Set(nodes.map((n) => n.id));

  const edges: ForceEdge[] = snapshot.edges
    .filter((e) => node_set.has(e.source) && node_set.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      source_id: e.source,
      target_id: e.target,
    }));

  const simulation = forceSimulation<ForceNode, ForceEdge>(nodes)
    .force(
      "link",
      forceLink<ForceNode, ForceEdge>(edges)
        .id((d) => d.id)
        .distance(80),
    )
    .force("charge", forceManyBody().strength(-200).distanceMax(500))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide<ForceNode>(20))
    .stop();

  return { simulation, nodes, edges };
}

export function stabilize_simulation(
  state: VaultGraphSimulationState,
  ticks = 150,
): void {
  state.simulation.tick(ticks);
}

function matches_filter(query: string, label: string, id: string): boolean {
  if (!query) return true;
  const lower = query.toLocaleLowerCase();
  return (
    label.toLocaleLowerCase().includes(lower) ||
    id.toLocaleLowerCase().includes(lower)
  );
}

function get_node_position(node: ForceNode): { x: number; y: number } {
  return { x: node.x ?? 0, y: node.y ?? 0 };
}

export function resolve_vault_graph_view(input: {
  state: VaultGraphSimulationState;
  filter_query: string;
  selected_node_ids: string[];
  hovered_node_id: string | null;
  viewport?: { x: number; y: number; width: number; height: number };
  semantic_edges?: SemanticEdge[];
  show_semantic_edges?: boolean;
}): VaultGraphView {
  const {
    state,
    filter_query,
    selected_node_ids,
    hovered_node_id,
    viewport,
    semantic_edges = [],
    show_semantic_edges = false,
  } = input;
  const selected = new Set(selected_node_ids);
  const query = filter_query.trim();

  const hovered_connections = new Set<string>();
  if (hovered_node_id) {
    for (const edge of state.edges) {
      const src =
        typeof edge.source === "object"
          ? (edge.source as ForceNode).id
          : edge.source_id;
      const tgt =
        typeof edge.target === "object"
          ? (edge.target as ForceNode).id
          : edge.target_id;
      if (src === hovered_node_id) hovered_connections.add(tgt);
      if (tgt === hovered_node_id) hovered_connections.add(src);
    }
  }

  const nodes: VaultGraphViewNode[] = [];
  for (const node of state.nodes) {
    const pos = get_node_position(node);
    if (
      viewport &&
      (pos.x < viewport.x - 50 ||
        pos.x > viewport.x + viewport.width + 50 ||
        pos.y < viewport.y - 50 ||
        pos.y > viewport.y + viewport.height + 50)
    ) {
      continue;
    }

    const matches = matches_filter(query, node.label, node.id);
    nodes.push({
      id: node.id,
      label: node.label,
      x: pos.x,
      y: pos.y,
      selected: selected.has(node.id),
      hovered: node.id === hovered_node_id,
      dimmed: !!query && !matches,
      connected_to_hovered:
        hovered_node_id !== null && hovered_connections.has(node.id),
    });
  }

  const edges: VaultGraphViewEdge[] = [];
  for (const edge of state.edges) {
    const src = edge.source as ForceNode;
    const tgt = edge.target as ForceNode;
    const src_pos = get_node_position(src);
    const tgt_pos = get_node_position(tgt);

    const src_matches = matches_filter(query, src.label, src.id);
    const tgt_matches = matches_filter(query, tgt.label, tgt.id);
    const is_highlighted =
      hovered_node_id !== null &&
      (src.id === hovered_node_id || tgt.id === hovered_node_id);

    edges.push({
      id: `${src.id}→${tgt.id}`,
      x1: src_pos.x,
      y1: src_pos.y,
      x2: tgt_pos.x,
      y2: tgt_pos.y,
      dimmed: !!query && (!src_matches || !tgt_matches),
      highlighted: is_highlighted,
      semantic: false,
    });
  }

  if (show_semantic_edges) {
    const node_map = new Map<string, ForceNode>(
      state.nodes.map((n) => [n.id, n]),
    );

    for (const sem_edge of semantic_edges) {
      const src = node_map.get(sem_edge.source);
      const tgt = node_map.get(sem_edge.target);
      if (!src || !tgt) continue;

      const src_pos = get_node_position(src);
      const tgt_pos = get_node_position(tgt);
      const src_matches = matches_filter(query, src.label, src.id);
      const tgt_matches = matches_filter(query, tgt.label, tgt.id);
      const is_highlighted =
        hovered_node_id !== null &&
        (src.id === hovered_node_id || tgt.id === hovered_node_id);

      edges.push({
        id: `sem:${src.id}↔${tgt.id}`,
        x1: src_pos.x,
        y1: src_pos.y,
        x2: tgt_pos.x,
        y2: tgt_pos.y,
        dimmed: !!query && (!src_matches || !tgt_matches),
        highlighted: is_highlighted,
        semantic: true,
        distance: sem_edge.distance,
      });
    }
  }

  return { nodes, edges };
}
