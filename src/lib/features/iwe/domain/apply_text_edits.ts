import type { IweTextEdit } from "$lib/features/iwe/types";

function offset_for_line_character(
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

export function apply_text_edits(
  markdown: string,
  edits: IweTextEdit[],
): string {
  if (edits.length === 0) return markdown;

  const sorted = [...edits].sort((a, b) => {
    const line_diff = b.range.start_line - a.range.start_line;
    if (line_diff !== 0) return line_diff;
    return b.range.start_character - a.range.start_character;
  });

  let result = markdown;
  for (const edit of sorted) {
    const start = offset_for_line_character(
      result,
      edit.range.start_line,
      edit.range.start_character,
    );
    const end = offset_for_line_character(
      result,
      edit.range.end_line,
      edit.range.end_character,
    );
    result = result.slice(0, start) + edit.new_text + result.slice(end);
  }

  return result;
}
