import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";

type WorkerNode = SimulationNodeDatum & { id: string };
type WorkerEdge = SimulationLinkDatum<WorkerNode> & {
  source_id: string;
  target_id: string;
};

type InboundMessage =
  | {
      type: "init";
      nodes: { id: string; x?: number; y?: number }[];
      edges: { source: string; target: string }[];
    }
  | { type: "tick_budget"; ticks: number }
  | { type: "reheat"; alpha?: number }
  | { type: "pin_node"; id: string; x: number; y: number }
  | { type: "unpin_node"; id: string }
  | { type: "stop" };

type OutboundMessage =
  | { type: "positions"; ids: string[]; buffer: Float64Array }
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
  post({ type: "positions", ids: node_ids, buffer }, [buffer.buffer]);
}

function handle_init(msg: Extract<InboundMessage, { type: "init" }>): void {
  if (simulation) {
    simulation.stop();
  }

  const node_set = new Set(msg.nodes.map((n) => n.id));

  nodes = msg.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
  }));
  node_ids = nodes.map((n) => n.id);

  const edges: WorkerEdge[] = msg.edges
    .filter((e) => node_set.has(e.source) && node_set.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      source_id: e.source,
      target_id: e.target,
    }));

  simulation = forceSimulation<WorkerNode, WorkerEdge>(nodes)
    .force(
      "link",
      forceLink<WorkerNode, WorkerEdge>(edges)
        .id((d) => d.id)
        .distance(80),
    )
    .force("charge", forceManyBody().strength(-200).distanceMax(500))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(20))
    .stop();

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
