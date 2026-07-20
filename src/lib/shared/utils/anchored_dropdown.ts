const DEFAULT_DROPDOWN_MARGIN = 8;
const DEFAULT_DROPDOWN_OFFSET = 4;

export type AnchoredDropdownRect = Pick<
  DOMRect,
  "left" | "right" | "top" | "bottom"
>;

export interface AnchoredDropdownPosition {
  left: number;
  top: number;
  maxHeight?: number;
}

export interface AnchoredDropdownViewport {
  width: number;
  height: number;
  zoom?: number;
}

export interface AnchoredDropdownOptions {
  width: number;
  maxHeight?: number;
  minHeight?: number;
  offset?: number;
  viewportPadding?: number;
}

export function get_anchored_dropdown_left(
  anchor_right: number,
  dropdown_width: number,
  viewport_width: number,
  margin = DEFAULT_DROPDOWN_MARGIN,
): number {
  const right_aligned_left = anchor_right - dropdown_width;
  const min_left = margin;
  const max_left = viewport_width - dropdown_width - margin;
  if (max_left < min_left) return min_left;
  return Math.min(Math.max(right_aligned_left, min_left), max_left);
}

function zoom_adjusted_viewport({
  height,
  width,
  zoom = 1,
}: AnchoredDropdownViewport): AnchoredDropdownViewport {
  return { height: height / zoom, width: width / zoom };
}

function zoom_adjusted_anchor_rect(
  rect: AnchoredDropdownRect,
  zoom = 1,
): AnchoredDropdownRect {
  if (zoom === 1) return rect;
  return {
    left: rect.left / zoom,
    right: rect.right / zoom,
    top: rect.top / zoom,
    bottom: rect.bottom / zoom,
  };
}

export function resolve_anchored_dropdown_position(
  anchor_rect: AnchoredDropdownRect,
  {
    width,
    maxHeight,
    minHeight,
    offset = DEFAULT_DROPDOWN_OFFSET,
    viewportPadding = DEFAULT_DROPDOWN_MARGIN,
  }: AnchoredDropdownOptions,
  viewport: AnchoredDropdownViewport,
): AnchoredDropdownPosition {
  const zoom = viewport.zoom ?? 1;
  const adjusted_rect = zoom_adjusted_anchor_rect(anchor_rect, zoom);
  const adjusted_viewport = zoom_adjusted_viewport(viewport);
  const left = get_anchored_dropdown_left(
    adjusted_rect.right,
    width,
    adjusted_viewport.width,
    viewportPadding,
  );
  const below_top = adjusted_rect.bottom + offset;

  if (maxHeight === undefined) {
    const max_top = Math.max(
      viewportPadding,
      adjusted_viewport.height - viewportPadding,
    );
    return {
      left,
      top: Math.min(Math.max(viewportPadding, below_top), max_top),
    };
  }

  const available_below =
    adjusted_viewport.height - below_top - viewportPadding;
  const available_above = adjusted_rect.top - viewportPadding - offset;
  const open_above =
    minHeight !== undefined &&
    available_below < minHeight &&
    available_above > available_below;
  const available_height = open_above ? available_above : available_below;
  const viewport_bounded_min_height = Math.min(
    minHeight ?? 0,
    Math.max(0, adjusted_viewport.height - viewportPadding * 2),
  );
  const resolved_max_height = Math.max(
    viewport_bounded_min_height,
    Math.min(maxHeight, available_height),
  );
  const top = open_above
    ? Math.max(
        viewportPadding,
        adjusted_rect.top - offset - resolved_max_height,
      )
    : Math.min(
        below_top,
        adjusted_viewport.height - viewportPadding - resolved_max_height,
      );

  return { left, top, maxHeight: resolved_max_height };
}
