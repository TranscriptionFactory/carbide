type CodeFenceState = {
  marker: "`" | "~";
  length: number;
};

function is_math_fence_line(line: string): boolean {
  return /^(?: {0,3})\$\$\s*$/.test(line);
}

export const MARKDOWN_HARD_BREAK = "\\\n";

export function insert_markdown_hard_break(input: {
  markdown: string;
  start: number;
  end: number;
}): { markdown: string; cursor_offset: number } {
  const prefix = input.markdown.slice(0, input.start);
  const suffix = input.markdown.slice(input.end);
  const markdown = `${prefix}${MARKDOWN_HARD_BREAK}${suffix}`;
  return {
    markdown,
    cursor_offset: input.start + MARKDOWN_HARD_BREAK.length,
  };
}

export function normalize_markdown_line_breaks(raw: string): string {
  if (raw === "") return raw;

  const without_zero_width = raw.includes("\u200B")
    ? raw.replaceAll("\u200B", "")
    : raw;

  let result = "";
  let index = 0;
  let fence_state: CodeFenceState | null = null;
  let in_math_block = false;

  while (index < without_zero_width.length) {
    let line_end = without_zero_width.indexOf("\n", index);
    if (line_end === -1) line_end = without_zero_width.length;

    const has_newline = line_end < without_zero_width.length;
    const line =
      has_newline &&
      line_end > index &&
      without_zero_width[line_end - 1] === "\r"
        ? without_zero_width.slice(index, line_end - 1)
        : without_zero_width.slice(index, line_end);
    const newline = has_newline
      ? without_zero_width[line_end - 1] === "\r"
        ? "\r\n"
        : "\n"
      : "";

    if (in_math_block) {
      result += line + newline;
      if (is_math_fence_line(line)) {
        in_math_block = false;
      }
    } else if (fence_state) {
      result += line + newline;
      if (is_closing_fence_line(line, fence_state)) {
        fence_state = null;
      }
    } else {
      if (is_math_fence_line(line)) {
        in_math_block = true;
        result += line + newline;
      } else {
        const opening_fence = get_opening_fence(line);
        if (opening_fence) {
          fence_state = opening_fence;
          result += line + newline;
        } else if (is_indented_code_line(line)) {
          result += line + newline;
        } else {
          result += normalize_line_break_line(line) + newline;
        }
      }
    }

    index = line_end + newline.length;
  }

  return result;
}

function normalize_line_break_line(line: string): string {
  const trimmed = trim_trailing_whitespace(line);
  if (trimmed.endsWith("\\")) {
    if (!trimmed.endsWith("\\\\")) {
      if (trimmed.trim() === "\\") return "";
      const without_backslash = trimmed.slice(0, -1);
      if (
        /^\s*(?:(?:[-*+]|\d+[.)]) (?:\[[ xX]?\] )?|#{1,6} |> )$/.test(
          without_backslash,
        )
      ) {
        return without_backslash;
      }
      return trimmed;
    }
    return line;
  }

  const trailing_whitespace = line.slice(trimmed.length);
  if (trailing_whitespace.length >= 2) {
    return `${trimmed}\\`;
  }

  return line;
}

function trim_trailing_whitespace(line: string): string {
  return line.replace(/[ \t]+$/u, "");
}

function is_indented_code_line(line: string): boolean {
  return /^(?: {4}|\t)/u.test(line);
}

function get_opening_fence(line: string): CodeFenceState | null {
  const match = line.match(/^(?: {0,3})(`{3,}|~{3,})/u);
  if (!match) return null;

  const fence = match[1];
  if (!fence) return null;

  return {
    marker: fence[0] as "`" | "~",
    length: fence.length,
  };
}

function is_closing_fence_line(line: string, fence: CodeFenceState): boolean {
  const pattern =
    fence.marker === "`"
      ? new RegExp(`^(?: {0,3})\`{${String(fence.length)},}[ \t]*$`, "u")
      : new RegExp(`^(?: {0,3})~{${String(fence.length)},}[ \t]*$`, "u");

  return pattern.test(line);
}
