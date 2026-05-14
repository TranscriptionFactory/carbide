export type RadialLayoutResult = {
  positions: Map<string, { x: number; y: number }>;
  neighbor_ids_1hop: Set<string>;
  neighbor_ids_2hop: Set<string>;
};

export function radial_layout(
  center: string,
  edges: Array<{ source: string; target: string }>,
  center_x = 0,
  center_y = 0,
): RadialLayoutResult {
  const adjacency = new Map<string, Set<string>>();

  function ensure(id: string) {
    if (!adjacency.has(id)) adjacency.set(id, new Set());
  }

  for (const edge of edges) {
    ensure(edge.source);
    ensure(edge.target);
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }

  const neighbors_1hop = adjacency.get(center) ?? new Set<string>();
  const hop1 = Array.from(neighbors_1hop);

  const neighbors_2hop = new Set<string>();
  for (const n1 of hop1) {
    const n2_set = adjacency.get(n1);
    if (!n2_set) continue;
    for (const n2 of n2_set) {
      if (n2 !== center && !neighbors_1hop.has(n2)) {
        neighbors_2hop.add(n2);
      }
    }
  }

  const positions = new Map<string, { x: number; y: number }>();

  positions.set(center, { x: center_x, y: center_y });

  const INNER_RADIUS = 150;
  const OUTER_RADIUS = 300;

  for (let i = 0; i < hop1.length; i++) {
    const angle = (2 * Math.PI * i) / hop1.length - Math.PI / 2;
    positions.set(hop1[i]!, {
      x: center_x + INNER_RADIUS * Math.cos(angle),
      y: center_y + INNER_RADIUS * Math.sin(angle),
    });
  }

  const hop2 = Array.from(neighbors_2hop);
  const parent_map = new Map<string, string[]>();
  for (const n2 of hop2) {
    const parents: string[] = [];
    for (const n1 of hop1) {
      if (adjacency.get(n1)?.has(n2)) {
        parents.push(n1);
      }
    }
    parent_map.set(n2, parents);
  }

  const children_per_parent = new Map<string, string[]>();
  for (const [n2, parents] of parent_map) {
    const parent = parents[0]!;
    const list = children_per_parent.get(parent);
    if (list) {
      list.push(n2);
    } else {
      children_per_parent.set(parent, [n2]);
    }
  }

  for (const [parent, children] of children_per_parent) {
    const parent_pos = positions.get(parent);
    if (!parent_pos) continue;
    const parent_angle = Math.atan2(
      parent_pos.y - center_y,
      parent_pos.x - center_x,
    );
    const spread = Math.PI / 6;

    for (let i = 0; i < children.length; i++) {
      const offset =
        children.length === 1
          ? 0
          : spread * ((i / (children.length - 1)) * 2 - 1);
      const angle = parent_angle + offset;
      positions.set(children[i]!, {
        x: center_x + OUTER_RADIUS * Math.cos(angle),
        y: center_y + OUTER_RADIUS * Math.sin(angle),
      });
    }
  }

  return {
    positions,
    neighbor_ids_1hop: neighbors_1hop,
    neighbor_ids_2hop: neighbors_2hop,
  };
}
