const MAX_RESULTS = 10;

export function normalize_folder_query(query: string): string {
  return query.toLowerCase().replace(/\/$/, "");
}

export function filter_folder_paths(
  query: string,
  folder_paths: string[],
): string[] {
  const q = normalize_folder_query(query);
  const candidates = ["", ...folder_paths];
  if (q === "" || q === "/") return candidates.slice(0, MAX_RESULTS);
  return candidates
    .map((path, index) => ({
      path,
      index,
      score: fuzzy_score_fields(q, [path, ...path.split("/")]),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((candidate) => candidate.path)
    .slice(0, MAX_RESULTS);
}
import { fuzzy_score_fields } from "$lib/shared/utils/fuzzy_score";
