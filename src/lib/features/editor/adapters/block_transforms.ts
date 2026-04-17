import type { EditorState, Transaction } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import type { Node as ProseNode, NodeType } from "prosemirror-model";
import { Fragment } from "prosemirror-model";
import { wrapIn, setBlockType } from "prosemirror-commands";
import { wrapInList, liftListItem } from "prosemirror-schema-list";
import { schema } from "./schema";
import { compute_heading_ranges } from "./heading_fold_plugin";

type Dispatch = ((tr: Transaction) => void) | undefined;
type Command = (state: EditorState, dispatch?: Dispatch) => boolean;

export type TurnIntoTarget =
  | "paragraph"
  | "heading"
  | "blockquote"
  | "bullet_list"
  | "ordered_list"
  | "todo_list"
  | "code_block"
  | "callout";

function resolve_block_at_cursor(
  state: EditorState,
): { pos: number; node: ProseNode; end: number } | null {
  const $from = state.selection.$from;
  if ($from.depth < 1) return null;
  const pos = $from.start(1) - 1;
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  return { pos, node, end: pos + node.nodeSize };
}

function is_list_node(node: ProseNode): boolean {
  const name = node.type.name;
  return name === "bullet_list" || name === "ordered_list";
}

function is_wrapped_block(node: ProseNode): boolean {
  return node.type.name === "blockquote" || is_list_node(node);
}

function collect_inline_content(node: ProseNode): Fragment {
  if (node.isTextblock) return node.content;
  let content = Fragment.empty;
  node.forEach((child) => {
    const inner = collect_inline_content(child);
    content = content.append(inner);
  });
  return content;
}

function unwrap_to_textblocks(node: ProseNode): ProseNode[] {
  const blocks: ProseNode[] = [];
  node.forEach((child) => {
    if (child.isTextblock) {
      blocks.push(child);
    } else {
      blocks.push(...unwrap_to_textblocks(child));
    }
  });
  return blocks;
}

function replace_block_with(
  state: EditorState,
  dispatch: Dispatch,
  block: { pos: number; end: number },
  nodes: ProseNode[],
  cursor_offset = 1,
): boolean {
  if (!dispatch) return true;
  const tr = state.tr.replaceWith(block.pos, block.end, Fragment.from(nodes));
  const cursor = Math.min(block.pos + cursor_offset, tr.doc.content.size - 1);
  tr.setSelection(TextSelection.create(tr.doc, Math.max(cursor, 1)));
  dispatch(tr.scrollIntoView());
  return true;
}

export function create_turn_into_command(
  target: TurnIntoTarget,
  attrs?: Record<string, unknown>,
): Command {
  return (state: EditorState, dispatch?: Dispatch): boolean => {
    const block = resolve_block_at_cursor(state);
    if (!block) return false;

    const current_name = block.node.type.name;

    if (target === "paragraph") {
      if (current_name === "paragraph") return false;
      if (is_wrapped_block(block.node)) {
        const paras = unwrap_to_textblocks(block.node).map((tb) =>
          schema.nodes.paragraph.create(null, tb.content),
        );
        if (paras.length === 0) paras.push(schema.nodes.paragraph.create());
        return replace_block_with(state, dispatch, block, paras);
      }
      return setBlockType(schema.nodes.paragraph)(state, dispatch);
    }

    if (target === "heading") {
      const level = (attrs?.level as number) ?? 1;
      if (current_name === "heading" && block.node.attrs["level"] === level) {
        return false;
      }
      if (is_wrapped_block(block.node)) {
        const tbs = unwrap_to_textblocks(block.node);
        const first = tbs[0];
        const heading = schema.nodes.heading.create(
          { level, id: "" },
          first ? first.content : undefined,
        );
        const rest = tbs
          .slice(1)
          .map((tb) => schema.nodes.paragraph.create(null, tb.content));
        return replace_block_with(state, dispatch, block, [heading, ...rest]);
      }
      return setBlockType(schema.nodes.heading, { level })(state, dispatch);
    }

    if (target === "blockquote") {
      if (current_name === "blockquote") return false;
      if (is_list_node(block.node)) {
        const paras = unwrap_to_textblocks(block.node).map((tb) =>
          schema.nodes.paragraph.create(null, tb.content),
        );
        const bq = schema.nodes.blockquote.create(null, paras);
        return replace_block_with(state, dispatch, block, [bq], 2);
      }
      return wrapIn(schema.nodes.blockquote)(state, dispatch);
    }

    if (target === "bullet_list") {
      if (current_name === "bullet_list") return false;
      if (is_wrapped_block(block.node)) {
        const items = unwrap_to_textblocks(block.node).map((tb) =>
          schema.nodes.list_item.create(null, [
            schema.nodes.paragraph.create(null, tb.content),
          ]),
        );
        const list = schema.nodes.bullet_list.create(null, items);
        return replace_block_with(state, dispatch, block, [list], 3);
      }
      return wrapInList(schema.nodes.bullet_list)(state, dispatch);
    }

    if (target === "ordered_list") {
      if (current_name === "ordered_list") return false;
      if (is_wrapped_block(block.node)) {
        const items = unwrap_to_textblocks(block.node).map((tb) =>
          schema.nodes.list_item.create(null, [
            schema.nodes.paragraph.create(null, tb.content),
          ]),
        );
        const list = schema.nodes.ordered_list.create(null, items);
        return replace_block_with(state, dispatch, block, [list], 3);
      }
      return wrapInList(schema.nodes.ordered_list)(state, dispatch);
    }

    if (target === "todo_list") {
      if (current_name === "bullet_list" && has_checked_items(block.node)) {
        return false;
      }
      if (is_wrapped_block(block.node)) {
        const items = unwrap_to_textblocks(block.node).map((tb) =>
          schema.nodes.list_item.create(
            { checked: false, listType: "bullet", label: "•" },
            [schema.nodes.paragraph.create(null, tb.content)],
          ),
        );
        const list = schema.nodes.bullet_list.create(null, items);
        return replace_block_with(state, dispatch, block, [list], 3);
      }
      return wrap_as_todo(state, dispatch);
    }

    if (target === "code_block") {
      if (current_name === "code_block") return false;
      if (is_wrapped_block(block.node)) {
        const text = block.node.textContent;
        const cb = schema.nodes.code_block.create(
          { language: "" },
          text ? schema.text(text) : undefined,
        );
        return replace_block_with(state, dispatch, block, [cb]);
      }
      return setBlockType(schema.nodes.code_block, { language: "" })(
        state,
        dispatch,
      );
    }

    if (target === "callout") {
      if (current_name === "callout") return false;
      return convert_to_callout(state, dispatch, block);
    }

    return false;
  };
}

function has_checked_items(node: ProseNode): boolean {
  let found = false;
  node.forEach((child) => {
    if (child.attrs["checked"] != null) found = true;
  });
  return found;
}

function wrap_as_todo(state: EditorState, dispatch: Dispatch): boolean {
  if (!dispatch) return wrapInList(schema.nodes.bullet_list)(state, undefined);
  let current = state;
  const wrapped = wrapInList(schema.nodes.bullet_list)(current, (tr) => {
    current = state.apply(tr);
  });
  if (!wrapped) return false;
  const block = resolve_block_at_cursor(current);
  if (!block) return false;
  const tr = current.tr;
  block.node.forEach((child, offset) => {
    if (child.type.name === "list_item" && child.attrs["checked"] == null) {
      tr.setNodeMarkup(block.pos + 1 + offset, undefined, {
        ...child.attrs,
        checked: false,
      });
    }
  });
  dispatch(tr);
  return true;
}

function convert_to_callout(
  state: EditorState,
  dispatch: Dispatch,
  block: { pos: number; node: ProseNode; end: number },
): boolean {
  if (!dispatch) return true;
  const inline = collect_inline_content(block.node);
  const title = schema.nodes.callout_title.create(null);
  const body_para = schema.nodes.paragraph.create(null, inline);
  const body = schema.nodes.callout_body.create(null, [body_para]);
  const callout = schema.nodes.callout.create(
    { callout_type: "note", foldable: false, default_folded: false },
    [title, body],
  );
  const tr = state.tr.replaceWith(block.pos, block.end, callout);
  tr.setSelection(TextSelection.create(tr.doc, block.pos + 2));
  dispatch(tr.scrollIntoView());
  return true;
}

export function duplicate_block(
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  const block = resolve_block_at_cursor(state);
  if (!block) return false;
  if (!dispatch) return true;

  let insert_pos: number;
  let slice_start: number;
  let slice_end: number;

  if (block.node.type.name === "heading") {
    const ranges = compute_heading_ranges(state.doc);
    const range = ranges.find((r) => r.heading_pos === block.pos);
    if (range) {
      slice_start = range.heading_pos;
      slice_end = range.body_end;
      insert_pos = range.body_end;
    } else {
      slice_start = block.pos;
      slice_end = block.end;
      insert_pos = block.end;
    }
  } else {
    slice_start = block.pos;
    slice_end = block.end;
    insert_pos = block.end;
  }

  const content = state.doc.slice(slice_start, slice_end);
  const tr = state.tr.insert(insert_pos, content.content);
  tr.setSelection(TextSelection.create(tr.doc, insert_pos + 1));
  dispatch(tr.scrollIntoView());
  return true;
}

export function delete_block(state: EditorState, dispatch?: Dispatch): boolean {
  const block = resolve_block_at_cursor(state);
  if (!block) return false;
  if (!dispatch) return true;

  const is_only_child = state.doc.childCount === 1;

  if (is_only_child) {
    const empty_para = schema.nodes.paragraph.create();
    const tr = state.tr.replaceWith(block.pos, block.end, empty_para);
    tr.setSelection(TextSelection.create(tr.doc, 1));
    dispatch(tr.scrollIntoView());
    return true;
  }

  if (block.node.type.name === "heading") {
    const tr = state.tr.delete(block.pos, block.end);
    const cursor_pos = Math.min(
      Math.max(block.pos, 1),
      tr.doc.content.size - 1,
    );
    tr.setSelection(TextSelection.create(tr.doc, cursor_pos));
    dispatch(tr.scrollIntoView());
    return true;
  }

  const tr = state.tr.delete(block.pos, block.end);
  let cursor_pos: number;
  if (block.pos > 0) {
    cursor_pos = Math.max(block.pos - 1, 1);
    cursor_pos = Math.min(cursor_pos, tr.doc.content.size - 1);
  } else {
    cursor_pos = Math.min(1, tr.doc.content.size - 1);
  }
  cursor_pos = Math.max(cursor_pos, 1);
  tr.setSelection(TextSelection.create(tr.doc, cursor_pos));
  dispatch(tr.scrollIntoView());
  return true;
}

export function batch_turn_into(
  target: TurnIntoTarget,
  attrs: Record<string, unknown> | undefined,
  positions: Set<number>,
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  if (positions.size === 0) return false;
  if (!dispatch) return true;
  const sorted = [...positions].sort((a, b) => b - a);
  let tr = state.tr;
  for (const pos of sorted) {
    const node = tr.doc.nodeAt(pos);
    if (!node) continue;
    const end = pos + node.nodeSize;
    const block = { pos, node, end };
    const replacement = build_turn_into_replacement(target, attrs, block);
    if (replacement) {
      tr = tr.replaceWith(pos, end, Fragment.from(replacement));
    }
  }
  tr.setSelection(
    TextSelection.create(
      tr.doc,
      Math.min(sorted[sorted.length - 1]! + 1, tr.doc.content.size - 1),
    ),
  );
  dispatch(tr.scrollIntoView());
  return true;
}

export function batch_duplicate(
  positions: Set<number>,
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  if (positions.size === 0) return false;
  if (!dispatch) return true;
  const sorted = [...positions].sort((a, b) => b - a);
  const tr = state.tr;
  for (const pos of sorted) {
    const node = tr.doc.nodeAt(pos);
    if (!node) continue;
    const end = pos + node.nodeSize;
    if (node.type.name === "heading") {
      const ranges = compute_heading_ranges(tr.doc);
      const range = ranges.find((r) => r.heading_pos === pos);
      if (range) {
        const content = tr.doc.slice(range.heading_pos, range.body_end);
        tr.insert(range.body_end, content.content);
        continue;
      }
    }
    const content = tr.doc.slice(pos, end);
    tr.insert(end, content.content);
  }
  dispatch(tr.scrollIntoView());
  return true;
}

export function batch_delete(
  positions: Set<number>,
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  if (positions.size === 0) return false;
  if (!dispatch) return true;
  const sorted = [...positions].sort((a, b) => b - a);
  const tr = state.tr;
  for (const pos of sorted) {
    const node = tr.doc.nodeAt(pos);
    if (!node) continue;
    if (tr.doc.childCount <= 1) {
      const empty_para = schema.nodes.paragraph.create();
      tr.replaceWith(pos, pos + node.nodeSize, empty_para);
      break;
    }
    tr.delete(pos, pos + node.nodeSize);
  }
  const cursor = Math.max(1, Math.min(tr.doc.content.size - 1, 1));
  tr.setSelection(TextSelection.create(tr.doc, cursor));
  dispatch(tr.scrollIntoView());
  return true;
}

function build_turn_into_replacement(
  target: TurnIntoTarget,
  attrs: Record<string, unknown> | undefined,
  block: { pos: number; node: ProseNode; end: number },
): ProseNode[] | null {
  const node = block.node;
  const current_name = node.type.name;

  if (target === "paragraph") {
    if (current_name === "paragraph") return null;
    if (is_wrapped_block(node)) {
      const paras = unwrap_to_textblocks(node).map((tb) =>
        schema.nodes.paragraph.create(null, tb.content),
      );
      return paras.length > 0 ? paras : [schema.nodes.paragraph.create()];
    }
    return [schema.nodes.paragraph.create(null, collect_inline_content(node))];
  }

  if (target === "heading") {
    const level = (attrs?.level as number) ?? 1;
    if (current_name === "heading" && node.attrs["level"] === level)
      return null;
    if (is_wrapped_block(node)) {
      const tbs = unwrap_to_textblocks(node);
      const first = tbs[0];
      const heading = schema.nodes.heading.create(
        { level, id: "" },
        first ? first.content : undefined,
      );
      const rest = tbs
        .slice(1)
        .map((tb) => schema.nodes.paragraph.create(null, tb.content));
      return [heading, ...rest];
    }
    return [
      schema.nodes.heading.create(
        { level, id: "" },
        collect_inline_content(node),
      ),
    ];
  }

  if (target === "blockquote") {
    if (current_name === "blockquote") return null;
    if (is_list_node(node)) {
      const paras = unwrap_to_textblocks(node).map((tb) =>
        schema.nodes.paragraph.create(null, tb.content),
      );
      return [schema.nodes.blockquote.create(null, paras)];
    }
    const para = node.isTextblock
      ? schema.nodes.paragraph.create(null, node.content)
      : schema.nodes.paragraph.create(null, collect_inline_content(node));
    return [schema.nodes.blockquote.create(null, [para])];
  }

  if (target === "bullet_list" || target === "ordered_list") {
    const list_type =
      target === "bullet_list"
        ? schema.nodes.bullet_list
        : schema.nodes.ordered_list;
    if (current_name === target) return null;
    if (is_wrapped_block(node)) {
      const items = unwrap_to_textblocks(node).map((tb) =>
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, tb.content),
        ]),
      );
      return [list_type.create(null, items)];
    }
    const item = schema.nodes.list_item.create(null, [
      schema.nodes.paragraph.create(null, collect_inline_content(node)),
    ]);
    return [list_type.create(null, [item])];
  }

  if (target === "todo_list") {
    if (current_name === "bullet_list" && has_checked_items(node)) return null;
    const tbs = is_wrapped_block(node) ? unwrap_to_textblocks(node) : [node];
    const items = tbs.map((tb) =>
      schema.nodes.list_item.create(
        { checked: false, listType: "bullet", label: "•" },
        [
          schema.nodes.paragraph.create(
            null,
            tb.isTextblock ? tb.content : collect_inline_content(tb),
          ),
        ],
      ),
    );
    return [schema.nodes.bullet_list.create(null, items)];
  }

  if (target === "code_block") {
    if (current_name === "code_block") return null;
    const text = node.textContent;
    return [
      schema.nodes.code_block.create(
        { language: "" },
        text ? schema.text(text) : undefined,
      ),
    ];
  }

  if (target === "callout") {
    if (current_name === "callout") return null;
    const inline = collect_inline_content(node);
    const title = schema.nodes.callout_title.create(null);
    const body_para = schema.nodes.paragraph.create(null, inline);
    const body = schema.nodes.callout_body.create(null, [body_para]);
    return [
      schema.nodes.callout.create(
        { callout_type: "note", foldable: false, default_folded: false },
        [title, body],
      ),
    ];
  }

  return null;
}
