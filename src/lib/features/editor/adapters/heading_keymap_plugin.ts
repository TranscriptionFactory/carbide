import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { schema } from "./schema";

const heading_keymap_plugin_key = new PluginKey("heading-keymap");

export function create_heading_keymap_prose_plugin(): Plugin {
  return new Plugin({
    key: heading_keymap_plugin_key,
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Backspace") return false;

        const { state, dispatch } = view;
        const { selection } = state;

        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false;
        }

        const $pos = selection.$from;
        if ($pos.parentOffset !== 0) return false;
        if ($pos.parent.type !== schema.nodes.heading) return false;

        const tr = state.tr.setBlockType(
          $pos.pos,
          $pos.pos,
          schema.nodes.paragraph,
        );
        dispatch(tr);
        return true;
      },
    },
  });
}
