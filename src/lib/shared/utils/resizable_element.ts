export type ResizableOptions = {
  min_width?: number;
  min_height?: number;
  max_width?: number;
  max_height?: number;
  edges?: ("n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw")[];
};

const DEFAULT_OPTIONS: Required<ResizableOptions> = {
  min_width: 400,
  min_height: 300,
  max_width: Infinity,
  max_height: Infinity,
  edges: ["n", "s", "e", "w", "ne", "nw", "se", "sw"],
};

const EDGE_CURSORS: Record<string, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
};

const HANDLE_SIZE = 6;
const HANDLE_SIZE_PX = String(HANDLE_SIZE) + "px";
const HANDLE_SIZE_DOUBLE_PX = String(HANDLE_SIZE * 2) + "px";

export function resizable_element(
  node: HTMLElement,
  options: ResizableOptions = {},
): { update: (opts: ResizableOptions) => void; destroy: () => void } {
  let opts = { ...DEFAULT_OPTIONS, ...options };
  let active_edge: string | null = null;
  let start_x = 0;
  let start_y = 0;
  let start_rect = { left: 0, top: 0, width: 0, height: 0 };

  const handles: HTMLElement[] = [];

  function create_handles() {
    for (const edge of opts.edges) {
      const handle = document.createElement("div");
      handle.dataset.resizeEdge = edge;
      handle.style.position = "absolute";
      handle.style.zIndex = "10";
      handle.style.cursor = EDGE_CURSORS[edge] ?? "default";

      if (edge === "n") {
        Object.assign(handle.style, {
          top: "0",
          left: HANDLE_SIZE_PX,
          right: HANDLE_SIZE_PX,
          height: HANDLE_SIZE_PX,
        });
      } else if (edge === "s") {
        Object.assign(handle.style, {
          bottom: "0",
          left: HANDLE_SIZE_PX,
          right: HANDLE_SIZE_PX,
          height: HANDLE_SIZE_PX,
        });
      } else if (edge === "e") {
        Object.assign(handle.style, {
          right: "0",
          top: HANDLE_SIZE_PX,
          bottom: HANDLE_SIZE_PX,
          width: HANDLE_SIZE_PX,
        });
      } else if (edge === "w") {
        Object.assign(handle.style, {
          left: "0",
          top: HANDLE_SIZE_PX,
          bottom: HANDLE_SIZE_PX,
          width: HANDLE_SIZE_PX,
        });
      } else if (edge === "ne") {
        Object.assign(handle.style, {
          top: "0",
          right: "0",
          width: HANDLE_SIZE_DOUBLE_PX,
          height: HANDLE_SIZE_DOUBLE_PX,
        });
      } else if (edge === "nw") {
        Object.assign(handle.style, {
          top: "0",
          left: "0",
          width: HANDLE_SIZE_DOUBLE_PX,
          height: HANDLE_SIZE_DOUBLE_PX,
        });
      } else if (edge === "se") {
        Object.assign(handle.style, {
          bottom: "0",
          right: "0",
          width: HANDLE_SIZE_DOUBLE_PX,
          height: HANDLE_SIZE_DOUBLE_PX,
        });
      } else if (edge === "sw") {
        Object.assign(handle.style, {
          bottom: "0",
          left: "0",
          width: HANDLE_SIZE_DOUBLE_PX,
          height: HANDLE_SIZE_DOUBLE_PX,
        });
      }

      handle.addEventListener("pointerdown", on_pointer_down);
      node.appendChild(handle);
      handles.push(handle);
    }
  }

  function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  function on_pointer_down(e: PointerEvent) {
    if (e.button !== 0) return;
    const edge = (e.currentTarget as HTMLElement).dataset.resizeEdge;
    if (!edge) return;

    active_edge = edge;
    start_x = e.clientX;
    start_y = e.clientY;

    const rect = node.getBoundingClientRect();
    start_rect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();

    document.addEventListener("pointermove", on_pointer_move);
    document.addEventListener("pointerup", on_pointer_up);
  }

  function on_pointer_move(e: PointerEvent) {
    if (!active_edge) return;

    const dx = e.clientX - start_x;
    const dy = e.clientY - start_y;

    let { left, top, width, height } = start_rect;

    if (active_edge.includes("e")) {
      width = clamp(start_rect.width + dx, opts.min_width, opts.max_width);
    }
    if (active_edge.includes("w")) {
      const new_width = clamp(
        start_rect.width - dx,
        opts.min_width,
        opts.max_width,
      );
      left = start_rect.left + (start_rect.width - new_width);
      width = new_width;
    }
    if (active_edge.includes("s")) {
      height = clamp(start_rect.height + dy, opts.min_height, opts.max_height);
    }
    if (active_edge.includes("n")) {
      const new_height = clamp(
        start_rect.height - dy,
        opts.min_height,
        opts.max_height,
      );
      top = start_rect.top + (start_rect.height - new_height);
      height = new_height;
    }

    node.style.transition = "none";
    node.style.transform = "none";
    node.style.translate = "none";
    node.style.left = String(left) + "px";
    node.style.top = String(top) + "px";
    node.style.width = String(width) + "px";
    node.style.height = String(height) + "px";
    node.style.maxWidth = "none";
    node.style.maxHeight = "none";
  }

  function on_pointer_up() {
    active_edge = null;
    document.removeEventListener("pointermove", on_pointer_move);
    document.removeEventListener("pointerup", on_pointer_up);
  }

  function remove_handles() {
    for (const h of handles) {
      h.removeEventListener("pointerdown", on_pointer_down);
      h.remove();
    }
    handles.length = 0;
  }

  create_handles();

  return {
    update(new_options: ResizableOptions) {
      opts = { ...DEFAULT_OPTIONS, ...new_options };
      remove_handles();
      create_handles();
    },
    destroy() {
      remove_handles();
      document.removeEventListener("pointermove", on_pointer_move);
      document.removeEventListener("pointerup", on_pointer_up);
    },
  };
}
