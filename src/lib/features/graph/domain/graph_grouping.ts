import type { GraphGroupMode } from "$lib/features/graph/state/graph_store.svelte";

export type GraphGroupingForces = {
  mode: "both" | "hit_center" | "folder";
  folder_strength: number;
  hit_center_strength: number;
};

const FOLDER_STRENGTH = 0.3;
const HIT_CENTER_STRENGTH = 0.15;

export const GROUP_TINT_COUNT = 5;

export function folder_from_path(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

export function resolve_group(
  path: string,
  folder_group: string | undefined,
  group_mode: GraphGroupMode,
  cluster_assignments: Record<string, number> | null,
): string | undefined {
  if (group_mode === "none") return undefined;
  if (group_mode === "folder") return folder_group;

  const cluster = cluster_assignments?.[path];
  return cluster != null ? `cluster:${String(cluster)}` : folder_group;
}

export function grouping_forces(
  group_mode: GraphGroupMode,
  has_search_meta: boolean,
): GraphGroupingForces | undefined {
  const groups_nodes = group_mode !== "none";
  if (!groups_nodes && !has_search_meta) return undefined;

  const mode = !has_search_meta
    ? "folder"
    : groups_nodes
      ? "both"
      : "hit_center";

  return {
    mode,
    folder_strength: FOLDER_STRENGTH,
    hit_center_strength: HIT_CENTER_STRENGTH,
  };
}

export function group_tint_index(group: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < group.length; i++) {
    hash ^= group.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % GROUP_TINT_COUNT;
}
