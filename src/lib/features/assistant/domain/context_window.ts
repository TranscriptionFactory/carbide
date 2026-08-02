export type CharWindow = { start: number; end: number };

export function context_window(
  from: number,
  to: number | null,
  length: number,
  radius: number,
): CharWindow {
  if (to !== null) {
    return {
      start: Math.max(0, from - radius),
      end: Math.min(length, to + radius),
    };
  }
  // A bare cursor looks backwards only: "continue" must not read past the caret.
  const clamped = Math.min(Math.max(0, from), length);
  return { start: Math.max(0, clamped - radius), end: clamped };
}

export function extract_line_range(
  text: string,
  start_line: number,
  end_line: number,
): string {
  const lines = text.split("\n");
  const start = Math.max(0, start_line);
  const end = Math.min(lines.length, end_line + 1);
  if (start >= lines.length || start >= end) return "";
  return lines.slice(start, end).join("\n");
}
