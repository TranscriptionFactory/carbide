import { Plugin, PluginKey, Selection, TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { Mark, ResolvedPos } from "prosemirror-model";

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

function cursor_of(state: EditorState): ResolvedPos | null {
  const { selection } = state;
  return selection instanceof TextSelection ? selection.$cursor : null;
}

// Marks that apply at the cursor but not to what follows it: the cursor has
// come to rest at the trailing edge of their run, so typing should not extend
// them any further.
function trailing_marks(state: EditorState, $cursor: ResolvedPos): Mark[] {
  const node_after = $cursor.nodeAfter;
  return (state.storedMarks ?? $cursor.marks())
    .filter(is_escapable)
    .filter((mark) => !node_after || !mark.type.isInSet(node_after.marks));
}

function clear_stored_marks(state: EditorState, marks: Mark[]): Transaction {
  let tr = state.tr;
  for (const mark of marks) tr = tr.removeStoredMark(mark.type);
  return tr;
}

export function create_mark_escape_prose_plugin(): Plugin {
  return new Plugin({
    key: mark_escape_plugin_key,
    // Clearing runs after the caret has moved, not during the keydown that
    // moves it: dispatching mid-keydown re-renders the view underneath the
    // browser's pending native move.
    appendTransaction(trs, old_state, new_state) {
      if (trs.some((tr) => tr.docChanged)) return null;
      if (!trs.some((tr) => tr.selectionSet)) return null;

      const $cursor = cursor_of(new_state);
      const $previous = cursor_of(old_state);
      if (!$cursor || !$previous || $cursor.pos <= $previous.pos) return null;

      const marks = trailing_marks(new_state, $cursor);
      return marks.length > 0 ? clear_stored_marks(new_state, marks) : null;
    },
    props: {
      handleKeyDown(view, event) {
        if (
          event.key !== "ArrowRight" ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.shiftKey
        ) {
          return false;
        }

        const { state } = view;
        const $cursor = cursor_of(state);
        // Every other caret move produces a transaction for appendTransaction
        // to act on; at the end of the document there is no move to observe.
        if (!$cursor || $cursor.pos < Selection.atEnd(state.doc).from) {
          return false;
        }

        const marks = trailing_marks(state, $cursor);
        if (marks.length === 0) return false;

        view.dispatch(clear_stored_marks(state, marks));
        return true;
      },
    },
  });
}
