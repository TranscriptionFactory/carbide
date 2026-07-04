import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { find_inline_tag_ranges } from "$lib/features/editor/domain/tag_ranges";

export type TagPillMenuConfig = {
  get_color: (tag: string) => string | null;
  on_set_color: (tag: string, color: string) => void;
  on_clear_color: (tag: string) => void;
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

function build_decorations(doc: ProseNode): DecorationSet {
  const ranges = find_inline_tag_ranges(doc);
  if (ranges.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    ranges.map((range) =>
      Decoration.inline(range.from, range.to, {
        class: "tag-pill",
        "data-tag": range.tag,
      }),
    ),
  );
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
          next = { ...next, decorations: build_decorations(new_state.doc) };
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
