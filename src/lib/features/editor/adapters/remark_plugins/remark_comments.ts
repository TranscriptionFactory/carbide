import type { Root, RootContent, PhrasingContent, Text } from "mdast";
import type { Plugin } from "unified";
import { SKIP, visit } from "unist-util-visit";

const COMMENT_MARKER = "%%";
const ESCAPED_PERCENT = "\\%";

// Every source token that yields a `%` in a text value, plus every other
// backslash escape so `\\%` reads as an escaped backslash before a bare `%`.
const PERCENT_SOURCE_TOKEN_RE =
  /\\[!-/:-@[-`{-~]|&(?:#0*37|#[xX]0*25|percnt);|%/g;

type Point = { line: number; column: number; offset?: number };
type Position = { start: Point; end: Point };
type PositionedNode = { position?: Position };

function start_offset(node: RootContent): number | undefined {
  return (node as PositionedNode).position?.start.offset;
}

// Obsidian: a block comment starts on a line that begins with `%%` and runs to
// the next `%%`. A closer on the opening line makes it an inline comment.
function opens_block_comment(source: string, start: number): boolean {
  if (!source.startsWith(COMMENT_MARKER, start)) return false;
  const line_end = source.indexOf("\n", start);
  const rest_of_line = source.slice(
    start + COMMENT_MARKER.length,
    line_end === -1 ? undefined : line_end,
  );
  return !rest_of_line.includes(COMMENT_MARKER);
}

function last_covered_index(
  nodes: RootContent[],
  first: number,
  close_end: number,
): number {
  let last = first;
  while (last + 1 < nodes.length) {
    const next = nodes[last + 1];
    const next_start = next ? start_offset(next) : undefined;
    if (next_start === undefined || next_start >= close_end) break;
    last++;
  }
  return last;
}

function build_comment_block(
  source: string,
  first: RootContent,
  last: RootContent,
): RootContent | null {
  const start = (first as PositionedNode).position?.start;
  const end = (last as PositionedNode).position?.end;
  if (start?.offset === undefined || end?.offset === undefined) return null;
  return {
    type: "commentBlock",
    value: source.slice(start.offset, end.offset),
    position: { start, end },
  } as unknown as RootContent;
}

function collapse_block_comments(
  nodes: RootContent[],
  source: string,
): RootContent[] {
  const result: RootContent[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i] as RootContent;
    const start = start_offset(node);
    if (start === undefined || !opens_block_comment(source, start)) {
      result.push(node);
      i++;
      continue;
    }
    const close = source.indexOf(COMMENT_MARKER, start + COMMENT_MARKER.length);
    const close_end = close === -1 ? Infinity : close + COMMENT_MARKER.length;
    const last = last_covered_index(nodes, i, close_end);
    const comment = build_comment_block(
      source,
      node,
      nodes[last] as RootContent,
    );
    if (comment) {
      result.push(comment);
      i = last + 1;
    } else {
      result.push(node);
      i++;
    }
  }
  return result;
}

function escaped_percent_flags(source_slice: string): boolean[] {
  const flags: boolean[] = [];
  for (const [token] of source_slice.matchAll(PERCENT_SOURCE_TOKEN_RE)) {
    if (token === ESCAPED_PERCENT) flags.push(true);
    else if (!token.startsWith("\\")) flags.push(false);
  }
  return flags;
}

function count_percent(value: string): number {
  let count = 0;
  for (const char of value) if (char === "%") count++;
  return count;
}

function is_marker_half(value: string, index: number): boolean {
  return value[index - 1] === "%" || value[index + 1] === "%";
}

// remark-parse drops the backslash of `\%` and the stringifier never puts it
// back, so a literal `\%%` would turn into a comment on save. An escaped `%`
// that is half of a `%%` marker is kept as raw source instead.
function split_escaped_markers(
  value: string,
  escaped: boolean[],
): PhrasingContent[] | null {
  const parts: PhrasingContent[] = [];
  let percent_index = 0;
  let segment_start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "%") continue;
    const is_escaped = escaped[percent_index++] === true;
    if (!is_escaped || !is_marker_half(value, i)) continue;
    if (i > segment_start) {
      parts.push({ type: "text", value: value.slice(segment_start, i) });
    }
    parts.push({ type: "html", value: ESCAPED_PERCENT });
    segment_start = i + 1;
  }
  if (segment_start === 0) return null;
  if (segment_start < value.length) {
    parts.push({ type: "text", value: value.slice(segment_start) });
  }
  return parts;
}

function escaped_marker_parts(
  node: Text,
  source: string,
): PhrasingContent[] | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return null;
  const slice = source.slice(start, end);
  if (!slice.includes(ESCAPED_PERCENT)) return null;
  const escaped = escaped_percent_flags(slice);
  if (escaped.length !== count_percent(node.value)) return null;
  return split_escaped_markers(node.value, escaped);
}

function preserve_escaped_markers(tree: Root, source: string): void {
  visit(tree, "text", (node, index, parent) => {
    if (!parent || index === undefined) return;
    const parts = escaped_marker_parts(node, source);
    if (!parts) return;
    parent.children.splice(index, 1, ...(parts as typeof parent.children));
    return [SKIP, index + parts.length];
  });
}

export const remark_comments: Plugin<[], Root> = () => {
  return (tree, file) => {
    const source = String(file.value ?? "");
    if (!source.includes("%")) return;
    tree.children = collapse_block_comments(tree.children, source);
    preserve_escaped_markers(tree, source);
  };
};
