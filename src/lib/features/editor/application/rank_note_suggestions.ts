import { fuzzy_score_fields } from "$lib/shared/utils/fuzzy_score";

export function rank_note_suggestions<
  T extends { title: string; path: string },
>(query: string, items: T[]): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((item, index) => ({
      item,
      index,
      score: fuzzy_score_fields(q, [item.title, item.path]),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
