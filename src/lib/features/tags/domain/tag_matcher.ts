import { fuzzy_score } from "$lib/shared/utils/fuzzy_score";

export type TagMatch = {
  tag: string;
  score: number;
  kind: "exact" | "hierarchical" | "substring" | "fuzzy";
};

const HIERARCHICAL_SCORE = 1.0;
const SUBSTRING_SCORE = 0.6;
const FUZZY_BASELINE = 0.3;

function strip_leading_hash(value: string): string {
  return value.startsWith("#") ? value.slice(1) : value;
}

function leaf_segment(tag: string): string {
  const last = tag.lastIndexOf("/");
  return last === -1 ? tag : tag.slice(last + 1);
}

function hierarchical_score(query: string, tag: string): number {
  const q = query.toLowerCase();
  const t = tag.toLowerCase();
  if (t === q) return HIERARCHICAL_SCORE;
  if (t.startsWith(`${q}/`)) return HIERARCHICAL_SCORE;
  return 0;
}

function fuzzy_leaf_score(query: string, tag: string): number {
  // Try fuzzy_score on both the full tag and the leaf segment; take the best.
  // fuzzy_score returns a raw integer-ish score; normalize so the *best
  // possible* fuzzy ranks slightly above the floor but always below an
  // explicit hierarchical hit.
  const leaf = leaf_segment(tag);
  const candidates = [tag, leaf];
  let best = 0;
  for (const candidate of candidates) {
    const result = fuzzy_score(query, candidate);
    if (!result) continue;
    // Normalize: divide by query length so single-char queries don't run
    // away. Cap so fuzzy never exceeds HIERARCHICAL_SCORE.
    const normalized = Math.min(
      0.95,
      FUZZY_BASELINE + result.score / Math.max(20, query.length * 12),
    );
    if (normalized > best) best = normalized;
  }
  return best;
}

function substring_score(query: string, tag: string): number {
  const q = query.toLowerCase();
  const t = tag.toLowerCase();
  return t.includes(q) ? SUBSTRING_SCORE : 0;
}

export function score_tag(query: string, tag: string): TagMatch {
  const q = strip_leading_hash(query.trim());
  if (q === "") return { tag, score: 0, kind: "fuzzy" };

  const t = strip_leading_hash(tag);
  const hierarchical = hierarchical_score(q, t);
  if (hierarchical > 0) {
    // Distinguish exact-tag from descendant match for downstream ordering.
    const kind = t.toLowerCase() === q.toLowerCase() ? "exact" : "hierarchical";
    return { tag, score: hierarchical, kind };
  }

  const substring = substring_score(q, t);
  const fuzzy = fuzzy_leaf_score(q, t);
  if (substring >= fuzzy && substring > 0) {
    return { tag, score: substring, kind: "substring" };
  }
  if (fuzzy > 0) {
    return { tag, score: fuzzy, kind: "fuzzy" };
  }
  return { tag, score: 0, kind: "fuzzy" };
}

export function rank_tags(
  query: string,
  tags: readonly string[],
  limit = 10,
): TagMatch[] {
  return tags
    .map((tag) => score_tag(query, tag))
    .filter((m) => m.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.tag.localeCompare(b.tag);
    })
    .slice(0, limit);
}
