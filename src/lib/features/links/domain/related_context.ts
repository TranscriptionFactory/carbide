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

function local_day_start(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function collect_same_day_notes(
  anchor: NoteMeta,
  notes: NoteMeta[],
  limit: number,
): NoteMeta[] {
  const anchor_day = local_day_start(anchor.ctime_ms);
  const same_day = notes.filter(
    (note) =>
      local_day_start(note.ctime_ms) === anchor_day ||
      local_day_start(note.mtime_ms) === anchor_day,
  );
  return take_distinct(same_day, [anchor.path], limit);
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
