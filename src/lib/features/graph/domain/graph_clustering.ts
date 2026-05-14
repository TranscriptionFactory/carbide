export type ClusterAssignment = Map<string, number>;

export function label_propagation(
  nodes: string[],
  edges: Array<{ source: string; target: string }>,
  max_iterations = 10,
): ClusterAssignment {
  if (nodes.length === 0) return new Map();

  const labels = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    labels.set(nodes[i]!, i);
  }

  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node, []);
  }
  for (const edge of edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
      adjacency.get(edge.target)!.push(edge.source);
    }
  }

  const node_order = [...nodes];

  for (let iter = 0; iter < max_iterations; iter++) {
    shuffle(node_order);
    let changed = false;

    for (const node of node_order) {
      const neighbors = adjacency.get(node);
      if (!neighbors || neighbors.length === 0) continue;

      const frequency = new Map<number, number>();
      for (const neighbor of neighbors) {
        const label = labels.get(neighbor)!;
        frequency.set(label, (frequency.get(label) ?? 0) + 1);
      }

      let max_count = 0;
      let best_label = labels.get(node)!;
      for (const [label, count] of frequency) {
        if (count > max_count || (count === max_count && label < best_label)) {
          max_count = count;
          best_label = label;
        }
      }

      if (best_label !== labels.get(node)) {
        labels.set(node, best_label);
        changed = true;
      }
    }

    if (!changed) break;
  }

  return normalize_labels(labels);
}

function normalize_labels(labels: ClusterAssignment): ClusterAssignment {
  const label_map = new Map<number, number>();
  let next_id = 0;
  const result = new Map<string, number>();

  for (const [node, label] of labels) {
    if (!label_map.has(label)) {
      label_map.set(label, next_id++);
    }
    result.set(node, label_map.get(label)!);
  }

  return result;
}

function shuffle(arr: string[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

export function is_clustering_meaningful(
  clusters: ClusterAssignment,
  node_count: number,
): boolean {
  if (node_count < 4) return false;

  const cluster_sizes = new Map<number, number>();
  for (const cluster_id of clusters.values()) {
    cluster_sizes.set(cluster_id, (cluster_sizes.get(cluster_id) ?? 0) + 1);
  }

  if (cluster_sizes.size < 2) return false;

  let singleton_count = 0;
  for (const size of cluster_sizes.values()) {
    if (size === 1) singleton_count++;
  }

  return singleton_count / node_count < 0.5;
}
