import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

const task_keymap_plugin_key = new PluginKey("task-keymap");

export const task_keymap_plugin = $prose(() => {
  return new Plugin({
    key: task_keymap_plugin_key,
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Backspace") return false;

        const { state, dispatch } = view;
        const { selection, doc } = state;

        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false;
        }

        const $pos = selection.$from;
        const node = $pos.parent;

        // Check if we are in a list item that looks like a task
        // Milkdown's default GFM list items often have a specific structure
        if (node.type.name !== "list_item") return false;

        // In Milkdown/Prosemirror, list_item usually contains a paragraph
        // But if we are at the very start of the list_item
        if ($pos.parentOffset === 0) {
            // Check if it's a task list item (has checked attribute)
            if (node.attrs["checked"] !== undefined && node.attrs["checked"] !== null) {
                // If we are at the start of a task, Backspace should convert it back to a regular list item or paragraph
                // For now, let's try to just lift it
                // Actually, Milkdown might handle 'checked' as an attribute.
                // If we want to delete the "task-ness" but keep the item:
                const tr = state.tr.setNodeMarkup($pos.before(), undefined, { ...node.attrs, checked: null });
                dispatch(tr);
                return true;
            }
        }

        return false;
      }
    }
  });
});
