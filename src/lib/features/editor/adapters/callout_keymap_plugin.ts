import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { type ResolvedPos } from "prosemirror-model";
import { schema } from "./schema";
import { unwrap_callout_at } from "./block_transforms";
import { is_mod_enter } from "$lib/shared/utils/keyboard";

const callout_keymap_plugin_key = new PluginKey("callout-keymap");

function find_callout_depth($pos: ResolvedPos): number {
  for (let d = $pos.depth; d >= 0; d--) {
    if ($pos.node(d).type === schema.nodes.callout) return d;
  }
  return -1;
}

function place_after_section(view: EditorView, after: number): boolean {
  const { state, dispatch } = view;
  const sel = TextSelection.findFrom(state.doc.resolve(after), 1);
  const tr = state.tr;
  if (sel) {
    tr.setSelection(sel);
  } else {
    tr.insert(after, schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  }
  dispatch(tr.scrollIntoView());
  return true;
}

function move_to_callout_body(view: EditorView, $pos: ResolvedPos): boolean {
  const { state, dispatch } = view;
  const callout_depth = find_callout_depth($pos);
  if (callout_depth === -1) return false;

  const callout_node = $pos.node(callout_depth);
  if (callout_node.childCount < 2) return false;

  const callout_pos = $pos.before(callout_depth);

  if (callout_node.attrs["folded"]) {
    return place_after_section(view, callout_pos + callout_node.nodeSize);
  }

  const tr = state.tr;
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
  const callout_depth = find_callout_depth($pos);
  if (callout_depth === -1) return false;
  return unwrap_callout_at(
    $pos.before(callout_depth),
    view.state,
    view.dispatch,
  );
}

function callout_pos_at($pos: ResolvedPos): number {
  const depth = find_callout_depth($pos);
  return depth === -1 ? -1 : $pos.before(depth);
}

function selection_within_callout(selection: TextSelection): boolean {
  const start = callout_pos_at(selection.$from);
  return start !== -1 && start === callout_pos_at(selection.$to);
}

function toggle_callout_fold(view: EditorView, $pos: ResolvedPos): boolean {
  if ($pos.parent.type === schema.nodes.code_block) return false;

  const callout_depth = find_callout_depth($pos);
  if (callout_depth === -1) return false;

  const callout_node = $pos.node(callout_depth);
  const folded = Boolean(callout_node.attrs["folded"]);
  if (!folded && !callout_node.attrs["foldable"]) return false;

  const callout_pos = $pos.before(callout_depth);
  const tr = view.state.tr.setNodeMarkup(callout_pos, null, {
    ...callout_node.attrs,
    folded: !folded,
  });

  if (!folded) {
    const title_end = callout_pos + 2 + callout_node.child(0).content.size;
    tr.setSelection(TextSelection.create(tr.doc, title_end));
    tr.scrollIntoView();
  }

  view.dispatch(tr);
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

        if (is_mod_enter(event)) {
          if (!selection.empty && !selection_within_callout(selection)) {
            return false;
          }
          return toggle_callout_fold(view, selection.$from);
        }

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
