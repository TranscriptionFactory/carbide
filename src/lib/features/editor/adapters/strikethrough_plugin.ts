import { InputRule, inputRules } from "prosemirror-inputrules";
import type { Plugin } from "prosemirror-state";
import { schema } from "./schema";

const strikethrough_rule = new InputRule(
  /(?:^|[^~])~~([^~]+)~~$/,
  (state, match, start, end) => {
    const mark_type = schema.marks.strikethrough;
    if (!mark_type) return null;
    const offset = match[0].startsWith("~") ? 0 : 1;
    const text_start = start + offset;
    const content = match[1] ?? "";
    const tr = state.tr
      .delete(text_start, end)
      .insertText(content, text_start)
      .addMark(text_start, text_start + content.length, mark_type.create());
    return tr;
  },
);

export function create_strikethrough_prose_plugin(): Plugin {
  return inputRules({ rules: [strikethrough_rule] });
}
