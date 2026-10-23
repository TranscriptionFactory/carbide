/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  create_resize_handle,
  type ResizeAxis,
} from "$lib/features/editor/adapters/resize_handle";
import { drag_handle, stub_rect } from "../helpers/resize_drag";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(axis: ResizeAxis, min_size = 50) {
  const target = document.createElement("div");
  const parent = document.createElement("div");
  parent.appendChild(target);
  document.body.appendChild(parent);
  stub_rect(target, { width: 200, height: 100 });
  const on_commit = vi.fn();
  const handle = create_resize_handle(target, axis, on_commit, {
    class_name: "test-handle",
    min_size,
  });
  parent.appendChild(handle.el);
  return { target, parent, handle, on_commit };
}

describe("create_resize_handle", () => {
  it("resizes width along the x axis and commits the rounded size", () => {
    const { target, handle, on_commit } = mount("x");
    drag_handle(handle.el, "x", 100, 130.4);
    expect(target.style.width).toBe("230px");
    expect(on_commit).toHaveBeenCalledWith(230);
  });

  it("resizes height along the y axis", () => {
    const { target, handle, on_commit } = mount("y");
    drag_handle(handle.el, "y", 10, 70);
    expect(target.style.height).toBe("160px");
    expect(on_commit).toHaveBeenCalledWith(160);
  });

  it("clamps to the minimum size", () => {
    const { target, handle, on_commit } = mount("y", 80);
    drag_handle(handle.el, "y", 100, 0);
    expect(target.style.height).toBe("80px");
    expect(on_commit).toHaveBeenCalledWith(80);
  });

  it("resets the size and commits null on double-click", () => {
    const { target, handle, on_commit } = mount("y");
    target.style.height = "300px";
    handle.el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(target.style.height).toBe("");
    expect(on_commit).toHaveBeenCalledWith(null);
  });

  it("routes sizes through a custom apply and resolves a dynamic target", () => {
    const first = document.createElement("div");
    stub_rect(first, { width: 0, height: 100 });
    const apply = vi.fn();
    const on_commit = vi.fn();
    const handle = create_resize_handle(() => first, "y", on_commit, {
      class_name: "test-handle",
      min_size: 10,
      apply,
    });
    drag_handle(handle.el, "y", 0, 25);
    expect(apply).toHaveBeenLastCalledWith(125);
    expect(first.style.height).toBe("");
    expect(on_commit).toHaveBeenCalledWith(125);
  });

  it("keeps handle clicks from reaching the embed underneath", () => {
    const { parent, handle } = mount("y");
    const on_parent_click = vi.fn();
    parent.addEventListener("click", on_parent_click);
    handle.el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(on_parent_click).not.toHaveBeenCalled();
  });

  it("commits and restores body styles when cancelled mid-drag", () => {
    const { handle, on_commit } = mount("y");
    handle.el.dispatchEvent(
      new PointerEvent("pointerdown", { clientY: 0, pointerId: 1 }),
    );
    handle.el.dispatchEvent(
      new PointerEvent("pointermove", { clientY: 40, pointerId: 1 }),
    );
    expect(document.body.style.userSelect).toBe("none");
    handle.cancel();
    expect(document.body.style.userSelect).toBe("");
    expect(on_commit).toHaveBeenCalledWith(140);
  });
});
