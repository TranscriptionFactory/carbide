import type { Node as ProseNode } from "prosemirror-model";

export type CommentRange = { from: number; to: number };

const INLINE_COMMENT_RE = /%%[^\n]*?%%/g;

// Stands in for every position a `%%` scan must not read: inline code text and
// inline atoms. One placeholder per position keeps match offsets equal to
// document offsets.
const OPAQUE = "\u0000";

function scan_text_of(child: ProseNode): string {
  if (child.isText) {
    const text = child.text ?? "";
    const is_code = child.marks.some((m) => m.type.name === "code_inline");
    return is_code ? OPAQUE.repeat(text.length) : text;
  }
  if (child.type.name === "hardbreak") return "\n";
  return OPAQUE.repeat(child.nodeSize);
}

export function is_comment_scan_target(node: ProseNode): boolean {
  return node.isTextblock && !node.type.spec.code;
}

export function find_inline_comment_ranges_in_block(
  block: ProseNode,
  pos: number,
): CommentRange[] {
  if (!is_comment_scan_target(block)) return [];
  let text = "";
  block.forEach((child) => {
    text += scan_text_of(child);
  });
  const content_start = pos + 1;
  return [...text.matchAll(INLINE_COMMENT_RE)].map((match) => ({
    from: content_start + match.index,
    to: content_start + match.index + match[0].length,
  }));
}

export function find_inline_comment_ranges(doc: ProseNode): CommentRange[] {
  const ranges: CommentRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    ranges.push(...find_inline_comment_ranges_in_block(node, pos));
    return false;
  });
  return ranges;
}
