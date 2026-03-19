/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  create_cursor_anchor,
  position_suggest_dropdown,
  scroll_selected_into_view,
  attach_outside_dismiss,
  mount_dropdown,
  destroy_dropdown,
} from "$lib/features/editor/adapters/suggest_dropdown_utils";

vi.mock("@floating-ui/dom", () => ({
  computePosition: vi.fn(() =>
    Promise.resolve({ x: 100, y: 200, placement: "bottom-start" }),
  ),
  flip: vi.fn(() => "flip"),
  shift: vi.fn(() => "shift"),
  offset: vi.fn(() => "offset"),
}));

function make_mock_view(coords = { left: 10, top: 20, bottom: 40 }) {
  return {
    state: {
      selection: {
        $from: { pos: 5 },
      },
    },
    coordsAtPos: vi.fn(() => coords),
  } as unknown as import("prosemirror-view").EditorView;
}

describe("create_cursor_anchor", () => {
  it("returns an Element-like object with getBoundingClientRect", () => {
    const view = make_mock_view();
    const anchor = create_cursor_anchor(view);
    const rect = anchor.getBoundingClientRect();
    expect(rect.left).toBe(10);
    expect(rect.top).toBe(20);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(20);
  });
});

describe("position_suggest_dropdown", () => {
  it("sets left and top styles from computePosition result", async () => {
    const el = document.createElement("div");
    const anchor = { getBoundingClientRect: () => new DOMRect() } as Element;
    position_suggest_dropdown(el, anchor);
    await vi.dynamicImportSettled();
    expect(el.style.left).toBe("100px");
    expect(el.style.top).toBe("200px");
  });
});

describe("scroll_selected_into_view", () => {
  function make_container(
    scroll_top: number,
    client_height: number,
    children: Array<{ offset_top: number; offset_height: number }>,
  ) {
    const container = document.createElement("div");
    Object.defineProperty(container, "scrollTop", {
      value: scroll_top,
      writable: true,
    });
    Object.defineProperty(container, "clientHeight", { value: client_height });
    for (const c of children) {
      const child = document.createElement("div");
      Object.defineProperty(child, "offsetTop", { value: c.offset_top });
      Object.defineProperty(child, "offsetHeight", { value: c.offset_height });
      container.appendChild(child);
    }
    return container;
  }

  it("scrolls up when row is above viewport", () => {
    const container = make_container(100, 50, [
      { offset_top: 80, offset_height: 20 },
    ]);
    scroll_selected_into_view(container, 0);
    expect(container.scrollTop).toBe(80);
  });

  it("scrolls down when row is below viewport", () => {
    const container = make_container(0, 50, [
      { offset_top: 60, offset_height: 20 },
    ]);
    scroll_selected_into_view(container, 0);
    expect(container.scrollTop).toBe(30);
  });

  it("does nothing when row is in viewport", () => {
    const container = make_container(0, 100, [
      { offset_top: 10, offset_height: 20 },
    ]);
    scroll_selected_into_view(container, 0);
    expect(container.scrollTop).toBe(0);
  });

  it("does nothing for invalid index", () => {
    const container = make_container(0, 100, []);
    scroll_selected_into_view(container, 5);
    expect(container.scrollTop).toBe(0);
  });
});

describe("attach_outside_dismiss", () => {
  let floating: HTMLElement;
  let editor_dom: HTMLElement;
  let on_dismiss: ReturnType<typeof vi.fn>;
  let detach: () => void;

  beforeEach(() => {
    floating = document.createElement("div");
    editor_dom = document.createElement("div");
    document.body.appendChild(floating);
    document.body.appendChild(editor_dom);
    on_dismiss = vi.fn();
    detach = attach_outside_dismiss(floating, editor_dom, on_dismiss);
  });

  afterEach(() => {
    detach();
    floating.remove();
    editor_dom.remove();
  });

  it("calls on_dismiss for clicks outside both elements", () => {
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(on_dismiss).toHaveBeenCalledOnce();
    outside.remove();
  });

  it("does not dismiss for clicks inside floating", () => {
    const child = document.createElement("span");
    floating.appendChild(child);
    child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(on_dismiss).not.toHaveBeenCalled();
  });

  it("does not dismiss for clicks inside editor_dom", () => {
    const child = document.createElement("span");
    editor_dom.appendChild(child);
    child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(on_dismiss).not.toHaveBeenCalled();
  });

  it("calls on_dismiss for focusin outside both elements", () => {
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(on_dismiss).toHaveBeenCalledOnce();
    outside.remove();
  });

  it("stops listening after detach", () => {
    detach();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(on_dismiss).not.toHaveBeenCalled();
    outside.remove();
  });
});

describe("mount_dropdown", () => {
  it("sets styles and appends to body", () => {
    const el = document.createElement("div");
    mount_dropdown(el);
    expect(el.style.display).toBe("none");
    expect(el.style.position).toBe("fixed");
    expect(el.style.zIndex).toBe("9999");
    expect(document.body.contains(el)).toBe(true);
    el.remove();
  });
});

describe("destroy_dropdown", () => {
  it("removes element and calls detach", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const detach = vi.fn();
    destroy_dropdown(el, detach);
    expect(document.body.contains(el)).toBe(false);
    expect(detach).toHaveBeenCalledOnce();
  });

  it("handles nulls gracefully", () => {
    expect(() => destroy_dropdown(null, null)).not.toThrow();
  });
});
