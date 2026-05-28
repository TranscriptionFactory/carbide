import { InputRule, inputRules } from "prosemirror-inputrules";
import type { Plugin } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";
import { schema } from "./schema";

function build_mark_transaction(
  state: EditorState,
  start: number,
  end: number,
  match_text: string,
  delimiter: string,
  content: string,
  mark_type: MarkType,
): Transaction {
  const offset = match_text.startsWith(delimiter) ? 0 : 1;
  const text_start = start + offset;
  return state.tr
    .delete(text_start, end)
    .insertText(content, text_start)
    .addMark(text_start, text_start + content.length, mark_type.create())
    .removeStoredMark(mark_type);
}

const bold_rule = new InputRule(
  /(?:^|[^*])\*\*([^*]+)\*\*$/,
  (state, match, start, end) => {
    const mark_type = schema.marks.strong;
    if (!mark_type) return null;
    return build_mark_transaction(
      state,
      start,
      end,
      match[0],
      "*",
      match[1] ?? "",
      mark_type,
    );
  },
);

const italic_rule = new InputRule(
  /(?:^|[^*])\*([^*]+)\*$/,
  (state, match, start, end) => {
    const mark_type = schema.marks.em;
    if (!mark_type) return null;
    return build_mark_transaction(
      state,
      start,
      end,
      match[0],
      "*",
      match[1] ?? "",
      mark_type,
    );
  },
);

const code_inline_rule = new InputRule(
  /(?:^|[^`])`([^`]+)`$/,
  (state, match, start, end) => {
    const mark_type = schema.marks.code_inline;
    if (!mark_type) return null;
    return build_mark_transaction(
      state,
      start,
      end,
      match[0],
      "`",
      match[1] ?? "",
      mark_type,
    );
  },
);

const highlight_rule = new InputRule(
  /(?:^|[^=])==([^=]+)==$/,
  (state, match, start, end) => {
    const mark_type = schema.marks.highlight;
    if (!mark_type) return null;
    return build_mark_transaction(
      state,
      start,
      end,
      match[0],
      "=",
      match[1] ?? "",
      mark_type,
    );
  },
);

export function create_inline_mark_input_rules_prose_plugin(): Plugin {
  return inputRules({
    rules: [bold_rule, italic_rule, code_inline_rule, highlight_rule],
  });
}
