import { $prose } from "@milkdown/kit/utils";
import { wrappingInputRule, inputRules } from "@milkdown/kit/prose/inputrules";
import { schemaCtx } from "@milkdown/kit/core";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";

export const task_list_input_rule = $prose((ctx) => {
  const schema = ctx.get(schemaCtx);
  const task_list_item = schema.nodes["list_item"];
  const bullet_list = schema.nodes["bullet_list"];

  if (!task_list_item || !bullet_list) {
    return new Plugin({
      key: new PluginKey("dummy"),
    });
  }

  const rule = wrappingInputRule(/^\s*\[\]\s$/, task_list_item, {
    checked: false,
  });

  return inputRules({ rules: [rule] });
});
