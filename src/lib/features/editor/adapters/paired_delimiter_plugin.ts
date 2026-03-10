import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import type { EditorView } from "@milkdown/kit/prose/view";

const paired_delimiter_plugin_key = new PluginKey("paired-delimiter");

const OPENING_DELIMITERS = new Map<string, string>([
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
]);

const CLOSING_DELIMITERS = new Set<string>(
  Array.from(OPENING_DELIMITERS.values()),
);

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

export function create_paired_delimiter_prose_plugin() {
  return new Plugin({
    key: paired_delimiter_plugin_key,
    props: {
      handleTextInput(view, from, to, text) {
        if (!can_handle_text_input(view, from, to)) return false;

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
        }

        return insert_delimiters(view, from, to, text, close);
      },
    },
  });
}

export const paired_delimiter_plugin = $prose(() =>
  create_paired_delimiter_prose_plugin(),
);
