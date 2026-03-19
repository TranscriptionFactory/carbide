import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { ResolvedPos } from "prosemirror-model";
import { schema } from "./schema";

const details_keymap_plugin_key = new PluginKey("details-keymap");

function find_details_depth($pos: ResolvedPos): number {
  for (let d = $pos.depth; d >= 0; d--) {
    if ($pos.node(d).type === schema.nodes.details_block) return d;
  }
  return -1;
}

function move_to_details_content(view: EditorView, $pos: ResolvedPos): boolean {
  const { state, dispatch } = view;
  const details_depth = find_details_depth($pos);
  if (details_depth === -1) return false;

  const details_node = $pos.node(details_depth);
  if (details_node.childCount < 2) return false;

  const details_pos = $pos.before(details_depth);
  let tr = state.tr;

  if (!details_node.attrs["open"]) {
    tr = tr.setNodeMarkup(details_pos, null, {
      ...details_node.attrs,
      open: true,
    });
  }

  const summary_node = details_node.child(0);
  const content_start = details_pos + 1 + summary_node.nodeSize + 1;
  const $target = tr.doc.resolve(content_start);
  const sel = TextSelection.findFrom($target, 1);

  if (sel) {
    tr.setSelection(sel);
    dispatch(tr.scrollIntoView());
    return true;
  }

  return false;
}

export function create_details_keymap_prose_plugin(): Plugin {
  return new Plugin({
    key: details_keymap_plugin_key,
    props: {
      handleKeyDown(view, event) {
        const { selection } = view.state;
        if (!(selection instanceof TextSelection)) return false;

        const $pos = selection.$from;
        if ($pos.parent.type !== schema.nodes.details_summary) return false;

        if (event.key === "Enter") {
          return move_to_details_content(view, $pos);
        }

        if (
          event.key === "ArrowDown" &&
          $pos.parentOffset === $pos.parent.content.size
        ) {
          return move_to_details_content(view, $pos);
        }

        return false;
      },
    },
  });
}
