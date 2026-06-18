import type { Node as ProseNode, Slice } from "prosemirror-model";

export type DocDiffReplacement = {
  from: number;
  to: number;
  slice: Slice;
};

export function compute_doc_diff_replacement(
  old_doc: ProseNode,
  new_doc: ProseNode,
): DocDiffReplacement | null {
  const old_content = old_doc.content;
  const new_content = new_doc.content;

  const start = old_content.findDiffStart(new_content);
  if (start == null) return null;

  const end = old_content.findDiffEnd(new_content);
  if (!end) return null;

  let to = end.a;
  let new_end = end.b;

  // When the changed region shares text with its surroundings the diff start
  // and end can overlap; push both ends out so no shared character is dropped.
  const overlap = start - Math.min(to, new_end);
  if (overlap > 0) {
    to += overlap;
    new_end += overlap;
  }

  return { from: start, to, slice: new_doc.slice(start, new_end) };
}
