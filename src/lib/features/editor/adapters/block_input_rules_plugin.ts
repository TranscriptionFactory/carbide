import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from "prosemirror-inputrules";
import type { Plugin } from "prosemirror-state";
import { schema } from "./schema";

const heading_rule = textblockTypeInputRule(
  /^(#{1,6})\s$/,
  schema.nodes.heading,
  (match) => ({ level: match[1]?.length ?? 1 }),
);

const bullet_list_rule = wrappingInputRule(
  /^\s*([-*])\s$/,
  schema.nodes.bullet_list,
);

const ordered_list_rule = wrappingInputRule(
  /^(\d+)\.\s$/,
  schema.nodes.ordered_list,
  (match) => ({ order: Number(match[1]) }),
);

const blockquote_rule = wrappingInputRule(/^>\s$/, schema.nodes.blockquote);

const hr_rule = new InputRule(/^---$/, (state, _match, start, _end) => {
  const $start = state.doc.resolve(start);
  if (!$start.parent.isTextblock) return null;

  const block_start = $start.before();
  const block_end = $start.after();
  const hr_node = schema.nodes.hr.create();
  const para_node = schema.nodes.paragraph.create();

  return state.tr.replaceWith(block_start, block_end, [hr_node, para_node]);
});

const task_list_rule = new InputRule(
  /^\s*-\s\[([ xX])\]\s$/,
  (state, match, start, _end) => {
    const $start = state.doc.resolve(start);
    if (!$start.parent.isTextblock) return null;

    const block_start = $start.before();
    const block_end = $start.after();
    const checked = match[1] !== " ";

    const para = schema.nodes.paragraph.create();
    const item = schema.nodes.list_item.create({ checked }, para);
    const list = schema.nodes.bullet_list.create(null, item);

    return state.tr.replaceWith(block_start, block_end, list);
  },
);

export function create_block_input_rules_prose_plugin(): Plugin {
  return inputRules({
    rules: [
      heading_rule,
      bullet_list_rule,
      ordered_list_rule,
      blockquote_rule,
      hr_rule,
      task_list_rule,
    ],
  });
}
