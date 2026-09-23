import { describe, expect, it } from "vitest";
import {
  append_dashed_segments,
  group_by_kind_alpha,
  stroke_dashed_lines,
  stroke_lines,
  type StrokeStyle,
} from "$lib/features/graph/domain/edge_strokes";

function create_graphics_stub() {
  const calls = { move: 0, line: 0, strokes: [] as StrokeStyle[] };
  return {
    calls,
    moveTo() {
      calls.move++;
    },
    lineTo() {
      calls.line++;
    },
    stroke(style: StrokeStyle) {
      calls.strokes.push(style);
    },
  };
}

const STYLE: StrokeStyle = { width: 1.5, color: 0xff0000, alpha: 0.7 };
const PATTERN = { dash: 5, gap: 5 };

describe("append_dashed_segments", () => {
  it("emits one sub-path per dash without stroking", () => {
    const gfx = create_graphics_stub();

    append_dashed_segments(gfx, { x1: 0, y1: 0, x2: 30, y2: 0 }, PATTERN);

    expect(gfx.calls.move).toBe(3);
    expect(gfx.calls.line).toBe(3);
    expect(gfx.calls.strokes).toEqual([]);
  });

  it("emits nothing for a zero-length segment", () => {
    const gfx = create_graphics_stub();

    append_dashed_segments(gfx, { x1: 4, y1: 4, x2: 4, y2: 4 }, PATTERN);

    expect(gfx.calls.move).toBe(0);
  });
});

describe("stroke_dashed_lines", () => {
  it("strokes a whole style group once, however many dashes it holds", () => {
    const gfx = create_graphics_stub();
    const segments = [
      { x1: 0, y1: 0, x2: 100, y2: 0 },
      { x1: 0, y1: 0, x2: 0, y2: 100 },
      { x1: 0, y1: 0, x2: 60, y2: 80 },
    ];

    stroke_dashed_lines(gfx, segments, PATTERN, STYLE);

    expect(gfx.calls.move).toBe(30);
    expect(gfx.calls.strokes).toEqual([STYLE]);
  });

  it("does not stroke an empty group", () => {
    const gfx = create_graphics_stub();

    stroke_dashed_lines(gfx, [], PATTERN, STYLE);

    expect(gfx.calls.strokes).toEqual([]);
  });
});

describe("stroke_lines", () => {
  it("strokes a group of solid lines once", () => {
    const gfx = create_graphics_stub();

    stroke_lines(
      gfx,
      [
        { x1: 0, y1: 0, x2: 1, y2: 1 },
        { x1: 2, y1: 2, x2: 3, y2: 3 },
      ],
      STYLE,
    );

    expect(gfx.calls.move).toBe(2);
    expect(gfx.calls.strokes).toEqual([STYLE]);
  });
});

describe("group_by_kind_alpha", () => {
  it("buckets edges so each distinct alpha is one stroke group", () => {
    const gfx = create_graphics_stub();
    const edges = [1, 0.4, 0.2, 1, 0.4, 1].map((kind_alpha, i) => ({
      x1: i,
      y1: 0,
      x2: i,
      y2: 1,
      kind_alpha,
    }));

    const groups = group_by_kind_alpha(edges);
    for (const [kind_alpha, group] of groups) {
      stroke_lines(gfx, group, { ...STYLE, alpha: kind_alpha });
    }

    expect([...groups.keys()]).toEqual([1, 0.4, 0.2]);
    expect(groups.get(1)).toHaveLength(3);
    expect(gfx.calls.strokes.map((s) => s.alpha)).toEqual([1, 0.4, 0.2]);
  });
});
