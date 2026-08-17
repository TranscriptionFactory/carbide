import type { BaseNoteRow } from "$lib/features/bases/ports";
import { as_note_path } from "$lib/shared/types/ids";

export function make_base_row(
  path: string,
  properties: Record<string, string> = {},
  tags: string[] = [],
): BaseNoteRow {
  return {
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.replace(".md", ""),
      title: path.replace(".md", ""),
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: "markdown",
    },
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        { value, property_type: "string" },
      ]),
    ),
    tags,
    stats: {
      word_count: 0,
      char_count: 0,
      heading_count: 0,
      outlink_count: 0,
      reading_time_secs: 0,
      task_count: 0,
      tasks_done: 0,
      tasks_todo: 0,
      next_due_date: null,
      last_indexed_at: 0,
    },
  };
}
