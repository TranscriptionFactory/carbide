import type MarkdownIt from "markdown-it";

type StateBlock = Parameters<
  Parameters<MarkdownIt["block"]["ruler"]["push"]>[1]
>[0];

const DETAILS_OPEN_SUMMARY_RE =
  /^<details(\s[^>]*)?>\s*<summary>(.*?)<\/summary>$/i;
const SUMMARY_LINE_RE = /^\s*<summary>(.*?)<\/summary>\s*$/i;
const DETAILS_OPEN_TAG_RE = /^<details[\s>]/i;
const DETAILS_CLOSE_RE = /^\s*<\/details>\s*$/i;

function get_line(state: StateBlock, i: number): string {
  return state.src.slice(state.bMarks[i]!, state.eMarks[i]!).trim();
}

function details_rule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const line = get_line(state, startLine);
  if (!DETAILS_OPEN_TAG_RE.test(line)) return false;
  if (silent) return true;

  const has_open_attr = /\bopen\b/i.test(line);

  let summary_text = "Details";
  let body_start = startLine + 1;

  const same_line = DETAILS_OPEN_SUMMARY_RE.exec(line);
  if (same_line) {
    summary_text = same_line[2] || "Details";
  } else if (body_start < endLine) {
    const next = get_line(state, body_start);
    const m = SUMMARY_LINE_RE.exec(next);
    if (m) {
      summary_text = m[1] || "Details";
      body_start++;
    }
  }

  while (body_start < endLine && get_line(state, body_start) === "") {
    body_start++;
  }

  let nesting = 1;
  let close_line = body_start;
  while (close_line < endLine) {
    const l = get_line(state, close_line);
    if (DETAILS_OPEN_TAG_RE.test(l)) nesting++;
    else if (DETAILS_CLOSE_RE.test(l)) nesting--;
    if (nesting === 0) break;
    close_line++;
  }
  if (nesting !== 0) return false;

  const token_open = state.push("details_open", "details", 1);
  token_open.map = [startLine, close_line + 1];
  if (has_open_attr) token_open.attrSet("open", "");

  const summary_open = state.push("details_summary_open", "summary", 1);
  summary_open.map = [startLine, body_start];

  const inline_token = state.push("inline", "", 0);
  inline_token.content = summary_text;
  inline_token.children = [];

  state.push("details_summary_close", "summary", -1);

  const content_open = state.push("details_content_open", "div", 1);
  content_open.map = [body_start, close_line];

  if (body_start < close_line) {
    const old_parent_type = state.parentType;
    state.parentType = "details" as typeof state.parentType;
    state.md.block.tokenize(state, body_start, close_line);
    state.parentType = old_parent_type;
  } else {
    state.push("paragraph_open", "p", 1);
    state.push("paragraph_close", "p", -1);
  }

  state.push("details_content_close", "div", -1);
  state.push("details_close", "details", -1);

  state.line = close_line + 1;
  return true;
}

export function details_markdown_it_plugin(md: MarkdownIt): void {
  md.block.ruler.before("paragraph", "details", details_rule, {
    alt: ["paragraph", "reference", "blockquote"],
  });
}
