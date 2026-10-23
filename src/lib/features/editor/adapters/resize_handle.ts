export type ResizeAxis = "x" | "y";

export type ResizeHandle = {
  el: HTMLElement;
  cancel: () => void;
};

export type ResizeHandleOptions = {
  class_name: string;
  min_size: number;
  apply?: (size: number | null) => void;
  on_start?: () => void;
};

type ResizeTarget = HTMLElement | (() => HTMLElement);

const AXIS = {
  x: { client: "clientX", dimension: "width", cursor: "col-resize" },
  y: { client: "clientY", dimension: "height", cursor: "row-resize" },
} as const;

function resolve_target(target: ResizeTarget): HTMLElement {
  return typeof target === "function" ? target() : target;
}

export function create_resize_handle(
  target: ResizeTarget,
  axis: ResizeAxis,
  on_commit: (size: number | null) => void,
  options: ResizeHandleOptions,
): ResizeHandle {
  const { client, dimension, cursor } = AXIS[axis];
  const apply =
    options.apply ??
    ((size: number | null) => {
      const el = resolve_target(target);
      if (size === null) el.style.removeProperty(dimension);
      else el.style[dimension] = `${String(size)}px`;
    });

  const handle = document.createElement("div");
  handle.className = options.class_name;
  handle.contentEditable = "false";

  let start_pos = 0;
  let start_size = 0;
  let current_size = 0;
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
    handle.removeEventListener("pointerup", on_pointer_end);
    handle.removeEventListener("pointercancel", on_pointer_end);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }

  function on_pointer_move(e: PointerEvent) {
    const delta = e[client] - start_pos;
    current_size = Math.max(options.min_size, Math.round(start_size + delta));
    apply(current_size);
  }

  function on_pointer_end() {
    finish_drag();
    on_commit(current_size);
  }

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    start_pos = e[client];
    start_size = resolve_target(target).getBoundingClientRect()[dimension];
    current_size = Math.max(options.min_size, Math.round(start_size));
    active_pointer_id = e.pointerId;
    if (typeof handle.setPointerCapture === "function") {
      handle.setPointerCapture(e.pointerId);
    }
    handle.addEventListener("pointermove", on_pointer_move);
    handle.addEventListener("pointerup", on_pointer_end);
    handle.addEventListener("pointercancel", on_pointer_end);
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
    options.on_start?.();
  });

  handle.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  handle.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    apply(null);
    on_commit(null);
  });

  return {
    el: handle,
    cancel() {
      if (active_pointer_id !== null) on_pointer_end();
    },
  };
}
