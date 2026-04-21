import type { VaultId } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import type { OrphanLink } from "$lib/shared/types/search";

export type VaultGraphNode = {
  path: string;
  title: string;
  kind?: "hit" | "neighbor";
  score?: number;
  group?: string;
};

export type VaultGraphEdge = {
  source: string;
  target: string;
};

export type VaultGraphStats = {
  node_count: number;
  edge_count: number;
};

export type VaultGraphSnapshot = {
  nodes: VaultGraphNode[];
  edges: VaultGraphEdge[];
  stats: VaultGraphStats;
};

export type GraphNeighborhoodStats = {
  node_count: number;
  edge_count: number;
  backlink_count: number;
  outlink_count: number;
  orphan_count: number;
  bidirectional_count: number;
};

export type GraphNeighborhoodSnapshot = {
  center: NoteMeta;
  backlinks: NoteMeta[];
  outlinks: NoteMeta[];
  orphan_links: OrphanLink[];
  stats: GraphNeighborhoodStats;
};

export type SemanticEdge = {
  source: string;
  target: string;
  distance: number;
};

export type SmartLinkRuleMatchInfo = {
  rule_id: string;
  raw_score: number;
};

export type SmartLinkEdge = {
  source: string;
  target: string;
  score: number;
  rules: SmartLinkRuleMatchInfo[];
};

export type HierarchyTreeNode = {
  key: string;
  name: string;
  children: HierarchyTreeNode[];
};

export type GraphCacheStats = {
  size: number;
  hits: number;
  misses: number;
  insertions: number;
  evictions: number;
  hit_rate: number;
};

export type SearchGraphNodeKind = "hit" | "neighbor";

export type SearchGraphNode = {
  path: string;
  title: string;
  kind: SearchGraphNodeKind;
  snippet?: string;
  score?: number;
  date_created_ms?: number;
  date_modified_ms?: number;
  source?: string;
  extension?: string;
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

export interface GraphPort {
  load_note_neighborhood(
    vault_id: VaultId,
    note_path: string,
  ): Promise<GraphNeighborhoodSnapshot>;
  load_vault_graph(vault_id: VaultId): Promise<VaultGraphSnapshot>;
  invalidate_cache(vault_id: VaultId, note_id?: string): Promise<void>;
  cache_stats(): Promise<GraphCacheStats>;
}
