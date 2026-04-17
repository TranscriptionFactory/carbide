import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { ResolvedPos } from "prosemirror-model";
import { schema } from "./schema";

const callout_keymap_plugin_key = new PluginKey("callout-keymap");

function find_callout_depth($pos: ResolvedPos): number {
  for (let d = $pos.depth; d >= 0; d--) {
    if ($pos.node(d).type === schema.nodes.callout) return d;
  }
  return -1;
}

function move_to_callout_body(view: EditorView, $pos: ResolvedPos): boolean {
  const { state, dispatch } = view;
  const callout_depth = find_callout_depth($pos);
  if (callout_depth === -1) return false;

  const callout_node = $pos.node(callout_depth);
  if (callout_node.childCount < 2) return false;

  const callout_pos = $pos.before(callout_depth);
  let tr = state.tr;

  if (callout_node.attrs["folded"]) {
    tr = tr.setNodeMarkup(callout_pos, null, {
      ...callout_node.attrs,
      folded: false,
    });
  }

  const title_node = callout_node.child(0);
  const body_start = callout_pos + 1 + title_node.nodeSize + 1;
  const $target = tr.doc.resolve(body_start);
  const sel = TextSelection.findFrom($target, 1);

  if (sel) {
    tr.setSelection(sel);
    dispatch(tr.scrollIntoView());
    return true;
  }

  return false;
}

export function create_callout_keymap_prose_plugin(): Plugin {
  return new Plugin({
    key: callout_keymap_plugin_key,
    props: {
      handleKeyDown(view, event) {
        const { selection } = view.state;
        if (!(selection instanceof TextSelection)) return false;

        const $pos = selection.$from;
        if ($pos.parent.type !== schema.nodes.callout_title) return false;

        if (event.key === "Enter") {
          return move_to_callout_body(view, $pos);
        }

        if (
          event.key === "ArrowDown" &&
          $pos.parentOffset === $pos.parent.content.size
        ) {
          return move_to_callout_body(view, $pos);
        }

        return false;
      },
    },
  });
}
