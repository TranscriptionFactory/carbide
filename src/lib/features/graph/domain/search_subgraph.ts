import type {
  VaultGraphSnapshot,
  SemanticEdge,
  SmartLinkEdge,
  SearchGraphEdge,
  SearchGraphNode,
  SearchGraphSnapshot,
} from "../ports";

export type SearchSubgraphHit = {
  path: string;
  title: string;
  snippet?: string;
  score?: number;
};

export type SearchSubgraphOptions = {
  max_neighbors?: number;
  semantic_boost_paths?: Set<string>;
};

const DEFAULT_MAX_NEIGHBORS = 50;

export function extract_search_subgraph(
  hits: SearchSubgraphHit[],
  vault_snapshot: VaultGraphSnapshot,
  semantic_edges?: SemanticEdge[],
  smart_link_edges?: SmartLinkEdge[],
  options?: SearchSubgraphOptions,
): SearchGraphSnapshot {
  const max_neighbors = options?.max_neighbors ?? DEFAULT_MAX_NEIGHBORS;

  const hit_set = new Set(hits.map((h) => h.path));

  const adjacency = build_adjacency_map(vault_snapshot);

  const title_map = new Map<string, string>();
  for (const node of vault_snapshot.nodes) {
    title_map.set(node.path, node.title);
  }
  for (const hit of hits) {
    title_map.set(hit.path, hit.title);
  }

  const semantic_boost_set = options?.semantic_boost_paths;

  const neighbor_scores = score_neighbors(
    hit_set,
    adjacency,
    semantic_boost_set,
  );

  const sorted_neighbors = [...neighbor_scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max_neighbors);

  const selected_set = new Set(hit_set);
  for (const [path] of sorted_neighbors) {
    selected_set.add(path);
  }

  const nodes: SearchGraphNode[] = [];
  for (const hit of hits) {
    const node: SearchGraphNode = {
      path: hit.path,
      title: hit.title,
      kind: "hit",
    };
    if (hit.snippet !== undefined) node.snippet = hit.snippet;
    if (hit.score !== undefined) node.score = hit.score;
    nodes.push(node);
  }
  for (const [path] of sorted_neighbors) {
    nodes.push({
      path,
      title: title_map.get(path) ?? path,
      kind: "neighbor",
    });
  }

  const edges: SearchGraphEdge[] = [];

  let wiki_edge_count = 0;
  for (const edge of vault_snapshot.edges) {
    if (selected_set.has(edge.source) && selected_set.has(edge.target)) {
      edges.push({
        source: edge.source,
        target: edge.target,
        edge_type: "wiki",
      });
      wiki_edge_count++;
    }
  }

  let semantic_edge_count = 0;
  if (semantic_edges) {
    for (const edge of semantic_edges) {
      if (selected_set.has(edge.source) && selected_set.has(edge.target)) {
        edges.push({
          source: edge.source,
          target: edge.target,
          edge_type: "semantic",
          score: edge.distance,
        });
        semantic_edge_count++;
      }
    }
  }

  let smart_link_edge_count = 0;
  if (smart_link_edges) {
    for (const edge of smart_link_edges) {
      if (selected_set.has(edge.source) && selected_set.has(edge.target)) {
        edges.push({
          source: edge.source,
          target: edge.target,
          edge_type: "smart_link",
          score: edge.score,
        });
        smart_link_edge_count++;
      }
    }
  }

  return {
    query: "",
    nodes,
    edges,
    stats: {
      hit_count: hits.length,
      neighbor_count: sorted_neighbors.length,
      wiki_edge_count,
      semantic_edge_count,
      smart_link_edge_count,
    },
  };
}

export function compute_auto_expanded_ids(
  snapshot: SearchGraphSnapshot,
): Set<string> {
  const hit_set = new Set(
    snapshot.nodes.filter((n) => n.kind === "hit").map((n) => n.path),
  );

  const hit_adjacency = new Map<string, number>();
  for (const edge of snapshot.edges) {
    if (edge.edge_type !== "wiki") continue;

    if (hit_set.has(edge.source) && !hit_set.has(edge.target)) {
      hit_adjacency.set(edge.target, (hit_adjacency.get(edge.target) ?? 0) + 1);
    }
    if (hit_set.has(edge.target) && !hit_set.has(edge.source)) {
      hit_adjacency.set(edge.source, (hit_adjacency.get(edge.source) ?? 0) + 1);
    }
  }

  const auto_expanded = new Set<string>();
  for (const [path, count] of hit_adjacency) {
    if (count >= 2) {
      auto_expanded.add(path);
    }
  }
  return auto_expanded;
}

export function merge_expansion_into_snapshot(
  existing: SearchGraphSnapshot,
  new_hits: SearchSubgraphHit[],
  vault_snapshot: VaultGraphSnapshot,
): SearchGraphSnapshot {
  const existing_paths = new Set(existing.nodes.map((n) => n.path));

  const nodes = [...existing.nodes];
  for (const hit of new_hits) {
    if (existing_paths.has(hit.path)) continue;
    const node: SearchGraphNode = {
      path: hit.path,
      title: hit.title,
      kind: "hit",
    };
    if (hit.snippet !== undefined) node.snippet = hit.snippet;
    if (hit.score !== undefined) node.score = hit.score;
    nodes.push(node);
    existing_paths.add(hit.path);
  }

  const edge_key = (s: string, t: string) => `${s}→${t}`;
  const existing_edge_keys = new Set(
    existing.edges.map((e) => edge_key(e.source, e.target)),
  );

  const edges = [...existing.edges];
  for (const edge of vault_snapshot.edges) {
    if (
      existing_paths.has(edge.source) &&
      existing_paths.has(edge.target) &&
      !existing_edge_keys.has(edge_key(edge.source, edge.target))
    ) {
      edges.push({
        source: edge.source,
        target: edge.target,
        edge_type: "wiki",
      });
      existing_edge_keys.add(edge_key(edge.source, edge.target));
    }
  }

  const hit_count = nodes.filter((n) => n.kind === "hit").length;
  const neighbor_count = nodes.filter((n) => n.kind === "neighbor").length;
  const wiki_edge_count = edges.filter((e) => e.edge_type === "wiki").length;
  const semantic_edge_count = edges.filter(
    (e) => e.edge_type === "semantic",
  ).length;
  const smart_link_edge_count = edges.filter(
    (e) => e.edge_type === "smart_link",
  ).length;

  return {
    query: existing.query,
    nodes,
    edges,
    stats: {
      hit_count,
      neighbor_count,
      wiki_edge_count,
      semantic_edge_count,
      smart_link_edge_count,
    },
  };
}

function build_adjacency_map(
  snapshot: VaultGraphSnapshot,
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const edge of snapshot.edges) {
    let s = adj.get(edge.source);
    if (!s) {
      s = new Set();
      adj.set(edge.source, s);
    }
    s.add(edge.target);

    let t = adj.get(edge.target);
    if (!t) {
      t = new Set();
      adj.set(edge.target, t);
    }
    t.add(edge.source);
  }
  return adj;
}

function score_neighbors(
  hit_set: Set<string>,
  adjacency: Map<string, Set<string>>,
  semantic_boost_set?: Set<string>,
): Map<string, number> {
  const neighbor_candidates = new Map<string, number>();

  for (const hit_path of hit_set) {
    const neighbors = adjacency.get(hit_path);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (hit_set.has(neighbor)) continue;
      neighbor_candidates.set(
        neighbor,
        (neighbor_candidates.get(neighbor) ?? 0) + 1,
      );
    }
  }

  const scores = new Map<string, number>();
  for (const [path, edges_to_hits] of neighbor_candidates) {
    const total_edges = adjacency.get(path)?.size ?? 1;
    const base = edges_to_hits / total_edges;
    const boost = semantic_boost_set?.has(path) ? 0.3 : 0;
    scores.set(path, base + boost);
  }
  return scores;
}
