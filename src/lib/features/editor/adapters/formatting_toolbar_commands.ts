import type { EditorView } from "prosemirror-view";
import { toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { undo as pmUndo, redo as pmRedo } from "prosemirror-history";
import { yUndoPluginKey, undo as yUndo, redo as yRedo } from "y-prosemirror";
import { TextSelection, type EditorState } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Mark, MarkType, NodeType } from "prosemirror-model";
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

type PmCommand = (
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
) => boolean;

function toggle_mark_command(name: string): PmCommand | null {
  const mark = get_mark_type(name);
  return mark ? toggleMark(mark) : null;
}

function build_command(command: FormattingCommand): PmCommand | null {
  switch (command) {
    case "bold":
      return toggle_mark_command("strong");
    case "italic":
      return toggle_mark_command("em");
    case "strikethrough":
      return toggle_mark_command("strikethrough");
    case "code":
      return toggle_mark_command("code_inline");
    case "heading1": {
      const node = get_node_type("heading");
      return node ? setBlockType(node, { level: 1 }) : null;
    }
    case "heading2": {
      const node = get_node_type("heading");
      return node ? setBlockType(node, { level: 2 }) : null;
    }
    case "heading3": {
      const node = get_node_type("heading");
      return node ? setBlockType(node, { level: 3 }) : null;
    }
    case "blockquote": {
      const node = get_node_type("blockquote");
      return node ? wrapIn(node) : null;
    }
    case "bullet_list": {
      const list_node = get_node_type("bullet_list");
      return list_node ? wrapInList(list_node) : null;
    }
    case "ordered_list": {
      const list_node = get_node_type("ordered_list");
      return list_node ? wrapInList(list_node) : null;
    }
    case "code_block": {
      const node = get_node_type("code_block");
      return node ? setBlockType(node) : null;
    }
    default:
      return null;
  }
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

    case "bold":
    case "italic":
    case "strikethrough":
    case "code":
    case "heading1":
    case "heading2":
    case "heading3":
    case "blockquote":
    case "bullet_list":
    case "ordered_list":
    case "code_block": {
      const cmd = build_command(command);
      return cmd ? cmd(state, dispatch) : false;
    }

    case "link":
      return false;
    case "image":
      return false;

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

  if (command === "link") {
    return link_selection_state(view).can_edit;
  }
  if (
    command === "image" ||
    command === "table" ||
    command === "horizontal_rule"
  ) {
    return true;
  }

  return probe_command(command, state);
}

function probe_command(
  command: FormattingCommand,
  state: EditorState,
): boolean {
  try {
    return build_command(command)?.(state) ?? false;
  } catch {
    return false;
  }
}

const block_active_commands = new Set<FormattingCommand>([
  "heading1",
  "heading2",
  "heading3",
  "blockquote",
  "bullet_list",
  "ordered_list",
  "code_block",
]);

function node_matches_command(
  command: FormattingCommand,
  node_name: string,
  attrs: Record<string, unknown>,
): boolean {
  switch (command) {
    case "heading1":
      return node_name === "heading" && attrs["level"] === 1;
    case "heading2":
      return node_name === "heading" && attrs["level"] === 2;
    case "heading3":
      return node_name === "heading" && attrs["level"] === 3;
    case "blockquote":
      return node_name === "blockquote";
    case "bullet_list":
      return node_name === "bullet_list";
    case "ordered_list":
      return node_name === "ordered_list";
    case "code_block":
      return node_name === "code_block";
    default:
      return false;
  }
}

export function is_block_command_active(
  command: FormattingCommand,
  view: EditorView,
): boolean {
  if (!block_active_commands.has(command)) return false;
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    if (node_matches_command(command, node.type.name, node.attrs)) return true;
  }
  return false;
}

export interface LinkSelectionState {
  can_edit: boolean;
  existing_href: string | null;
}

function find_link_mark(state: EditorState): Mark | null {
  const mark_type = get_mark_type("link");
  if (!mark_type) return null;
  const { $from } = state.selection;
  return $from.marks().find((m) => m.type === mark_type) ?? null;
}

export function link_selection_state(view: EditorView): LinkSelectionState {
  const { state } = view;
  const mark_type = get_mark_type("link");
  if (!mark_type) return { can_edit: false, existing_href: null };
  const existing = find_link_mark(state);
  if (existing) {
    return {
      can_edit: true,
      existing_href: String(existing.attrs["href"] ?? ""),
    };
  }
  return { can_edit: !state.selection.empty, existing_href: null };
}

export function apply_link(view: EditorView, href: string): void {
  const mark_type = get_mark_type("link");
  if (!mark_type) return;
  const { state } = view;
  const trimmed = href.trim();
  if (!trimmed) return;

  const existing_range = state.selection.empty
    ? mark_range_at_cursor(state, mark_type)
    : null;
  const from = existing_range ? existing_range.from : state.selection.from;
  const to = existing_range ? existing_range.to : state.selection.to;

  if (from === to) {
    const text = state.schema.text(trimmed, [
      mark_type.create({ href: trimmed }),
    ]);
    view.dispatch(state.tr.replaceSelectionWith(text, false));
    view.focus();
    return;
  }

  const tr = state.tr;
  tr.removeMark(from, to, mark_type);
  tr.addMark(from, to, mark_type.create({ href: trimmed }));
  view.dispatch(tr);
  view.focus();
}

export function remove_link(view: EditorView): void {
  const mark_type = get_mark_type("link");
  if (!mark_type) return;
  const { state } = view;
  const { from, to, empty } = state.selection;
  if (empty) {
    const range = mark_range_at_cursor(state, mark_type);
    if (!range) return;
    view.dispatch(state.tr.removeMark(range.from, range.to, mark_type));
  } else {
    view.dispatch(state.tr.removeMark(from, to, mark_type));
  }
  view.focus();
}

function mark_range_at_cursor(
  state: EditorState,
  mark_type: MarkType,
): { from: number; to: number } | null {
  const { $from } = state.selection;
  if (!mark_type.isInSet($from.marks())) return null;
  const parent = $from.parent;
  const parent_start = $from.start();
  let from = $from.pos;
  let to = $from.pos;
  parent.forEach((child, offset) => {
    const child_from = parent_start + offset;
    const child_to = child_from + child.nodeSize;
    if (!mark_type.isInSet(child.marks)) return;
    if (child_from <= $from.pos && $from.pos <= child_to) {
      from = Math.min(from, child_from);
      to = Math.max(to, child_to);
    }
  });
  return from < to ? { from, to } : null;
}

export async function insert_image(view: EditorView): Promise<boolean> {
  const image_block = get_node_type("image-block");
  if (!image_block) return false;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      title: "Insert Image",
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"],
        },
      ],
    });
    if (typeof selected !== "string") return false;
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const src = convertFileSrc(selected);
    const node = image_block.create({ src });
    const tr = view.state.tr.replaceSelectionWith(node);
    tr.setSelection(TextSelection.create(tr.doc, view.state.selection.from));
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  } catch {
    return false;
  }
}

export { execute_command as toggle_format };
