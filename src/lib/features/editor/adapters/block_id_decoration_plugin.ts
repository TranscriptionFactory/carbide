import type { Node as ProseNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Selection, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { BLOCK_ID_PATTERN } from "$lib/features/editor/domain/block_id";
import {
  changed_range,
  nodes_in_ranges,
  replace_node_decorations,
  type ScanRange,
} from "./incremental_scan";

export const block_id_decoration_plugin_key = new PluginKey<DecorationSet>(
  "block-id-decoration",
);

function block_id_decorations(
  node: ProseNode,
  pos: number,
  selection: { from: number; to: number },
): Decoration[] {
  const content_start = pos + 1;
  const content_end = content_start + node.content.size;
  if (selection.from >= content_start && selection.to <= content_end) return [];

  const match = BLOCK_ID_PATTERN.exec(node.textContent);
  if (!match) return [];
  return [
    Decoration.inline(content_start + match.index, content_end, {
      class: "block-id-hidden",
      style: "display: none;",
    }),
  ];
}

export function build_block_id_decorations(state: EditorState): DecorationSet {
  const { selection } = state;
  const decorations: Decoration[] = [];

  state.doc.descendants((node: ProseNode, pos: number) => {
    if (!node.isTextblock) return true;
    decorations.push(...block_id_decorations(node, pos, selection));
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

/**
 * A block's id is exposed while the selection sits inside it, so a selection
 * move has to revisit the blocks on both sides of the move.
 */
function selection_ranges(
  tr: Transaction,
  old_selection: Selection,
  new_selection: Selection,
): ScanRange[] {
  return [
    {
      from: tr.mapping.map(old_selection.from, 1),
      to: tr.mapping.map(old_selection.to, -1),
    },
    { from: new_selection.from, to: new_selection.to },
  ];
}

export function create_block_id_decoration_plugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: block_id_decoration_plugin_key,

    state: {
      init: (_config, state) => build_block_id_decorations(state),

      apply(tr, prev, old_state, new_state) {
        const selection_changed = old_state.selection !== new_state.selection;
        if (!tr.docChanged && !selection_changed) return prev;

        const ranges: ScanRange[] = [];
        const changed = tr.docChanged ? changed_range(tr) : null;
        if (changed) ranges.push(changed);
        if (selection_changed) {
          ranges.push(
            ...selection_ranges(tr, old_state.selection, new_state.selection),
          );
        }

        const decorations = prev.map(tr.mapping, new_state.doc);
        if (ranges.length === 0) return decorations;

        const blocks = nodes_in_ranges(
          new_state.doc,
          ranges,
          (node) => node.isTextblock,
        );
        return replace_node_decorations(
          decorations,
          new_state.doc,
          blocks,
          (node, pos) => block_id_decorations(node, pos, new_state.selection),
        );
      },
    },

    props: {
      decorations(state) {
        return (
          block_id_decoration_plugin_key.getState(state) ?? DecorationSet.empty
        );
      },
    },
  });
}
