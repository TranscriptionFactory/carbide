import type { Node as ProseNode } from "prosemirror-model";

export type InlineTagRange = { from: number; to: number; tag: string };

// Mirrors the Rust inline tag extractor: `(?:^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_/\-]*)`.
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

function is_text_target(node: ProseNode): boolean {
  return (
    node.isText &&
    typeof node.text === "string" &&
    !node.marks.some((mark) => mark.type.name === "code_inline")
  );
}

/**
 * The same matching `find_inline_tag_ranges` performs for one text node. A
 * range-limited rescan rebuilds decorations node by node, so the per-node unit
 * has to stay shared with the full scan.
 */
export function find_inline_tag_ranges_in_node(
  doc: ProseNode,
  node: ProseNode,
  pos: number,
): InlineTagRange[] {
  const ranges: InlineTagRange[] = [];
  const text = node.text;
  if (!is_text_target(node) || typeof text !== "string") return ranges;

  for (const match of text.matchAll(TAG_TOKEN_RE)) {
    const tag = match[1];
    if (tag === undefined) continue;
    if (/^\p{N}+$/u.test(tag)) continue;
    if (!has_tag_boundary_before(doc, text, pos, match.index)) continue;
    ranges.push({
      from: pos + match.index,
      to: pos + match.index + match[0].length,
      tag,
    });
  }
  return ranges;
}

/**
 * Whether a node is one the full scan would visit. The full walk prunes
 * excluded types before descending; a range-limited scan sees them as plain
 * ancestors, so it has to check the whole chain.
 */
export function is_tag_scan_target(
  doc: ProseNode,
  node: ProseNode,
  pos: number,
): boolean {
  if (!is_text_target(node)) return false;
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (EXCLUDED_NODE_TYPES.has($pos.node(depth).type.name)) return false;
  }
  return true;
}

export function find_inline_tag_ranges(doc: ProseNode): InlineTagRange[] {
  const ranges: InlineTagRange[] = [];
  doc.descendants((node, pos) => {
    if (EXCLUDED_NODE_TYPES.has(node.type.name)) return false;
    ranges.push(...find_inline_tag_ranges_in_node(doc, node, pos));
    return true;
  });
  return ranges;
}
