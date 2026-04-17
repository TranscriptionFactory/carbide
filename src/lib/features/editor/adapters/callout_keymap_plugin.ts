import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  Fragment,
  type Node as ProseNode,
  type ResolvedPos,
} from "prosemirror-model";
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

function backspace_in_callout_title(
  view: EditorView,
  $pos: ResolvedPos,
): boolean {
  const { state, dispatch } = view;
  const callout_depth = find_callout_depth($pos);
  if (callout_depth === -1) return false;

  const callout_node = $pos.node(callout_depth);
  const callout_pos = $pos.before(callout_depth);
  const title_node = callout_node.child(0);
  const body_node = callout_node.child(1);

  const body_is_single_empty_para =
    body_node.childCount === 1 &&
    body_node.child(0).type === schema.nodes.paragraph &&
    body_node.child(0).content.size === 0;

  const tr = state.tr;

  if (title_node.content.size === 0 && body_is_single_empty_para) {
    const replacement = schema.nodes.paragraph.create();
    tr.replaceWith(
      callout_pos,
      callout_pos + callout_node.nodeSize,
      replacement,
    );
    tr.setSelection(TextSelection.create(tr.doc, callout_pos + 1));
    dispatch(tr.scrollIntoView());
    return true;
  }

  const nodes: ProseNode[] = [];
  const title_para = schema.nodes.paragraph.create(null, title_node.content);
  nodes.push(title_para);
  for (let i = 0; i < body_node.childCount; i++) {
    nodes.push(body_node.child(i));
  }
  const fragment = Fragment.from(nodes);
  tr.replaceWith(callout_pos, callout_pos + callout_node.nodeSize, fragment);
  tr.setSelection(TextSelection.create(tr.doc, callout_pos + 1));
  dispatch(tr.scrollIntoView());
  return true;
}

function backspace_at_body_start(view: EditorView, $pos: ResolvedPos): boolean {
  if ($pos.parentOffset !== 0) return false;

  const callout_depth = find_callout_depth($pos);
  if (callout_depth === -1) return false;

  const body_depth = callout_depth + 2;
  if ($pos.depth < body_depth) return false;

  const body_node = $pos.node(callout_depth + 1);
  if (body_node.type !== schema.nodes.callout_body) return false;

  const index_in_body = $pos.index(callout_depth + 1);
  if (index_in_body !== 0) return false;

  for (let d = $pos.depth; d > body_depth; d--) {
    if ($pos.index(d - 1) !== 0) return false;
  }

  const { state, dispatch } = view;
  const callout_node = $pos.node(callout_depth);
  const callout_pos = $pos.before(callout_depth);
  const title_node = callout_node.child(0);

  const title_end = callout_pos + 2 + title_node.content.size;
  const tr = state.tr.setSelection(TextSelection.create(state.doc, title_end));
  dispatch(tr.scrollIntoView());
  return true;
}

export function create_callout_keymap_prose_plugin(): Plugin {
  return new Plugin({
    key: callout_keymap_plugin_key,
    props: {
      handleKeyDown(view, event) {
        const { selection } = view.state;
        if (!(selection instanceof TextSelection)) return false;
        if (!selection.empty) return false;

        const $pos = selection.$from;

        if ($pos.parent.type === schema.nodes.callout_title) {
          if (event.key === "Enter") {
            return move_to_callout_body(view, $pos);
          }

          if (
            event.key === "ArrowDown" &&
            $pos.parentOffset === $pos.parent.content.size
          ) {
            return move_to_callout_body(view, $pos);
          }

          if (event.key === "Backspace" && $pos.parentOffset === 0) {
            return backspace_in_callout_title(view, $pos);
          }

          return false;
        }

        if (event.key === "Backspace") {
          return backspace_at_body_start(view, $pos);
        }

        return false;
      },
    },
  });
}
