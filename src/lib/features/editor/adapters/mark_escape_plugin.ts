import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { Mark } from "prosemirror-model";

const mark_escape_plugin_key = new PluginKey("mark-escape");

const ESCAPE_MARK_TYPES = new Set([
  "strong",
  "em",
  "code_inline",
  "strikethrough",
  "highlight",
]);

function is_escapable(mark: Mark): boolean {
  return (
    mark.type.spec.inclusive === false || ESCAPE_MARK_TYPES.has(mark.type.name)
  );
}

export function create_mark_escape_prose_plugin(): Plugin {
  return new Plugin({
    key: mark_escape_plugin_key,
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "ArrowRight") return false;

        const { state } = view;
        const { selection } = state;
        if (!(selection instanceof TextSelection) || !selection.empty)
          return false;

        const $cursor = selection.$cursor;
        if (!$cursor) return false;

        const marks = state.storedMarks ?? $cursor.marks();
        const escapable = marks.filter(is_escapable);
        if (escapable.length === 0) return false;

        const node_after = $cursor.nodeAfter;
        const at_boundary = escapable.some(
          (m) => !node_after || !m.type.isInSet(node_after.marks),
        );
        if (!at_boundary) return false;

        let tr = state.tr;
        for (const m of escapable) {
          tr = tr.removeStoredMark(m.type);
        }
        view.dispatch(tr);

        return false;
      },
    },
  });
}
