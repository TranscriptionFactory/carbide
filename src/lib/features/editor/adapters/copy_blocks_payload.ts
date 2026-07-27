import { Fragment, Slice, type Node as ProseNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import type { RichClipboardPayload } from "$lib/features/clipboard";

export function build_copy_blocks_payload(
  view: EditorView,
  positions: Set<number>,
): RichClipboardPayload | null {
  const sorted = Array.from(positions).sort((a, b) => a - b);
  const nodes: ProseNode[] = [];
  for (const pos of sorted) {
    const node = view.state.doc.nodeAt(pos);
    if (node) nodes.push(node);
  }
  if (nodes.length === 0) return null;

  const slice = new Slice(Fragment.from(nodes), 0, 0);
  const { dom, text } = view.serializeForClipboard(slice);
  return { html: dom.innerHTML, text };
}
