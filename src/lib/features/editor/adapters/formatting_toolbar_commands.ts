import type { EditorView } from "prosemirror-view";
import { toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { undo as pmUndo, redo as pmRedo } from "prosemirror-history";
import { yUndoPluginKey, undo as yUndo, redo as yRedo } from "y-prosemirror";
import type { EditorState } from "prosemirror-state";
import type { MarkType, NodeType } from "prosemirror-model";
import { schema } from "./markdown_pipeline";

export type FormattingCommand =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "link"
  | "heading1"
  | "heading2"
  | "heading3"
  | "blockquote"
  | "bullet_list"
  | "ordered_list"
  | "code_block"
  | "table"
  | "horizontal_rule"
  | "image";

export function get_active_marks(view: EditorView): Set<string> {
  const { $from } = view.state.selection;
  const marks = $from.marks();
  const active = new Set<string>();
  for (const mark of marks) {
    active.add(mark.type.name);
  }
  return active;
}

function resolve_undo_redo(state: EditorState) {
  const has_yjs = yUndoPluginKey.getState(state) !== undefined;
  return {
    undo: has_yjs ? yUndo : pmUndo,
    redo: has_yjs ? yRedo : pmRedo,
  };
}

function get_mark_type(name: string): MarkType | undefined {
  return schema.marks[name];
}

function get_node_type(name: string): NodeType | undefined {
  return schema.nodes[name];
}

function execute_command(
  command: FormattingCommand,
  view: EditorView,
): boolean {
  const { state, dispatch } = view;
  const { undo, redo } = resolve_undo_redo(state);

  switch (command) {
    case "undo":
      return undo(state, dispatch);
    case "redo":
      return redo(state, dispatch);

    case "bold": {
      const mark = get_mark_type("strong");
      return mark ? toggleMark(mark)(state, dispatch) : false;
    }
    case "italic": {
      const mark = get_mark_type("em");
      return mark ? toggleMark(mark)(state, dispatch) : false;
    }
    case "strikethrough": {
      const mark = get_mark_type("strikethrough");
      return mark ? toggleMark(mark)(state, dispatch) : false;
    }
    case "code": {
      const mark = get_mark_type("code_inline");
      return mark ? toggleMark(mark)(state, dispatch) : false;
    }
    // TODO: async input UI needed
    case "link":
      return false;
    // TODO: async input UI needed
    case "image":
      return false;

    case "heading1": {
      const node = get_node_type("heading");
      if (!node) return false;
      return setBlockType(node, { level: 1 })(state, dispatch);
    }
    case "heading2": {
      const node = get_node_type("heading");
      if (!node) return false;
      return setBlockType(node, { level: 2 })(state, dispatch);
    }
    case "heading3": {
      const node = get_node_type("heading");
      if (!node) return false;
      return setBlockType(node, { level: 3 })(state, dispatch);
    }
    case "blockquote": {
      const node = get_node_type("blockquote");
      if (!node) return false;
      return wrapIn(node)(state, dispatch);
    }
    case "bullet_list": {
      const list_node = get_node_type("bullet_list");
      if (!list_node) return false;
      return wrapInList(list_node)(state, dispatch);
    }
    case "ordered_list": {
      const list_node = get_node_type("ordered_list");
      if (!list_node) return false;
      return wrapInList(list_node)(state, dispatch);
    }
    case "code_block": {
      const node = get_node_type("code_block");
      if (!node) return false;
      return setBlockType(node)(state, dispatch);
    }
    case "table": {
      const table = get_node_type("table");
      const row = get_node_type("table_row");
      const cell = get_node_type("table_cell");
      if (!table || !row || !cell) return false;
      const header_cell = get_node_type("table_header") ?? cell;
      const header_row = row.create(
        null,
        Array.from({ length: 3 }, () => header_cell.create()),
      );
      const body_row = row.create(
        null,
        Array.from({ length: 3 }, () => cell.create()),
      );
      const table_node = table.create(null, [header_row, body_row]);
      const tr = state.tr.replaceSelectionWith(table_node);
      dispatch(tr);
      return true;
    }
    case "horizontal_rule": {
      const node = get_node_type("horizontal_rule");
      if (!node) return false;
      const tr = state.tr.replaceSelectionWith(node.create());
      dispatch(tr);
      return true;
    }

    default:
      return false;
  }
}

export function is_command_available(
  command: FormattingCommand,
  view: EditorView,
): boolean {
  const { state } = view;
  const { undo, redo } = resolve_undo_redo(state);

  if (command === "undo") {
    try {
      return undo(state, undefined);
    } catch {
      return false;
    }
  }
  if (command === "redo") {
    try {
      return redo(state, undefined);
    } catch {
      return false;
    }
  }

  // TODO: async input UI needed
  if (command === "link" || command === "image") return false;

  if (command === "blockquote") {
    const node = get_node_type("blockquote");
    if (!node) return false;
    return wrapIn(node)(state);
  }

  if (command === "bullet_list") {
    const list_node = get_node_type("bullet_list");
    if (!list_node) return false;
    return wrapInList(list_node)(state);
  }

  if (command === "ordered_list") {
    const list_node = get_node_type("ordered_list");
    if (!list_node) return false;
    return wrapInList(list_node)(state);
  }

  return true;
}

export { execute_command as toggle_format };
