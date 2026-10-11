import type { Node as ProseNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import {
  find_inline_comment_ranges,
  find_inline_comment_ranges_in_block,
  type CommentRange,
} from "$lib/features/editor/domain/comment_ranges";
import { changed_range, rescan_decorations } from "./incremental_scan";

export const comment_decoration_plugin_key = new PluginKey<DecorationSet>(
  "comment-decoration",
);

function comment_decoration(range: CommentRange): Decoration {
  return Decoration.inline(range.from, range.to, { class: "md-comment" });
}

export function build_comment_decorations(doc: ProseNode): DecorationSet {
  const ranges = find_inline_comment_ranges(doc);
  if (ranges.length === 0) return DecorationSet.empty;
  return DecorationSet.create(doc, ranges.map(comment_decoration));
}

export function create_comment_decoration_plugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: comment_decoration_plugin_key,
    state: {
      init(_config, state) {
        return build_comment_decorations(state.doc);
      },
      apply(tr, decorations, _old_state, new_state) {
        if (!tr.docChanged) return decorations;
        const mapped = decorations.map(tr.mapping, new_state.doc);
        const range = changed_range(tr);
        if (!range) return mapped;
        return rescan_decorations(
          mapped,
          new_state.doc,
          [range],
          // Every textblock, so a block that turned into code drops its
          // decorations; the builder reapplies the scan rules.
          (node) => node.isTextblock,
          (node, pos) =>
            find_inline_comment_ranges_in_block(node, pos).map(
              comment_decoration,
            ),
        );
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
