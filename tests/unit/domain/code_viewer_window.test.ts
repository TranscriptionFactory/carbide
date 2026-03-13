import { describe, expect, it } from "vitest";
import { resolve_code_viewer_window } from "$lib/features/document/domain/code_viewer_window";

describe("resolve_code_viewer_window", () => {
  it("starts at the beginning of the file when the viewport is near the top", () => {
    const window_range = resolve_code_viewer_window({
      line_count: 1000,
      scroll_top_px: 0,
      viewport_height_px: 420,
      line_height_px: 21,
      overscan_lines: 20,
      min_window_lines: 120,
    });

    expect(window_range).toEqual({
      start_line: 0,
      end_line: 120,
      visible_start_line: 0,
      visible_end_line: 20,
      top_offset_px: 0,
      total_height_px: 21000,
    });
  });

  it("adds overscan around a mid file viewport", () => {
    const window_range = resolve_code_viewer_window({
      line_count: 1000,
      scroll_top_px: 2100,
      viewport_height_px: 420,
      line_height_px: 21,
      overscan_lines: 10,
      min_window_lines: 80,
    });

    expect(window_range).toEqual({
      start_line: 90,
      end_line: 170,
      visible_start_line: 100,
      visible_end_line: 120,
      top_offset_px: 1890,
      total_height_px: 21000,
    });
  });

  it("clamps the requested window near the end of the file", () => {
    const window_range = resolve_code_viewer_window({
      line_count: 100,
      scroll_top_px: 1890,
      viewport_height_px: 420,
      line_height_px: 21,
      overscan_lines: 10,
      min_window_lines: 40,
    });

    expect(window_range).toEqual({
      start_line: 60,
      end_line: 100,
      visible_start_line: 90,
      visible_end_line: 100,
      top_offset_px: 1260,
      total_height_px: 2100,
    });
  });

  it("returns an empty window for an empty file", () => {
    expect(
      resolve_code_viewer_window({
        line_count: 0,
        scroll_top_px: 0,
        viewport_height_px: 420,
      }),
    ).toEqual({
      start_line: 0,
      end_line: 0,
      visible_start_line: 0,
      visible_end_line: 0,
      top_offset_px: 0,
      total_height_px: 0,
    });
  });
});
