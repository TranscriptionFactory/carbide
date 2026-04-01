import type { MarkdownText, NoteId, NotePath } from "$lib/shared/types/ids";

export type NoteMeta = {
  id: NoteId;
  path: NotePath;
  name: string;
  title: string;
  blurb: string;
  mtime_ms: number;
  size_bytes: number;
  file_type: string | null;
  source?: string | undefined;
  citekey?: string;
  authors?: string;
  year?: number;
  doi?: string;
  isbn?: string;
  arxiv_id?: string;
  journal?: string;
  abstract?: string;
  item_type?: string;
  external_file_path?: string;
  linked_source_id?: string;
};

export function is_linked_note(note: NoteMeta): boolean {
  return note.path.startsWith("@linked/");
}

export function is_linked_note_path(path: string): boolean {
  return path.startsWith("@linked/") || path === "@linked";
}

export type NoteDoc = {
  meta: NoteMeta;
  markdown: MarkdownText;
};
