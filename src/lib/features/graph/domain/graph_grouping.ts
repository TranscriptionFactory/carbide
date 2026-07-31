import type { GraphGroupMode } from "$lib/shared/types/editor_settings";

export type GraphGroupingForces = {
  mode: "both" | "hit_center" | "folder";
  folder_strength: number;
  hit_center_strength: number;
};

export type GroupableNode = {
  path: string;
  folder_group: string | undefined;
  tags: readonly string[] | undefined;
  degree: number;
};

const FOLDER_STRENGTH = 0.3;
const HIT_CENTER_STRENGTH = 0.15;

export const GROUP_TINT_COUNT = 5;

export const UNTAGGED_GROUP = "tag:(untagged)";

const DEGREE_BUCKETS: { min: number; label: string }[] = [
  { min: 11, label: "degree:11+" },
  { min: 6, label: "degree:6-10" },
  { min: 3, label: "degree:3-5" },
  { min: 1, label: "degree:1-2" },
  { min: 0, label: "degree:0" },
];

export function folder_from_path(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

export function compute_degrees(
  edges: readonly { source: string; target: string }[],
): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return degrees;
}

export function primary_tag(
  tags: readonly string[] | undefined,
): string | undefined {
  if (!tags || tags.length === 0) return undefined;
  return [...tags].sort((a, b) => a.localeCompare(b))[0];
}

export function degree_bucket(degree: number): string {
  const bucket = DEGREE_BUCKETS.find((b) => degree >= b.min);
  return bucket?.label ?? "degree:0";
}

export function resolve_group(
  node: GroupableNode,
  group_mode: GraphGroupMode,
  cluster_assignments: Record<string, number> | null,
): string | undefined {
  if (group_mode === "none") return undefined;
  if (group_mode === "folder") return node.folder_group;
  if (group_mode === "degree") return degree_bucket(node.degree);

  if (group_mode === "tag") {
    const tag = primary_tag(node.tags);
    return tag != null ? `tag:${tag}` : UNTAGGED_GROUP;
  }

  const cluster = cluster_assignments?.[node.path];
  return cluster != null ? `cluster:${String(cluster)}` : node.folder_group;
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

export function compute_group_grid(
  ordered_groups: readonly string[],
): Map<string, { x: number; y: number }> {
  const cols = Math.ceil(Math.sqrt(ordered_groups.length));
  const spacing = 300;
  const result = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < ordered_groups.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = (col - (cols - 1) / 2) * spacing;
    const cy =
      (row - (Math.ceil(ordered_groups.length / cols) - 1) / 2) * spacing;
    result.set(ordered_groups[i]!, { x: cx, y: cy });
  }
  return result;
}

export function group_tint_index(group: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < group.length; i++) {
    hash ^= group.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % GROUP_TINT_COUNT;
}

export function group_tint(
  group: string | undefined,
  palette: readonly number[],
  fallback: number,
): number {
  if (group == null) return fallback;
  return palette[group_tint_index(group)] ?? fallback;
}
