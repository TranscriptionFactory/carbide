import type { NoteMeta } from "$lib/shared/types/note";
import type { NoteSearchHit } from "$lib/shared/types/search";
import { path_to_note_meta } from "$lib/features/links/domain/merge_suggestions";

function take_distinct(
  notes: NoteMeta[],
  exclude: Iterable<string>,
  limit: number,
): NoteMeta[] {
  const skip = new Set(exclude);
  const seen = new Set<string>();
  const out: NoteMeta[] = [];
  for (const note of notes) {
    if (skip.has(note.path) || seen.has(note.path)) continue;
    seen.add(note.path);
    out.push(note);
    if (out.length >= limit) break;
  }
  return out;
}

export function collect_shared_tag_notes(
  tag_note_paths: string[],
  exclude: Iterable<string>,
  limit: number,
): NoteMeta[] {
  return take_distinct(tag_note_paths.map(path_to_note_meta), exclude, limit);
}

export function filter_unlinked_mentions(
  hits: NoteSearchHit[],
  exclude: Iterable<string>,
  limit: number,
): NoteMeta[] {
  return take_distinct(
    hits.map((hit) => hit.note),
    exclude,
    limit,
  );
}
