import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { liftListItem } from "prosemirror-schema-list";
import { schema } from "./schema";

const task_keymap_plugin_key = new PluginKey("task-keymap");

function is_click_on_checkbox(li: HTMLElement, event: MouseEvent): boolean {
  const rect = li.getBoundingClientRect();
  const checkbox_size = 14;
  const click_x = event.clientX - rect.left;
  return click_x >= 0 && click_x <= checkbox_size + 8;
}

export function create_task_keymap_prose_plugin(): Plugin {
  const lift_command = liftListItem(schema.nodes.list_item);

  return new Plugin({
    key: task_keymap_plugin_key,
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Backspace") return false;

        const { state, dispatch } = view;
        const { selection } = state;

        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false;
        }

        const $pos = selection.$from;
        if ($pos.parentOffset !== 0) return false;

        const li_depth = $pos.depth >= 2 ? $pos.depth - 1 : -1;
        if (li_depth < 0) return false;
        const li_node = $pos.node(li_depth);
        if (li_node.type.name !== "list_item") return false;
        if ($pos.index(li_depth) !== 0) return false;

        if (
          li_node.attrs["checked"] !== undefined &&
          li_node.attrs["checked"] !== null
        ) {
          const tr = state.tr.setNodeMarkup($pos.before(li_depth), undefined, {
            ...li_node.attrs,
            checked: null,
          });
          dispatch(tr);
          return true;
        }

        if ($pos.parent.content.size === 0) {
          return lift_command(state, dispatch);
        }

        return false;
      },

      handleClick(view, _pos, event) {
        const target = event.target as HTMLElement;
        const li = target.closest('li[data-item-type="task"]');
        if (!li || !(li instanceof HTMLElement)) return false;

        if (!is_click_on_checkbox(li, event)) return false;

        const dom_pos = view.posAtDOM(li, 0);
        if (dom_pos == null) return false;

        const resolved = view.state.doc.resolve(dom_pos);
        const node_pos = resolved.before(resolved.depth);
        const node = view.state.doc.nodeAt(node_pos);
        if (!node || node.type.name !== "list_item") return false;

        const current: boolean | null = node.attrs["checked"] as boolean | null;
        if (current === null || current === undefined) return false;

        const tr = view.state.tr.setNodeMarkup(node_pos, undefined, {
          ...node.attrs,
          checked: !current,
        });
        view.dispatch(tr);
        return true;
      },
    },
  });
}
