import { InputRule, inputRules } from "prosemirror-inputrules";
import type { Plugin } from "prosemirror-state";
import { schema } from "./schema";

const bold_rule = new InputRule(
  /(?:^|[^*])\*\*([^*]+)\*\*$/,
  (state, match, start, end) => {
    const mark_type = schema.marks.strong;
    if (!mark_type) return null;
    const offset = match[0].startsWith("*") ? 0 : 1;
    const text_start = start + offset;
    const content = match[1] ?? "";
    return state.tr
      .delete(text_start, end)
      .insertText(content, text_start)
      .addMark(text_start, text_start + content.length, mark_type.create());
  },
);

const italic_rule = new InputRule(
  /(?:^|[^*])\*([^*]+)\*$/,
  (state, match, start, end) => {
    const mark_type = schema.marks.em;
    if (!mark_type) return null;
    const offset = match[0].startsWith("*") ? 0 : 1;
    const text_start = start + offset;
    const content = match[1] ?? "";
    return state.tr
      .delete(text_start, end)
      .insertText(content, text_start)
      .addMark(text_start, text_start + content.length, mark_type.create());
  },
);

const code_inline_rule = new InputRule(
  /(?:^|[^`])`([^`]+)`$/,
  (state, match, start, end) => {
    const mark_type = schema.marks.code_inline;
    if (!mark_type) return null;
    const offset = match[0].startsWith("`") ? 0 : 1;
    const text_start = start + offset;
    const content = match[1] ?? "";
    return state.tr
      .delete(text_start, end)
      .insertText(content, text_start)
      .addMark(text_start, text_start + content.length, mark_type.create());
  },
);

export function create_inline_mark_input_rules_prose_plugin(): Plugin {
  return inputRules({ rules: [bold_rule, italic_rule, code_inline_rule] });
}
