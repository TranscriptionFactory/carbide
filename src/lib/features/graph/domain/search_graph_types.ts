export type SearchGraphNodeKind = "hit" | "neighbor";

export type SearchGraphNode = {
  path: string;
  title: string;
  kind: SearchGraphNodeKind;
  snippet?: string;
  score?: number;
};

export type SearchGraphEdgeType = "wiki" | "semantic" | "smart_link";

export type SearchGraphEdge = {
  source: string;
  target: string;
  edge_type: SearchGraphEdgeType;
  score?: number;
};

export type SearchGraphSnapshot = {
  query: string;
  nodes: SearchGraphNode[];
  edges: SearchGraphEdge[];
  stats: SearchGraphStats;
};

export type SearchGraphStats = {
  hit_count: number;
  neighbor_count: number;
  wiki_edge_count: number;
  semantic_edge_count: number;
  smart_link_edge_count: number;
};
