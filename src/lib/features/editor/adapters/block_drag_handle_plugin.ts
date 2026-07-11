import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { SelectionBookmark } from "prosemirror-state";
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
const FOCUS_EXIT_MOVE_THRESHOLD_PX = 5;
const ALIGN_CULL_MARGIN_PX = 300;

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

export function build_handle_element(): HTMLDivElement {
  const handle = document.createElement("div");
  handle.className = "block-drag-handle";
  handle.contentEditable = "false";
  handle.draggable = true;
  handle.setAttribute("aria-label", "Drag to reorder block");
  handle.setAttribute("role", "button");
  handle.title = "Drag to move block · Click to select";
  handle.tabIndex = 0;

  const insert_btn = document.createElement("div");
  insert_btn.className = "block-drag-handle__insert";
  insert_btn.setAttribute("aria-label", "Insert block below");
  insert_btn.setAttribute("role", "button");
  insert_btn.title = "Insert block below";
  insert_btn.tabIndex = 0;
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

export function remove_empty_placeholder(
  view: EditorView,
  from: number,
  prev_selection: SelectionBookmark,
): void {
  if (!view.dom.isConnected) return;
  const doc = view.state.doc;
  if (from < 0 || from > doc.content.size) return;

  const $from = doc.resolve(from);
  if ($from.depth !== 1) return;
  const parent = $from.parent;
  if (parent.type.name !== "paragraph" || parent.content.size !== 0) return;

  const sel = view.state.selection;
  if (!sel.empty || sel.from !== from) return;

  const tr = view.state.tr.delete($from.before(1), $from.after(1));
  tr.setSelection(prev_selection.resolve(tr.doc));
  view.dispatch(tr);
}

function select_drag_range(
  view: EditorView,
  range: { from: number; to: number },
) {
  const sel = TextSelection.create(view.state.doc, range.from, range.to);
  view.dispatch(view.state.tr.setSelection(sel));
  view.focus();
}

export function count_section_body_blocks(
  doc: ProseNode,
  from: number,
  to: number,
): number {
  return Math.max(0, doc.slice(from, to).content.childCount - 1);
}

export function compute_drag_range(
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

  let drop_indicator: HTMLElement | null = null;
  let indicator_frame: number | null = null;
  let last_drag_coords: { x: number; y: number } | null = null;
  let drag_image_wrapper: HTMLElement | null = null;
  let drag_prev_selection: SelectionBookmark | null = null;
  let drop_succeeded = false;
  let suppress_click = false;

  function ensure_drop_indicator(): HTMLElement {
    if (!drop_indicator) {
      drop_indicator = document.createElement("div");
      drop_indicator.className = "block-drop-indicator";
      document.body.appendChild(drop_indicator);
    }
    return drop_indicator;
  }

  function hide_drop_indicator() {
    if (indicator_frame !== null) {
      cancelAnimationFrame(indicator_frame);
      indicator_frame = null;
    }
    last_drag_coords = null;
    if (drop_indicator) drop_indicator.style.display = "none";
  }

  function position_drop_indicator(view: EditorView, x: number, y: number) {
    const range = dragging_range;
    const coords = range ? view.posAtCoords({ left: x, top: y }) : null;
    const result =
      range && coords
        ? compute_section_drop(view.state.doc, range.from, range.to, coords.pos)
        : null;
    if (!result) {
      hide_drop_indicator();
      return;
    }

    const el = ensure_drop_indicator();
    const line = view.coordsAtPos(result.insert_pos);
    const editor_rect = view.dom.getBoundingClientRect();
    el.style.left = `${String(editor_rect.left)}px`;
    el.style.width = `${String(editor_rect.width)}px`;
    el.style.top = `${String(line.top - 1)}px`;
    el.style.display = "block";
  }

  function schedule_drop_indicator(view: EditorView, x: number, y: number) {
    last_drag_coords = { x, y };
    if (indicator_frame !== null) return;
    indicator_frame = requestAnimationFrame(() => {
      indicator_frame = null;
      if (last_drag_coords && dragging_range) {
        position_drop_indicator(view, last_drag_coords.x, last_drag_coords.y);
      }
    });
  }

  function remove_drag_image_wrapper() {
    drag_image_wrapper?.remove();
    drag_image_wrapper = null;
  }

  function build_drag_image(dom_node: HTMLElement, extra: number): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "block-drag-image";
    wrapper.style.position = "absolute";
    wrapper.style.top = "-10000px";
    wrapper.style.left = "0";
    wrapper.style.width = `${String(dom_node.offsetWidth)}px`;
    wrapper.appendChild(dom_node.cloneNode(true));
    const badge = document.createElement("span");
    badge.className = "block-drag-image__badge";
    badge.textContent = `+${String(extra)} block${extra === 1 ? "" : "s"}`;
    wrapper.appendChild(badge);
    document.body.appendChild(wrapper);
    return wrapper;
  }

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
    suppress_click = true;
    handle.classList.add("block-drag-handle--dragging");
    document.body.classList.add("block-handle-dragging");
    dragging_range = range;
    drag_prev_selection = view.state.selection.getBookmark();
    drop_succeeded = false;

    select_drag_range(view, range);

    const slice = view.state.doc.slice(range.from, range.to);
    const dom_node = view.nodeDOM(block_pos);
    if (dom_node instanceof HTMLElement && event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      const extra = count_section_body_blocks(
        view.state.doc,
        range.from,
        range.to,
      );
      if (extra > 0) {
        drag_image_wrapper = build_drag_image(dom_node, extra);
        event.dataTransfer.setDragImage(drag_image_wrapper, 0, 0);
      } else {
        event.dataTransfer.setDragImage(dom_node, 0, 0);
      }
    }

    view.dragging = { slice, move: true };
  }

  function on_dragend(view: EditorView, handle: HTMLElement) {
    is_dragging = false;
    handle.classList.remove("block-drag-handle--dragging");
    document.body.classList.remove("block-handle-dragging");
    dragging_range = null;
    hide_drop_indicator();
    remove_drag_image_wrapper();

    if (!drop_succeeded && drag_prev_selection) {
      const sel = drag_prev_selection.resolve(view.state.doc);
      view.dispatch(view.state.tr.setSelection(sel));
    }
    drag_prev_selection = null;
  }

  function select_block(view: EditorView, get_pos: () => number | undefined) {
    const block_pos = get_pos();
    if (block_pos == null) return;
    const range = compute_drag_range(view, block_pos);
    if (range) select_drag_range(view, range);
  }

  function on_insert_click(
    view: EditorView,
    get_pos: () => number | undefined,
    anchor_el: HTMLElement,
    event: MouseEvent,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    open_insert_menu(view, get_pos, anchor_el);
  }

  function open_insert_menu(
    view: EditorView,
    get_pos: () => number | undefined,
    anchor_el: HTMLElement,
  ) {
    const block_pos = get_pos();
    if (block_pos == null) return;

    const anchor_rect = anchor_el.getBoundingClientRect();
    const prev_selection = view.state.selection.getBookmark();
    const from = insert_paragraph_below(view, block_pos);
    if (from == null) return;
    insert_menu?.open(anchor_rect, from, () => {
      remove_empty_placeholder(view, from, prev_selection);
    });
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
    handle.addEventListener("dragend", () => on_dragend(view, handle));
    handle.addEventListener("mousedown", () => {
      suppress_click = false;
    });
    handle.addEventListener("click", (event) => {
      if (event.target instanceof Node && insert_btn.contains(event.target))
        return;
      if (suppress_click) return;
      event.preventDefault();
      event.stopPropagation();
      select_block(view, get_pos);
    });
    handle.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.target === insert_btn) {
        open_insert_menu(view, get_pos, insert_btn);
        return;
      }
      select_block(view, get_pos);
    });
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

      handleDOMEvents: {
        dragover(view, event) {
          if (dragging_range == null) return false;
          schedule_drop_indicator(view, event.clientX, event.clientY);
          return false;
        },
      },

      handleDrop(view, event, _slice, moved) {
        if (dragging_range == null) return false;
        if (!moved) return false;

        const range = dragging_range;
        hide_drop_indicator();
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

        drop_succeeded = true;
        dragging_range = null;
        return true;
      },
    },

    view(editor_view: EditorView) {
      const editor_dom = editor_view.dom;
      insert_menu = create_block_insert_menu(editor_view);
      let keystroke_count = 0;
      let focus_mode_active = false;
      let focus_exit_movement = 0;
      let near_pos: number | null = null;
      let align_frame: number | null = null;
      let mouse_frame: number | null = null;
      let last_mouse: { x: number; y: number } | null = null;

      function align_handles() {
        const pm_rect = editor_dom.getBoundingClientRect();
        const scroll_top = editor_dom.scrollTop;
        const measured: { el: HTMLElement; top: number }[] = [];

        for (let i = handles.length - 1; i >= 0; i--) {
          const entry = handles[i];
          if (!entry) continue;
          if (!entry.el.isConnected) {
            handles.splice(i, 1);
            continue;
          }
          const pos = entry.get_pos();
          if (pos == null) continue;
          const dom = editor_view.nodeDOM(pos);
          if (!(dom instanceof HTMLElement)) continue;

          const block_rect = dom.getBoundingClientRect();
          if (
            block_rect.bottom < pm_rect.top - ALIGN_CULL_MARGIN_PX ||
            block_rect.top > pm_rect.bottom + ALIGN_CULL_MARGIN_PX
          )
            continue;
          const style = getComputedStyle(dom);
          const line_height = parseFloat(style.lineHeight) || block_rect.height;
          const padding_top = parseFloat(style.paddingTop) || 0;
          const handle_height = entry.el.offsetHeight || 24;
          const baseline_offset =
            padding_top + line_height * 0.9 - handle_height;
          const top =
            block_rect.top - pm_rect.top + scroll_top + baseline_offset;
          measured.push({ el: entry.el, top });
        }

        for (const m of measured) m.el.style.top = `${String(m.top)}px`;
      }

      function schedule_align() {
        if (typeof requestAnimationFrame === "undefined") return;
        if (align_frame !== null) return;
        align_frame = requestAnimationFrame(() => {
          align_frame = null;
          align_handles();
        });
      }

      const resize_observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(() => schedule_align());
      resize_observer?.observe(editor_dom);

      function is_feature_enabled(): boolean {
        return editor_dom.closest(".show-block-drag-handle") !== null;
      }

      function enter_focus_mode() {
        if (focus_mode_active) return;
        focus_mode_active = true;
        focus_exit_movement = 0;
        editor_dom.classList.add("typing-focus");
      }

      function exit_focus_mode() {
        if (!focus_mode_active) return;
        focus_mode_active = false;
        keystroke_count = 0;
        editor_dom.classList.remove("typing-focus");
      }

      function on_keydown(event: KeyboardEvent) {
        if (
          event.target instanceof Element &&
          event.target.closest('[contenteditable="false"]')
        )
          return;
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
        if (focus_mode_active) {
          focus_exit_movement +=
            Math.abs(event.movementX) + Math.abs(event.movementY);
          if (focus_exit_movement < FOCUS_EXIT_MOVE_THRESHOLD_PX) return;
        }
        exit_focus_mode();
        if (is_dragging) return;
        if (!is_feature_enabled()) return;

        last_mouse = { x: event.clientX, y: event.clientY };
        if (mouse_frame !== null) return;
        mouse_frame = requestAnimationFrame(() => {
          mouse_frame = null;
          if (!last_mouse || is_dragging) return;
          const info = editor_view.posAtCoords({
            left: last_mouse.x,
            top: last_mouse.y,
          });
          if (!info) return;
          const block = resolve_top_level_block(editor_view, info.pos);
          if (block) set_near(block.pos);
        });
      }

      function on_mouseleave() {
        if (is_dragging) return;
        set_near(null);
      }

      editor_dom.addEventListener("mousemove", on_mousemove);
      editor_dom.addEventListener("mouseleave", on_mouseleave);
      editor_dom.addEventListener("keydown", on_keydown);
      editor_dom.addEventListener("scroll", schedule_align, { passive: true });

      schedule_align();

      return {
        update(view, prev_state) {
          if (view.state.doc !== prev_state.doc) schedule_align();
        },
        destroy() {
          if (align_frame !== null) cancelAnimationFrame(align_frame);
          if (mouse_frame !== null) cancelAnimationFrame(mouse_frame);
          resize_observer?.disconnect();
          exit_focus_mode();
          hide_drop_indicator();
          drop_indicator?.remove();
          drop_indicator = null;
          remove_drag_image_wrapper();
          document.body.classList.remove("block-handle-dragging");
          insert_menu?.destroy();
          insert_menu = null;
          editor_dom.removeEventListener("mousemove", on_mousemove);
          editor_dom.removeEventListener("mouseleave", on_mouseleave);
          editor_dom.removeEventListener("keydown", on_keydown);
          editor_dom.removeEventListener("scroll", schedule_align);
        },
      };
    },
  });
}
