import { describe, it, expect } from "vitest";
import { SpatialIndex } from "$lib/features/graph/domain/spatial_index";

describe("SpatialIndex", () => {
  it("returns empty for empty index", () => {
    const index = new SpatialIndex();
    const result = index.query_viewport(0, 0, 1000, 1000);
    expect(result).toEqual([]);
  });

  it("returns node within viewport", () => {
    const index = new SpatialIndex();
    index.rebuild([{ id: "a", x: 50, y: 50 }]);
    const result = index.query_viewport(0, 0, 200, 200);
    expect(result).toEqual(["a"]);
  });

  it("excludes node outside viewport", () => {
    const index = new SpatialIndex();
    index.rebuild([{ id: "a", x: 500, y: 500 }]);
    const result = index.query_viewport(0, 0, 100, 100);
    expect(result).toEqual([]);
  });

  it("handles negative coordinates", () => {
    const index = new SpatialIndex();
    index.rebuild([
      { id: "a", x: -100, y: -100 },
      { id: "b", x: 100, y: 100 },
    ]);
    const result = index.query_viewport(-200, -200, 400, 400);
    expect(result).toHaveLength(2);
    expect(result).toContain("a");
    expect(result).toContain("b");
  });

  it("handles cell boundary nodes correctly", () => {
    const index = new SpatialIndex();
    index.rebuild([
      { id: "a", x: 199, y: 199 },
      { id: "b", x: 200, y: 200 },
    ]);
    const result = index.query_viewport(0, 0, 200, 200);
    expect(result).toContain("a");
    expect(result).toContain("b");
  });

  it("rebuild replaces previous data", () => {
    const index = new SpatialIndex();
    index.rebuild([{ id: "a", x: 50, y: 50 }]);
    index.rebuild([{ id: "b", x: 50, y: 50 }]);
    const result = index.query_viewport(0, 0, 200, 200);
    expect(result).toEqual(["b"]);
  });

  it("get_position returns stored position", () => {
    const index = new SpatialIndex();
    index.rebuild([{ id: "a", x: 42, y: 99 }]);
    expect(index.get_position("a")).toEqual({ x: 42, y: 99 });
  });

  it("get_position returns undefined for unknown id", () => {
    const index = new SpatialIndex();
    expect(index.get_position("missing")).toBeUndefined();
  });

  it("handles large datasets efficiently", () => {
    const index = new SpatialIndex();
    const nodes = Array.from({ length: 10000 }, (_, i) => ({
      id: `n${String(i)}`,
      x: (i % 100) * 20,
      y: Math.floor(i / 100) * 20,
    }));
    index.rebuild(nodes);

    const start = performance.now();
    const result = index.query_viewport(0, 0, 200, 200);
    const elapsed = performance.now() - start;

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(nodes.length);
    expect(elapsed).toBeLessThan(5);
  });

  it("returns multiple nodes in same cell", () => {
    const index = new SpatialIndex();
    index.rebuild([
      { id: "a", x: 10, y: 10 },
      { id: "b", x: 20, y: 20 },
      { id: "c", x: 30, y: 30 },
    ]);
    const result = index.query_viewport(0, 0, 200, 200);
    expect(result).toHaveLength(3);
  });
});
