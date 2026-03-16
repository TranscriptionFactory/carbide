import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const NON_TEXT_BLOCK_TYPES = new Set([
  "code_block",
  "blockquote",
  "table",
  "hr",
  "image-block",
]);
const ESCAPE_KEYS = new Set(["ArrowUp", "ArrowLeft"]);

const leading_block_escape_plugin_key = new PluginKey("leading-block-escape");

function get_first_escapable_block(view: EditorView) {
  const { doc } = view.state;
  const first_child = doc.firstChild;
  if (!first_child) return null;
  if (!NON_TEXT_BLOCK_TYPES.has(first_child.type.name)) return null;

  return first_child;
}

function is_cursor_inside_first_escapable_block(view: EditorView): boolean {
  const { selection, doc } = view.state;
  if (!selection.empty) return false;

  const first_child = get_first_escapable_block(view);
  if (!first_child) return false;

  const $pos = doc.resolve(selection.from);
  for (let depth = $pos.depth; depth >= 1; depth--) {
    if ($pos.node(depth) === first_child) return true;
  }

  return false;
}

function is_on_first_line(view: EditorView): boolean {
  const { state } = view;
  if (!state.selection.empty) return false;

  const $pos = state.selection.$from;
  const text_before = $pos.parent.textBetween(0, $pos.parentOffset);
  return !text_before.includes("\n");
}

function should_escape_leading_block(view: EditorView, key: string): boolean {
  if (!ESCAPE_KEYS.has(key)) return false;
  if (!is_cursor_inside_first_escapable_block(view)) return false;

  if (key === "ArrowUp") return is_on_first_line(view);

  return view.state.selection.from === 1;
}

function insert_paragraph_before_first_block(view: EditorView): boolean {
  const { state } = view;
  const paragraph_type = state.schema.nodes["paragraph"];
  if (!paragraph_type) return false;

  const tr = state.tr.insert(0, paragraph_type.create());
  tr.setSelection(TextSelection.create(tr.doc, 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function create_leading_block_escape_prose_plugin() {
  return new Plugin({
    key: leading_block_escape_plugin_key,
    props: {
      handleKeyDown(view, event) {
        if (should_escape_leading_block(view, event.key)) {
          return insert_paragraph_before_first_block(view);
        }

        return false;
      },
    },
  });
}

export const leading_block_escape_plugin = $prose(() =>
  create_leading_block_escape_prose_plugin(),
);
