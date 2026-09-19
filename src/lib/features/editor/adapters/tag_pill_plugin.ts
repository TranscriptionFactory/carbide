import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import {
  find_inline_tag_ranges,
  find_inline_tag_ranges_in_node,
  is_tag_scan_target,
  type InlineTagRange,
} from "$lib/features/editor/domain/tag_ranges";
import {
  changed_range,
  nodes_in_ranges,
  replace_node_decorations,
} from "./incremental_scan";

export type TagPillMenuConfig = {
  get_color: (tag: string) => string | null;
  on_set_color: (tag: string, color: string) => void;
  on_clear_color: (tag: string) => void;
  is_promoted: (tag: string) => boolean;
  can_demote: (tag: string) => boolean;
  on_promote: (tag: string) => void;
  on_demote: (tag: string) => void;
};

export type TagPillMenuState = {
  open: boolean;
  tag: string;
  clientX: number;
  clientY: number;
};

type TagPillState = {
  decorations: DecorationSet;
  menu: TagPillMenuState;
};

type TagPillMeta =
  | { type: "open"; tag: string; clientX: number; clientY: number }
  | { type: "close" };

const CLOSED_MENU: TagPillMenuState = {
  open: false,
  tag: "",
  clientX: 0,
  clientY: 0,
};

function tag_pill_decoration(range: InlineTagRange): Decoration {
  return Decoration.inline(range.from, range.to, {
    class: "tag-pill",
    "data-tag": range.tag,
  });
}

function tag_decorations_for(
  doc: ProseNode,
  node: ProseNode,
  pos: number,
): Decoration[] {
  if (!is_tag_scan_target(doc, node, pos)) return [];
  return find_inline_tag_ranges_in_node(doc, node, pos).map(
    tag_pill_decoration,
  );
}

function build_decorations(doc: ProseNode): DecorationSet {
  const ranges = find_inline_tag_ranges(doc);
  if (ranges.length === 0) return DecorationSet.empty;
  return DecorationSet.create(doc, ranges.map(tag_pill_decoration));
}

export const tag_pill_plugin_key = new PluginKey<TagPillState>("tag-pill");

export function create_tag_pill_prose_plugin(): Plugin<TagPillState> {
  return new Plugin<TagPillState>({
    key: tag_pill_plugin_key,
    state: {
      init(_config, state) {
        return { decorations: build_decorations(state.doc), menu: CLOSED_MENU };
      },
      apply(tr, plugin_state, _old_state, new_state) {
        let next = plugin_state;
        if (tr.docChanged) {
          const range = changed_range(tr);
          let decorations = plugin_state.decorations.map(
            tr.mapping,
            new_state.doc,
          );
          if (range) {
            decorations = replace_node_decorations(
              decorations,
              new_state.doc,
              nodes_in_ranges(
                new_state.doc,
                [range],
                // Every text node in range, so that decorations of a node that
                // stopped being scannable (a new inline-code mark) are dropped
                // as well; the builder reapplies the scan rules.
                (node) => node.isText,
              ),
              (node, pos) => tag_decorations_for(new_state.doc, node, pos),
            );
          }
          next = { ...next, decorations };
        }
        const meta = tr.getMeta(tag_pill_plugin_key) as TagPillMeta | undefined;
        if (meta?.type === "open") {
          next = {
            ...next,
            menu: {
              open: true,
              tag: meta.tag,
              clientX: meta.clientX,
              clientY: meta.clientY,
            },
          };
        } else if (meta?.type === "close") {
          next = { ...next, menu: CLOSED_MENU };
        }
        return next;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations;
      },
      handleClick(view, _pos, event) {
        const target = event.target;
        if (!(target instanceof Element)) return false;
        const pill = target.closest(".tag-pill");
        if (!pill) return false;
        const tag = pill.getAttribute("data-tag");
        if (!tag) return false;
        const rect = pill.getBoundingClientRect();
        view.dispatch(
          view.state.tr.setMeta(tag_pill_plugin_key, {
            type: "open",
            tag,
            clientX: rect.left,
            clientY: rect.bottom + 4,
          }),
        );
        return true;
      },
    },
  });
}
