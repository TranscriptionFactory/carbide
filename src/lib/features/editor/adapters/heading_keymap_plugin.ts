import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { schema } from "./schema";
import {
  heading_fold_plugin_key,
  compute_heading_ranges,
} from "./heading_fold_plugin";

const heading_keymap_plugin_key = new PluginKey("heading-keymap");

export function create_heading_keymap_prose_plugin(): Plugin {
  return new Plugin({
    key: heading_keymap_plugin_key,
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Backspace" && event.key !== "Enter") return false;

        const { state, dispatch } = view;
        const { selection } = state;

        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false;
        }

        const $pos = selection.$from;
        if ($pos.parent.type !== schema.nodes.heading) return false;

        if (event.key === "Backspace") {
          if ($pos.parentOffset !== 0) return false;

          const tr = state.tr.setBlockType(
            $pos.pos,
            $pos.pos,
            schema.nodes.paragraph,
          );
          dispatch(tr);
          return true;
        }

        // Enter at end of a folded heading: jump out of the collapsed section
        if ($pos.parentOffset !== $pos.parent.content.size) return false;

        const fold_state = heading_fold_plugin_key.getState(state);
        if (!fold_state) return false;

        const heading_pos = $pos.before();
        if (!fold_state.folded.has(heading_pos)) return false;

        const ranges = compute_heading_ranges(state.doc);
        const range = ranges.find((r) => r.heading_pos === heading_pos);
        if (!range) return false;

        const insert_pos = range.body_end;
        const paragraph = schema.nodes.paragraph.create();
        const tr = state.tr.insert(insert_pos, paragraph);
        // +1 to place cursor inside the new paragraph
        tr.setSelection(TextSelection.create(tr.doc, insert_pos + 1));
        dispatch(tr);
        return true;
      },
    },
  });
}
