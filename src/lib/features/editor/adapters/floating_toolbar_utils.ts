import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import type { Placement } from "@floating-ui/dom";

export const Z_TABLE_CONTROLS = 45;
export const Z_TABLE_TOOLBAR = 50;
export const Z_IMAGE_TOOLBAR = 55;
export const Z_CONTEXT_MENU = 60;
export const Z_FORMATTING_TOOLBAR = 65;

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
