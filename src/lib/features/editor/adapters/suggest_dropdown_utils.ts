import type { EditorView } from "prosemirror-view";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";

export function create_cursor_anchor(view: EditorView): Element {
  const { $from } = view.state.selection;
  const coords = view.coordsAtPos($from.pos);
  return {
    getBoundingClientRect: () =>
      new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top),
  } as Element;
}

export function position_suggest_dropdown(
  floating: HTMLElement,
  anchor: Element,
): void {
  void computePosition(anchor, floating, {
    placement: "bottom-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    floating.style.left = `${String(x)}px`;
    floating.style.top = `${String(y)}px`;
  });
}

export function scroll_selected_into_view(
  container: HTMLElement,
  index: number,
): void {
  const row = container.children.item(index);
  if (!(row instanceof HTMLElement)) return;
  const row_top = row.offsetTop;
  const row_bottom = row_top + row.offsetHeight;
  const view_top = container.scrollTop;
  const view_bottom = view_top + container.clientHeight;
  if (row_top < view_top) {
    container.scrollTop = row_top;
    return;
  }
  if (row_bottom > view_bottom) {
    container.scrollTop = row_bottom - container.clientHeight;
  }
}

export function attach_outside_dismiss(
  floating: HTMLElement,
  editor_dom: Element,
  on_dismiss: () => void,
): () => void {
  function should_dismiss(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    if (floating.contains(target)) return false;
    if (editor_dom.contains(target)) return false;
    return true;
  }

  const on_mousedown = (e: MouseEvent) => {
    if (should_dismiss(e.target)) on_dismiss();
  };
  const on_focusin = (e: FocusEvent) => {
    if (should_dismiss(e.target)) on_dismiss();
  };

  document.addEventListener("mousedown", on_mousedown, true);
  document.addEventListener("focusin", on_focusin, true);

  return () => {
    document.removeEventListener("mousedown", on_mousedown, true);
    document.removeEventListener("focusin", on_focusin, true);
  };
}

export function mount_dropdown(el: HTMLElement): void {
  el.style.display = "none";
  el.style.position = "fixed";
  el.style.zIndex = "9999";
  document.body.appendChild(el);
}

export function destroy_dropdown(
  el: HTMLElement | null,
  detach: (() => void) | null,
): void {
  el?.remove();
  detach?.();
}
