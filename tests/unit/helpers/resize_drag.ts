type Axis = "x" | "y";

export function stub_rect(
  el: HTMLElement,
  size: { width: number; height: number },
): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...size,
      top: 0,
      left: 0,
      right: size.width,
      bottom: size.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

export function drag_handle(
  handle: Element,
  axis: Axis,
  from: number,
  to: number,
): void {
  const key = axis === "x" ? "clientX" : "clientY";
  handle.dispatchEvent(
    new PointerEvent("pointerdown", {
      [key]: from,
      pointerId: 1,
      bubbles: true,
    }),
  );
  handle.dispatchEvent(
    new PointerEvent("pointermove", { [key]: to, pointerId: 1, bubbles: true }),
  );
  handle.dispatchEvent(
    new PointerEvent("pointerup", { [key]: to, pointerId: 1, bubbles: true }),
  );
}

export function double_click(handle: Element): void {
  handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
}
