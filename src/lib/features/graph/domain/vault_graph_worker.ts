import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

type WorkerNode = SimulationNodeDatum & {
  id: string;
  kind?: "hit" | "neighbor";
  group?: string;
};
type WorkerEdge = SimulationLinkDatum<WorkerNode> & {
  source_id: string;
  target_id: string;
};

type ForceParams = {
  link_distance: number;
  charge_strength: number;
  collision_radius: number;
  charge_max_distance: number;
};

type GroupingParams = {
  mode: "both" | "hit_center" | "folder";
  folder_strength: number;
  hit_center_strength: number;
};

type InboundMessage =
  | {
      type: "init";
      nodes: {
        id: string;
        x?: number;
        y?: number;
        kind?: "hit" | "neighbor";
        group?: string;
      }[];
      edges: { source: string; target: string }[];
      force_params?: ForceParams;
      grouping?: GroupingParams;
    }
  | { type: "tick_budget"; ticks: number }
  | { type: "reheat"; alpha?: number }
  | { type: "pin_node"; id: string; x: number; y: number }
  | { type: "unpin_node"; id: string }
  | { type: "stop" };

type OutboundMessage =
  | { type: "positions"; ids: string[]; buffer: ArrayBuffer }
  | { type: "stabilized" }
  | { type: "tick"; alpha: number };

let simulation: Simulation<WorkerNode, WorkerEdge> | null = null;
let nodes: WorkerNode[] = [];
let node_ids: string[] = [];

function compute_tick_budget(node_count: number): number {
  return Math.max(50, Math.min(Math.round(node_count * 0.5), 500));
}

function post(msg: OutboundMessage, transfer?: Transferable[]): void {
  if (transfer) {
    (
      self as unknown as {
        postMessage(msg: unknown, transfer: Transferable[]): void;
      }
    ).postMessage(msg, transfer);
  } else {
    self.postMessage(msg);
  }
}

function send_positions(): void {
  const buffer = new Float64Array(nodes.length * 2);
  for (let i = 0; i < nodes.length; i++) {
    buffer[i * 2] = nodes[i]!.x ?? 0;
    buffer[i * 2 + 1] = nodes[i]!.y ?? 0;
  }
  post({ type: "positions", ids: node_ids, buffer: buffer.buffer }, [
    buffer.buffer,
  ]);
}

function compute_group_grid(
  groups: string[],
): Map<string, { x: number; y: number }> {
  const unique = [...new Set(groups)].sort();
  const cols = Math.ceil(Math.sqrt(unique.length));
  const spacing = 300;
  const result = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < unique.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = (col - (cols - 1) / 2) * spacing;
    const cy = (row - (Math.ceil(unique.length / cols) - 1) / 2) * spacing;
    result.set(unique[i]!, { x: cx, y: cy });
  }
  return result;
}

function handle_init(msg: Extract<InboundMessage, { type: "init" }>): void {
  if (simulation) {
    simulation.stop();
  }

  const node_set = new Set(msg.nodes.map((n) => n.id));

  nodes = msg.nodes.map((n) => {
    const node: WorkerNode = { id: n.id, x: n.x, y: n.y };
    if (n.kind != null) node.kind = n.kind;
    if (n.group != null) node.group = n.group;
    return node;
  });
  node_ids = nodes.map((n) => n.id);

  const edges: WorkerEdge[] = msg.edges
    .filter((e) => node_set.has(e.source) && node_set.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      source_id: e.source,
      target_id: e.target,
    }));

  const fp = msg.force_params;
  const link_dist = fp?.link_distance ?? 80;
  const charge = fp?.charge_strength ?? -200;
  const collision = fp?.collision_radius ?? 20;
  const charge_max = fp?.charge_max_distance ?? 500;

  const sim = forceSimulation<WorkerNode, WorkerEdge>(nodes)
    .force(
      "link",
      forceLink<WorkerNode, WorkerEdge>(edges)
        .id((d) => d.id)
        .distance(link_dist),
    )
    .force("charge", forceManyBody().strength(charge).distanceMax(charge_max))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(collision))
    .stop();

  const gp = msg.grouping;
  if (gp) {
    const use_hit_center = gp.mode === "both" || gp.mode === "hit_center";
    const use_folder = gp.mode === "both" || gp.mode === "folder";

    if (use_hit_center) {
      const strength = gp.hit_center_strength;
      sim.force(
        "hit_x",
        forceX<WorkerNode>(0).strength((d) =>
          d.kind === "hit" ? strength : 0,
        ),
      );
      sim.force(
        "hit_y",
        forceY<WorkerNode>(0).strength((d) =>
          d.kind === "hit" ? strength : 0,
        ),
      );
    }

    if (use_folder) {
      const groups = nodes.filter((n) => n.group != null).map((n) => n.group!);
      if (groups.length > 0) {
        const grid = compute_group_grid(groups);
        const strength = gp.folder_strength;
        sim.force(
          "folder_x",
          forceX<WorkerNode>((d) => grid.get(d.group ?? "")?.x ?? 0).strength(
            (d) => (d.group != null ? strength : 0),
          ),
        );
        sim.force(
          "folder_y",
          forceY<WorkerNode>((d) => grid.get(d.group ?? "")?.y ?? 0).strength(
            (d) => (d.group != null ? strength : 0),
          ),
        );
      }
    }
  }

  simulation = sim;

  const budget = compute_tick_budget(nodes.length);
  for (let i = 0; i < budget; i++) {
    simulation.tick();
    if (simulation.alpha() < 0.001) break;
  }

  send_positions();
  post({ type: "stabilized" });
}

function handle_reheat(alpha?: number): void {
  if (!simulation) return;
  simulation.alpha(alpha ?? 0.3);

  const budget = 50;
  for (let i = 0; i < budget; i++) {
    simulation.tick();
    if (simulation.alpha() < 0.001) break;
  }

  send_positions();
  post({ type: "stabilized" });
}

function handle_pin(id: string, x: number, y: number): void {
  const node = nodes.find((n) => n.id === id);
  if (!node) return;
  node.fx = x;
  node.fy = y;
  handle_reheat(0.3);
}

function handle_unpin(id: string): void {
  const node = nodes.find((n) => n.id === id);
  if (!node) return;
  node.fx = null;
  node.fy = null;
  handle_reheat(0.1);
}

self.onmessage = (event: MessageEvent<InboundMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      handle_init(msg);
      break;
    case "reheat":
      handle_reheat(msg.alpha);
      break;
    case "pin_node":
      handle_pin(msg.id, msg.x, msg.y);
      break;
    case "unpin_node":
      handle_unpin(msg.id);
      break;
    case "stop":
      if (simulation) simulation.stop();
      self.close();
      break;
  }
};
