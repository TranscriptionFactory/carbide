import { describe, it, expect } from "vitest";
import { point_to_segment_distance } from "$lib/features/graph/domain/edge_hit_test";

describe("point_to_segment_distance", () => {
  it("returns 0 when point is on the segment", () => {
    expect(point_to_segment_distance(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it("returns perpendicular distance to horizontal segment", () => {
    expect(point_to_segment_distance(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it("returns distance to nearest endpoint when projection is before start", () => {
    expect(point_to_segment_distance(-3, 0, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it("returns distance to nearest endpoint when projection is past end", () => {
    expect(point_to_segment_distance(13, 0, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it("handles zero-length segment as point distance", () => {
    expect(point_to_segment_distance(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });

  it("handles diagonal segment", () => {
    // Point (0, 1) to segment from (0,0) to (1,1): perpendicular distance = 1/sqrt(2)
    expect(point_to_segment_distance(0, 1, 0, 0, 1, 1)).toBeCloseTo(
      Math.SQRT2 / 2,
    );
  });
});
