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
    .filter((p) => p.toLowerCase().startsWith(q))
    .slice(0, MAX_RESULTS);
}
