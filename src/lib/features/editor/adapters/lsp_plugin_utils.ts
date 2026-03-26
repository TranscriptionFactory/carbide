import type { EditorView } from "prosemirror-view";

export function count_newlines_before(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

export function line_and_character_from_pos(
  view: EditorView,
  pos: number,
): { line: number; character: number } {
  const doc = view.state.doc;
  const clamped = Math.min(pos, doc.content.size);
  const text_before = doc.textBetween(0, clamped, "\n");
  const line = count_newlines_before(text_before);
  const last_newline = text_before.lastIndexOf("\n");
  const character =
    last_newline === -1
      ? text_before.length
      : text_before.length - last_newline - 1;
  return { line, character };
}

export function offset_for_line_character(
  text: string,
  line: number,
  character: number,
): number {
  let current_line = 0;
  let i = 0;
  while (current_line < line && i < text.length) {
    if (text.charCodeAt(i) === 10) current_line++;
    i++;
  }
  return Math.min(i + character, text.length);
}
