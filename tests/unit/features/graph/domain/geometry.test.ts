import { describe, it, expect } from "vitest";
import {
  convex_hull,
  offset_polygon,
  type Point,
} from "$lib/features/graph/domain/geometry";

describe("convex_hull", () => {
  it("returns empty for empty input", () => {
    expect(convex_hull([])).toEqual([]);
  });

  it("returns single point for single input", () => {
    expect(convex_hull([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });

  it("returns both points for two inputs", () => {
    const result = convex_hull([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(result).toHaveLength(2);
  });

  it("computes hull of a square", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0.5, y: 0.5 },
    ];
    const hull = convex_hull(points);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 0.5, y: 0.5 });
  });

  it("computes hull of collinear points", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const hull = convex_hull(points);
    expect(hull).toHaveLength(2);
    expect(hull).toContainEqual({ x: 0, y: 0 });
    expect(hull).toContainEqual({ x: 2, y: 0 });
  });

  it("computes hull of a triangle with interior point", () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 4 },
      { x: 2, y: 1 },
    ];
    const hull = convex_hull(points);
    expect(hull).toHaveLength(3);
    expect(hull).not.toContainEqual({ x: 2, y: 1 });
  });
});

describe("offset_polygon", () => {
  it("returns copy for fewer than 3 points", () => {
    const input: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const result = offset_polygon(input, 10);
    expect(result).toEqual(input);
  });

  it("preserves vertex count", () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const result = offset_polygon(square, 5);
    expect(result).toHaveLength(4);
  });

  it("moves vertices away from their original positions", () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const result = offset_polygon(square, 5);
    for (let i = 0; i < 4; i++) {
      const orig = square[i]!;
      const moved = result[i]!;
      const dist = Math.sqrt((moved.x - orig.x) ** 2 + (moved.y - orig.y) ** 2);
      expect(dist).toBeGreaterThan(0);
    }
  });

  it("positive and negative padding move in opposite directions", () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const pos = offset_polygon(square, 5);
    const neg = offset_polygon(square, -5);
    for (let i = 0; i < 4; i++) {
      const orig = square[i]!;
      const pos_dx = pos[i]!.x - orig.x;
      const neg_dx = neg[i]!.x - orig.x;
      const pos_dy = pos[i]!.y - orig.y;
      const neg_dy = neg[i]!.y - orig.y;
      expect(pos_dx * neg_dx + pos_dy * neg_dy).toBeLessThan(0);
    }
  });
});
