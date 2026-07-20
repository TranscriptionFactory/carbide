export type RectLike = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

export type Point = { x: number; y: number };

const HOVER_BRIDGE_PADDING_X = 8;
const HOVER_BRIDGE_PADDING_Y = 8;

export function is_visible_rect(rect: RectLike): boolean {
  return rect.right > rect.left && rect.bottom > rect.top;
}

export function is_within_formatting_toolbar_hover_bridge(
  point: Point,
  anchor_rect: RectLike,
  toolbar_rect: RectLike,
): boolean {
  if (!is_visible_rect(anchor_rect) || !is_visible_rect(toolbar_rect)) {
    return false;
  }

  const left =
    Math.min(anchor_rect.left, toolbar_rect.left) - HOVER_BRIDGE_PADDING_X;
  const right =
    Math.max(anchor_rect.right, toolbar_rect.right) + HOVER_BRIDGE_PADDING_X;
  const top =
    Math.min(anchor_rect.top, toolbar_rect.top) - HOVER_BRIDGE_PADDING_Y;
  const bottom =
    Math.max(anchor_rect.bottom, toolbar_rect.bottom) + HOVER_BRIDGE_PADDING_Y;

  return (
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
  );
}
