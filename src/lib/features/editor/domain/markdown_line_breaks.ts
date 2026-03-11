type CodeFenceState = {
  marker: "`" | "~";
  length: number;
};

export const MARKDOWN_HARD_BREAK = "<br />\n";

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

    if (fence_state) {
      result += line + newline;
      if (is_closing_fence_line(line, fence_state)) {
        fence_state = null;
      }
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

    index = line_end + newline.length;
  }

  return result;
}

function normalize_line_break_line(line: string): string {
  const trimmed = trim_trailing_whitespace(line);
  if (trimmed.endsWith("\\") && !trimmed.endsWith("\\\\")) {
    return `${trimmed.slice(0, -1)}<br />`;
  }

  const break_tag_start = find_break_tag_start(trimmed);
  if (break_tag_start !== null) {
    return `${trimmed.slice(0, break_tag_start)}<br />`;
  }

  const trailing_whitespace = line.slice(trimmed.length);
  if (trailing_whitespace.length >= 2) {
    return `${trimmed}<br />`;
  }

  return line;
}

function find_break_tag_start(line: string): number | null {
  const match = line.match(/<br\s*\/?>$/i);
  if (!match || match.index === undefined) {
    return null;
  }
  if (is_range_inside_code_span(line, match.index, line.length)) {
    return null;
  }
  return match.index;
}

function is_range_inside_code_span(
  line: string,
  start: number,
  end: number,
): boolean {
  for (const span of get_closed_code_spans(line)) {
    if (start >= span.start && end <= span.end) {
      return true;
    }
  }
  return false;
}

function get_closed_code_spans(
  line: string,
): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let active_start: number | null = null;
  let active_length = 0;

  for (let index = 0; index < line.length; ) {
    if (line[index] !== "`") {
      index += 1;
      continue;
    }

    let run_length = 1;
    while (line[index + run_length] === "`") {
      run_length += 1;
    }

    if (active_start === null) {
      active_start = index;
      active_length = run_length;
      index += run_length;
      continue;
    }

    if (run_length === active_length) {
      spans.push({ start: active_start, end: index + run_length });
      active_start = null;
      active_length = 0;
    }

    index += run_length;
  }

  return spans;
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
