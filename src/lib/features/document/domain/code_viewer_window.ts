export type CodeViewerWindow = {
  start_line: number;
  end_line: number;
  visible_start_line: number;
  visible_end_line: number;
  top_offset_px: number;
  total_height_px: number;
};

const DEFAULT_LINE_HEIGHT_PX = 21;
const DEFAULT_OVERSCAN_LINES = 40;
const DEFAULT_MIN_WINDOW_LINES = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolve_code_viewer_window(input: {
  line_count: number;
  scroll_top_px: number;
  viewport_height_px: number;
  line_height_px?: number;
  overscan_lines?: number;
  min_window_lines?: number;
}): CodeViewerWindow {
  const line_height_px = input.line_height_px ?? DEFAULT_LINE_HEIGHT_PX;
  const overscan_lines = input.overscan_lines ?? DEFAULT_OVERSCAN_LINES;
  const min_window_lines = input.min_window_lines ?? DEFAULT_MIN_WINDOW_LINES;

  if (input.line_count <= 0) {
    return {
      start_line: 0,
      end_line: 0,
      visible_start_line: 0,
      visible_end_line: 0,
      top_offset_px: 0,
      total_height_px: 0,
    };
  }

  const total_height_px = input.line_count * line_height_px;
  const visible_start_line = clamp(
    Math.floor(input.scroll_top_px / line_height_px),
    0,
    input.line_count - 1,
  );
  const visible_end_line = clamp(
    Math.ceil(
      (input.scroll_top_px +
        Math.max(input.viewport_height_px, line_height_px)) /
        line_height_px,
    ),
    visible_start_line + 1,
    input.line_count,
  );

  let start_line = Math.max(0, visible_start_line - overscan_lines);
  let end_line = Math.min(
    input.line_count,
    Math.max(visible_end_line + overscan_lines, start_line + min_window_lines),
  );

  if (end_line - start_line < min_window_lines) {
    start_line = Math.max(0, end_line - min_window_lines);
    end_line = Math.min(input.line_count, start_line + min_window_lines);
  }

  return {
    start_line,
    end_line,
    visible_start_line,
    visible_end_line,
    top_offset_px: start_line * line_height_px,
    total_height_px,
  };
}
