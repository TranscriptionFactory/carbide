import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import type { Placement } from "@floating-ui/dom";

export const Z_TABLE_TOOLBAR = 50;
export const Z_IMAGE_TOOLBAR = 55;
export const Z_CONTEXT_MENU = 60;

export async function compute_floating_position(
  anchor: HTMLElement,
  floating: HTMLElement,
  placement: Placement = "top",
): Promise<{ x: number; y: number }> {
  const { x, y } = await computePosition(anchor, floating, {
    placement,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });
  return { x, y };
}

export function create_backdrop(on_dismiss: () => void): HTMLElement {
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;inset:0;z-index:0;pointer-events:auto;";
  backdrop.addEventListener("mousedown", (e) => {
    e.preventDefault();
    on_dismiss();
  });
  return backdrop;
}
