import type { VaultId } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";
import type { OrphanLink } from "$lib/shared/types/search";

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

export type GraphCacheStats = {
  size: number;
  hits: number;
  misses: number;
  insertions: number;
  evictions: number;
  hit_rate: number;
};

export interface GraphPort {
  load_note_neighborhood(
    vault_id: VaultId,
    note_path: string,
  ): Promise<GraphNeighborhoodSnapshot>;
  invalidate_cache(vault_id: VaultId, note_id?: string): Promise<void>;
  cache_stats(): Promise<GraphCacheStats>;
}
