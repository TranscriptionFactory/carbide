import type { Node as ProseNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { BLOCK_ID_PATTERN } from "$lib/features/editor/domain/block_id";

export const block_id_decoration_plugin_key = new PluginKey(
  "block-id-decoration",
);

export function build_block_id_decorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  const { from, to } = state.selection;

  state.doc.descendants((node: ProseNode, pos: number) => {
    if (!node.isTextblock) return true;

    const content_start = pos + 1;
    const content_end = content_start + node.content.size;
    if (from >= content_start && to <= content_end) return false;

    const match = BLOCK_ID_PATTERN.exec(node.textContent);
    if (match) {
      decorations.push(
        Decoration.inline(content_start + match.index, content_end, {
          class: "block-id-hidden",
          style: "display: none;",
        }),
      );
    }
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

export function create_block_id_decoration_plugin(): Plugin {
  return new Plugin({
    key: block_id_decoration_plugin_key,
    props: {
      decorations: build_block_id_decorations,
    },
  });
}
