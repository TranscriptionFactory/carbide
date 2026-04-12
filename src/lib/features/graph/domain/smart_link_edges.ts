import type {
  SmartLinkEdge,
  SmartLinkRuleMatchInfo,
} from "$lib/features/graph/ports";

export const SMART_LINK_EDGE_MIN_SCORE = 0.1;
export const SMART_LINK_EDGE_MAX_VAULT_SIZE = 500;
export const SMART_LINK_EDGE_PER_NOTE_LIMIT = 5;

export type SmartLinkSuggestionHit = {
  target_path: string;
  target_title: string;
  score: number;
  rules: SmartLinkRuleMatchInfo[];
};

export function build_smart_link_edges(
  suggestions_by_note: Map<string, SmartLinkSuggestionHit[]>,
  min_score = SMART_LINK_EDGE_MIN_SCORE,
): SmartLinkEdge[] {
  const seen = new Set<string>();
  const edges: SmartLinkEdge[] = [];

  for (const [source, suggestions] of suggestions_by_note) {
    for (const s of suggestions) {
      if (s.score < min_score) continue;
      if (source === s.target_path) continue;
      const key =
        source < s.target_path
          ? `${source}|${s.target_path}`
          : `${s.target_path}|${source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        source,
        target: s.target_path,
        score: s.score,
        rules: s.rules,
      });
    }
  }

  return edges;
}
