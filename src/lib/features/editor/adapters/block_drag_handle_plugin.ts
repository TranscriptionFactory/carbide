import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { is_draggable_node_type } from "../domain/detect_draggable_blocks";
import {
  compute_section_drop,
  apply_block_move,
} from "../domain/compute_block_drop";
import { compute_heading_ranges } from "./heading_fold_plugin";
import {
  create_block_insert_menu,
  type BlockInsertMenu,
} from "./block_insert_menu";

const block_drag_handle_plugin_key = new PluginKey<DragHandleState>(
  "block_drag_handle",
);

const FOCUS_MODE_KEYSTROKE_THRESHOLD = 4;

type DragHandleState = { set: DecorationSet; starts: number[] };
type HandleEntry = { el: HTMLElement; get_pos: () => number | undefined };
type BuildHandle = (
  view: EditorView,
  get_pos: () => number | undefined,
) => HTMLElement;

function resolve_top_level_block(
  view: EditorView,
  pos: number,
): { pos: number; node: ProseNode } | null {
  const $pos = view.state.doc.resolve(pos);
  if ($pos.depth === 0) return null;

  const top_pos = $pos.before(1);
  const node = view.state.doc.nodeAt(top_pos);
  if (!node || !is_draggable_node_type(node.type.name)) return null;

  return { pos: top_pos, node };
}

function build_handle_element(): HTMLDivElement {
  const handle = document.createElement("div");
  handle.className = "block-drag-handle";
  handle.contentEditable = "false";
  handle.draggable = true;
  handle.setAttribute("aria-label", "Drag to reorder block");
  handle.setAttribute("role", "button");

  const insert_btn = document.createElement("div");
  insert_btn.className = "block-drag-handle__insert";
  insert_btn.setAttribute("aria-label", "Insert block below");
  insert_btn.setAttribute("role", "button");
  handle.appendChild(insert_btn);

  const grip = document.createElement("div");
  grip.className = "block-drag-handle__grip";
  handle.appendChild(grip);

  return handle;
}

export function insert_paragraph_below(
  view: EditorView,
  block_pos: number,
): number | null {
  const node = view.state.doc.nodeAt(block_pos);
  if (!node) return null;

  const insert_pos = block_pos + node.nodeSize;
  const paragraph = view.state.schema.nodes["paragraph"]?.create();
  if (!paragraph) return null;

  const from = insert_pos + 1;
  const tr = view.state.tr.insert(insert_pos, paragraph);
  tr.setSelection(TextSelection.create(tr.doc, from));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return from;
}

function compute_drag_range(
  view: EditorView,
  block_pos: number,
): { from: number; to: number } | null {
  const node = view.state.doc.nodeAt(block_pos);
  if (!node) return null;

  if (node.type.name === "heading") {
    const ranges = compute_heading_ranges(view.state.doc);
    const range = ranges.find((r) => r.heading_pos === block_pos);
    if (range) {
      return { from: range.heading_pos, to: range.body_end };
    }
    return { from: block_pos, to: block_pos + node.nodeSize };
  }

  return { from: block_pos, to: block_pos + node.nodeSize };
}

function collect_top_level_starts(doc: ProseNode): number[] {
  const starts: number[] = [];
  doc.forEach((node, offset) => {
    if (is_draggable_node_type(node.type.name)) starts.push(offset);
  });
  return starts;
}

function arrays_equal(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function build_drag_handle_decorations(
  doc: ProseNode,
  build_handle: BuildHandle,
): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    if (!is_draggable_node_type(node.type.name)) return;
    decorations.push(
      Decoration.widget(offset, build_handle, {
        side: -1,
        ignoreSelection: true,
        stopEvent: () => true,
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export function create_block_drag_handle_prose_plugin(): Plugin {
  let dragging_range: { from: number; to: number } | null = null;
  let is_dragging = false;
  let insert_menu: BlockInsertMenu | null = null;
  const handles: HandleEntry[] = [];

  function on_dragstart(
    view: EditorView,
    get_pos: () => number | undefined,
    handle: HTMLElement,
    event: DragEvent,
  ) {
    const block_pos = get_pos();
    if (block_pos == null) return;

    const range = compute_drag_range(view, block_pos);
    if (!range) return;

    is_dragging = true;
    handle.classList.add("block-drag-handle--dragging");
    dragging_range = range;

    const sel = TextSelection.create(view.state.doc, range.from, range.to);
    view.dispatch(view.state.tr.setSelection(sel));

    const slice = view.state.doc.slice(range.from, range.to);
    const dom_node = view.nodeDOM(block_pos);
    if (dom_node instanceof HTMLElement && event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setDragImage(dom_node, 0, 0);
    }

    view.dragging = { slice, move: true };
  }

  function on_dragend(handle: HTMLElement) {
    is_dragging = false;
    handle.classList.remove("block-drag-handle--dragging");
    dragging_range = null;
  }

  function on_insert_click(
    view: EditorView,
    get_pos: () => number | undefined,
    anchor_el: HTMLElement,
    event: MouseEvent,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const block_pos = get_pos();
    if (block_pos == null) return;

    const anchor_rect = anchor_el.getBoundingClientRect();
    const from = insert_paragraph_below(view, block_pos);
    if (from == null) return;
    insert_menu?.open(anchor_rect, from);
  }

  function build_handle(
    view: EditorView,
    get_pos: () => number | undefined,
  ): HTMLElement {
    const handle = build_handle_element();
    const insert_btn = handle.querySelector(
      ".block-drag-handle__insert",
    ) as HTMLElement;

    handle.addEventListener("dragstart", (event) =>
      on_dragstart(view, get_pos, handle, event),
    );
    handle.addEventListener("dragend", () => on_dragend(handle));
    insert_btn.addEventListener("mousedown", (event) =>
      on_insert_click(view, get_pos, insert_btn, event),
    );

    handles.push({ el: handle, get_pos });
    return handle;
  }

  function build_set(doc: ProseNode): DecorationSet {
    return build_drag_handle_decorations(doc, build_handle);
  }

  return new Plugin<DragHandleState>({
    key: block_drag_handle_plugin_key,

    state: {
      init(_config, { doc }) {
        return { set: build_set(doc), starts: collect_top_level_starts(doc) };
      },
      apply(tr, prev) {
        if (!tr.docChanged) return prev;
        const curr_starts = collect_top_level_starts(tr.doc);
        const mapped_starts = prev.starts.map((p) => tr.mapping.map(p, -1));
        if (arrays_equal(curr_starts, mapped_starts)) {
          return { set: prev.set.map(tr.mapping, tr.doc), starts: curr_starts };
        }
        return { set: build_set(tr.doc), starts: curr_starts };
      },
    },

    props: {
      decorations(state) {
        return (
          block_drag_handle_plugin_key.getState(state)?.set ??
          DecorationSet.empty
        );
      },

      handleDrop(view, event, _slice, moved) {
        if (dragging_range == null) return false;
        if (!moved) return false;

        const range = dragging_range;
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (!coords) return false;

        const result = compute_section_drop(
          view.state.doc,
          range.from,
          range.to,
          coords.pos,
        );
        if (!result) return false;

        const tr = view.state.tr;
        apply_block_move(tr, result);
        view.dispatch(tr);

        dragging_range = null;
        return true;
      },
    },

    view(editor_view: EditorView) {
      const editor_dom = editor_view.dom;
      insert_menu = create_block_insert_menu(editor_view);
      let keystroke_count = 0;
      let focus_mode_active = false;
      let near_pos: number | null = null;

      function is_feature_enabled(): boolean {
        return editor_dom.closest(".show-block-drag-handle") !== null;
      }

      function enter_focus_mode() {
        if (focus_mode_active) return;
        focus_mode_active = true;
        editor_dom.classList.add("typing-focus");
      }

      function exit_focus_mode() {
        if (!focus_mode_active) return;
        focus_mode_active = false;
        keystroke_count = 0;
        editor_dom.classList.remove("typing-focus");
      }

      function on_keydown() {
        keystroke_count++;
        if (keystroke_count >= FOCUS_MODE_KEYSTROKE_THRESHOLD) {
          enter_focus_mode();
        }
      }

      function set_near(pos: number | null) {
        if (pos === near_pos) return;
        near_pos = pos;
        for (let i = handles.length - 1; i >= 0; i--) {
          const entry = handles[i];
          if (!entry) continue;
          if (!entry.el.isConnected) {
            handles.splice(i, 1);
            continue;
          }
          const p = entry.get_pos();
          entry.el.classList.toggle(
            "block-drag-handle--near",
            p != null && p === pos,
          );
        }
      }

      function on_mousemove(event: MouseEvent) {
        exit_focus_mode();
        if (is_dragging) return;
        if (!is_feature_enabled()) return;

        const info = editor_view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (!info) return;

        const block = resolve_top_level_block(editor_view, info.pos);
        if (block) set_near(block.pos);
      }

      function on_mouseleave() {
        if (is_dragging) return;
        set_near(null);
      }

      editor_dom.addEventListener("mousemove", on_mousemove);
      editor_dom.addEventListener("mouseleave", on_mouseleave);
      editor_dom.addEventListener("keydown", on_keydown);

      return {
        destroy() {
          exit_focus_mode();
          insert_menu?.destroy();
          insert_menu = null;
          editor_dom.removeEventListener("mousemove", on_mousemove);
          editor_dom.removeEventListener("mouseleave", on_mouseleave);
          editor_dom.removeEventListener("keydown", on_keydown);
        },
      };
    },
  });
}
