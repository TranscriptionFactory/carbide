import type { NoteDoc } from "$lib/shared/types/note";
import type { MarkdownText, NoteId, NotePath } from "$lib/shared/types/ids";

export type EditorMode = "visual" | "source" | "split" | "read_only";

export type OpenNoteState = NoteDoc & {
  buffer_id: string;
  is_dirty: boolean;
};

export type CursorInfo = {
  line: number;
  column: number;
  total_lines: number;
  total_words: number;
};

export type EditorSelectionSnapshot = {
  text: string;
  start: number | null;
  end: number | null;
};

export type EditorAiContext = {
  note_id: NoteId;
  note_path: NotePath;
  note_title: string;
  markdown: MarkdownText;
  selection: EditorSelectionSnapshot | null;
};

export type PastedImagePayload = {
  bytes: Uint8Array;
  mime_type: string;
  file_name: string | null;
};

export type ImagePasteRequest = {
  note_id: NoteId;
  note_path: NotePath;
  image: PastedImagePayload;
};

export function to_open_note_state(
  doc: NoteDoc,
  options?: { buffer_id?: string },
): OpenNoteState {
  return {
    ...doc,
    buffer_id: options?.buffer_id ?? doc.meta.id,
    is_dirty: false,
  };
}
