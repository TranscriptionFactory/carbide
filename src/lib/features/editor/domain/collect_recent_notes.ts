import type { NoteMeta } from "$lib/shared/types/note";

function matches_query(note: NoteMeta, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    note.title.toLowerCase().includes(needle) ||
    note.name.toLowerCase().includes(needle) ||
    note.path.toLowerCase().includes(needle)
  );
}

export function collect_recent_notes(
  mru: NoteMeta[],
  all: NoteMeta[],
  query: string,
  limit: number,
): NoteMeta[] {
  const by_mtime = [...all]
    .sort((a, b) => b.mtime_ms - a.mtime_ms)
    .slice(0, limit);

  const seen = new Set<string>();
  const out: NoteMeta[] = [];
  for (const note of [...mru, ...by_mtime]) {
    const key = note.path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!matches_query(note, query)) continue;
    out.push(note);
    if (out.length >= limit) break;
  }
  return out;
}
