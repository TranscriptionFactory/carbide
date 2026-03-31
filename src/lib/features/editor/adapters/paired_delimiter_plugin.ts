import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { schema } from "./schema";

const paired_delimiter_plugin_key = new PluginKey("paired-delimiter");

const OPENING_DELIMITERS = new Map<string, string>([
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
]);

const CLOSING_DELIMITERS = new Set<string>(
  Array.from(OPENING_DELIMITERS.values()),
);

const SELF_PAIRING_DELIMITERS = new Set<string>(["`", "*", '"', "'"]);

const MARK_TOGGLE_DELIMITERS = new Map<string, MarkType>([
  ["~", schema.marks.strikethrough],
  ["=", schema.marks.highlight],
]);

function can_handle_text_input(
  view: EditorView,
  from: number,
  to: number,
): boolean {
  const $from = view.state.doc.resolve(from);
  const $to = view.state.doc.resolve(to);

  if (!$from.parent.isTextblock || !$to.parent.isTextblock) return false;
  if ($from.parent !== $to.parent) return false;

  return $from.parent.type.name !== "code_block";
}

function surrounding_text(view: EditorView, from: number) {
  return {
    before: view.state.doc.textBetween(Math.max(0, from - 1), from, "", ""),
    after: view.state.doc.textBetween(
      from,
      Math.min(view.state.doc.content.size, from + 2),
      "",
      "",
    ),
  };
}

function move_cursor(view: EditorView, pos: number): boolean {
  const tr = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, pos),
  );
  view.dispatch(tr);
  return true;
}

function insert_text(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  const tr = view.state.tr.insertText(text, from, to);
  tr.setSelection(TextSelection.create(tr.doc, from + text.length));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function toggle_mark_on_selection(
  view: EditorView,
  from: number,
  to: number,
  mark_type: MarkType,
): boolean {
  const { state } = view;
  const has_mark = state.doc.rangeHasMark(from, to, mark_type);
  const tr = has_mark
    ? state.tr.removeMark(from, to, mark_type)
    : state.tr.addMark(from, to, mark_type.create());
  tr.setSelection(TextSelection.create(tr.doc, from, to));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function insert_delimiters(
  view: EditorView,
  from: number,
  to: number,
  open: string,
  close: string,
): boolean {
  const selected_text = view.state.doc.textBetween(from, to, "\n", "\n");
  const tr = view.state.tr.insertText(
    `${open}${selected_text}${close}`,
    from,
    to,
  );
  tr.setSelection(
    TextSelection.create(tr.doc, from + open.length + selected_text.length),
  );
  view.dispatch(tr.scrollIntoView());
  return true;
}

function insert_wiki_delimiters(
  view: EditorView,
  from: number,
  after: string,
): boolean {
  const replace_from = from - 1;
  const replace_to = after.startsWith("]") ? from + 1 : from;
  const tr = view.state.tr.insertText("[[]]", replace_from, replace_to);
  tr.setSelection(TextSelection.create(tr.doc, replace_from + 2));
  view.dispatch(tr.scrollIntoView());
  return true;
}

function wrap_selection_in_code_block(
  view: EditorView,
  from: number,
  to: number,
): boolean {
  const { state } = view;
  const text = state.doc.textBetween(from, to, "\n", "\n");
  const code_block_type = state.schema.nodes["code_block"];
  if (!code_block_type) return false;

  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  const range_start = $from.before($from.depth);
  const range_end = $to.after($to.depth);

  const code_block = code_block_type.create(
    { language: "" },
    text ? state.schema.text(text) : undefined,
  );
  const tr = state.tr.replaceWith(range_start, range_end, code_block);
  tr.setSelection(
    TextSelection.create(
      tr.doc,
      range_start + 1,
      range_start + 1 + text.length,
    ),
  );
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function create_paired_delimiter_prose_plugin(): Plugin {
  return new Plugin({
    key: paired_delimiter_plugin_key,
    props: {
      handleTextInput(view, from, to, text) {
        if (text === "`" && from !== to) {
          const $from = view.state.doc.resolve(from);
          const $to = view.state.doc.resolve(to);
          if ($from.parent !== $to.parent) {
            return wrap_selection_in_code_block(view, from, to);
          }
        }

        if (!can_handle_text_input(view, from, to)) return false;

        const mark_type = MARK_TOGGLE_DELIMITERS.get(text);
        if (mark_type && from !== to) {
          return toggle_mark_on_selection(view, from, to, mark_type);
        }

        if (SELF_PAIRING_DELIMITERS.has(text) && from !== to) {
          return insert_delimiters(view, from, to, text, text);
        }

        if (CLOSING_DELIMITERS.has(text) && from === to) {
          const { after } = surrounding_text(view, from);
          if (after.startsWith(text)) {
            return move_cursor(view, from + text.length);
          }
          return false;
        }

        const close = OPENING_DELIMITERS.get(text);
        if (!close) return false;

        if (text === "[" && from === to) {
          const { before, after } = surrounding_text(view, from);
          if (before === "[") {
            return insert_wiki_delimiters(view, from, after);
          }
          return insert_text(view, from, to, text);
        }

        return insert_delimiters(view, from, to, text, close);
      },
    },
  });
}
