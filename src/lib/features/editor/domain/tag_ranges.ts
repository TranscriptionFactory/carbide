import type { Node as ProseNode } from "prosemirror-model";

export type InlineTagRange = { from: number; to: number; tag: string };

// Mirrors the Rust inline tag extractor: `(?:^|\s)#([\w][\w/\-]*)`.
const TAG_TOKEN_RE = /#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;

const EXCLUDED_NODE_TYPES = new Set([
  "code_block",
  "frontmatter",
  "math_inline",
  "math_block",
]);

function is_whitespace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char);
}

function has_tag_boundary_before(
  doc: ProseNode,
  text: string,
  node_pos: number,
  index: number,
): boolean {
  if (index > 0) return is_whitespace(text[index - 1]);
  const before = doc.resolve(node_pos).nodeBefore;
  if (!before) return true;
  if (before.isText && typeof before.text === "string") {
    return is_whitespace(before.text[before.text.length - 1]);
  }
  return false;
}

export function find_inline_tag_ranges(doc: ProseNode): InlineTagRange[] {
  const ranges: InlineTagRange[] = [];
  doc.descendants((node, pos) => {
    if (EXCLUDED_NODE_TYPES.has(node.type.name)) return false;
    if (!node.isText || typeof node.text !== "string") return true;
    if (node.marks.some((mark) => mark.type.name === "code_inline")) {
      return true;
    }
    const text = node.text;
    for (const match of text.matchAll(TAG_TOKEN_RE)) {
      const tag = match[1];
      if (tag === undefined) continue;
      if (!has_tag_boundary_before(doc, text, pos, match.index)) continue;
      ranges.push({
        from: pos + match.index,
        to: pos + match.index + match[0].length,
        tag,
      });
    }
    return true;
  });
  return ranges;
}
