import { fuzzy_score } from "$lib/shared/utils/fuzzy_score";

export function matches_filter(
  query: string,
  label: string,
  id: string,
): boolean {
  if (!query) return true;
  return fuzzy_score(query, label) !== null || fuzzy_score(query, id) !== null;
}
