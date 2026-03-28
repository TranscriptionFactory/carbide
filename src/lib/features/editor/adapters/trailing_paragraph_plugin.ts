import { Plugin, PluginKey } from "prosemirror-state";
import { schema } from "./markdown_pipeline";

export const trailing_paragraph_plugin_key = new PluginKey(
  "trailing_paragraph",
);

export function create_trailing_paragraph_plugin(): Plugin {
  return new Plugin({
    key: trailing_paragraph_plugin_key,
    appendTransaction(transactions, _old_state, new_state) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const { doc } = new_state;
      const last_child = doc.lastChild;

      if (!last_child) return null;
      if (
        last_child.type === schema.nodes.paragraph &&
        last_child.content.size === 0
      ) {
        return null;
      }

      return new_state.tr.insert(
        doc.content.size,
        schema.nodes.paragraph.create(),
      );
    },
  });
}
