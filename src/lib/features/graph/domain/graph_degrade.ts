export type DegradationProfile = {
  level: number;
  is_degraded: boolean;
  edge_render_limit: number;
  simulation_tick_cap: number;
  label_visible_min_zoom: number;
};

export const NODE_THRESHOLD = 220;
export const EDGE_THRESHOLD = 800;

const NON_DEGRADED: DegradationProfile = {
  level: 1,
  is_degraded: false,
  edge_render_limit: Infinity,
  simulation_tick_cap: 300,
  label_visible_min_zoom: 0,
};

export function compute_degradation_profile(
  node_count: number,
  edge_count: number,
): DegradationProfile {
  const level = Math.max(
    node_count / NODE_THRESHOLD,
    edge_count / EDGE_THRESHOLD,
  );
  if (level <= 1) {
    return { ...NON_DEGRADED, level, edge_render_limit: edge_count };
  }
  return {
    level,
    is_degraded: true,
    edge_render_limit: Math.max(500, Math.floor(edge_count / level)),
    simulation_tick_cap: Math.max(80, Math.floor(220 - (level - 1) * 40)),
    label_visible_min_zoom: Math.min(1.0, 0.6 + (level - 1) * 0.1),
  };
}

export function sample_edges<E extends { source: string; target: string }>(
  edges: E[],
  limit: number,
  priority_ids: Set<string>,
): E[] {
  if (edges.length <= limit) return edges;

  const priority: E[] = [];
  const rest: E[] = [];
  for (const e of edges) {
    if (priority_ids.has(e.source) || priority_ids.has(e.target)) {
      priority.push(e);
    } else {
      rest.push(e);
    }
  }

  if (priority.length >= limit) return priority.slice(0, limit);

  const remaining = limit - priority.length;
  if (rest.length <= remaining) return [...priority, ...rest];

  const stride = rest.length / remaining;
  const sampled = priority.slice();
  for (let i = 0; i < remaining; i++) {
    sampled.push(rest[Math.floor(i * stride)]!);
  }
  return sampled;
}
