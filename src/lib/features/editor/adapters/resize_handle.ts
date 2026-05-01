type ResizeHandle = {
  el: HTMLElement;
  cancel: () => void;
};

const MIN_IMAGE_WIDTH = 50;

export function create_width_resize_handle(
  target: HTMLElement,
  on_commit: (width: string | null) => void,
): ResizeHandle {
  const handle = document.createElement("div");
  handle.className = "image-resize-handle";
  handle.contentEditable = "false";

  let start_x = 0;
  let start_width = 0;
  let current_width = 0;
  let active_pointer_id: number | null = null;

  function finish_drag() {
    if (
      active_pointer_id !== null &&
      typeof handle.releasePointerCapture === "function" &&
      handle.hasPointerCapture(active_pointer_id)
    ) {
      handle.releasePointerCapture(active_pointer_id);
    }
    active_pointer_id = null;
    handle.removeEventListener("pointermove", on_pointer_move);
    handle.removeEventListener("pointerup", on_pointer_up);
    handle.removeEventListener("pointercancel", on_pointer_cancel);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }

  function on_pointer_move(e: PointerEvent) {
    const delta = e.clientX - start_x;
    current_width = Math.max(MIN_IMAGE_WIDTH, start_width + delta);
    target.style.width = `${String(current_width)}px`;
  }

  function on_pointer_up() {
    finish_drag();
    on_commit(`${String(current_width)}px`);
  }

  function on_pointer_cancel() {
    finish_drag();
    on_commit(`${String(current_width)}px`);
  }

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    start_x = e.clientX;
    start_width = target.getBoundingClientRect().width;
    current_width = start_width;
    active_pointer_id = e.pointerId;
    if (typeof handle.setPointerCapture === "function") {
      handle.setPointerCapture(e.pointerId);
    }
    handle.addEventListener("pointermove", on_pointer_move);
    handle.addEventListener("pointerup", on_pointer_up);
    handle.addEventListener("pointercancel", on_pointer_cancel);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  handle.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    target.style.width = "";
    on_commit(null);
  });

  return {
    el: handle,
    cancel() {
      if (active_pointer_id !== null) {
        finish_drag();
        on_commit(`${String(current_width)}px`);
      }
    },
  };
}
