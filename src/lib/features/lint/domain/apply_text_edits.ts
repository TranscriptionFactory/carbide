import type { LintTextEdit } from "$lib/features/lint/types/lint";

export function apply_lint_text_edits(
  markdown: string,
  edits: LintTextEdit[],
): string {
  if (edits.length === 0) return markdown;

  const lines = markdown.split("\n");
  const sorted = [...edits].sort((a, b) => {
    if (a.start_line !== b.start_line) return b.start_line - a.start_line;
    return b.start_column - a.start_column;
  });

  let result = markdown;
  for (const edit of sorted) {
    const start = line_col_to_offset(lines, edit.start_line, edit.start_column);
    const end = line_col_to_offset(lines, edit.end_line, edit.end_column);
    if (start === -1 || end === -1) continue;
    result = result.substring(0, start) + edit.new_text + result.substring(end);
  }

  return result;
}

function line_col_to_offset(
  lines: string[],
  line: number,
  column: number,
): number {
  if (line < 1 || line > lines.length) return -1;
  let offset = 0;
  for (let i = 0; i < line - 1; i++) {
    offset += (lines[i]?.length ?? 0) + 1;
  }
  return offset + Math.max(0, column - 1);
}
