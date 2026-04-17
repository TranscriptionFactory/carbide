import { describe, it, expect } from "vitest";
import {
  compute_degradation_profile,
  sample_edges,
  NODE_THRESHOLD,
  EDGE_THRESHOLD,
} from "$lib/features/graph/domain/graph_degrade";

describe("compute_degradation_profile", () => {
  it("returns non-degraded for small graph", () => {
    const p = compute_degradation_profile(50, 100);
    expect(p.is_degraded).toBe(false);
    expect(p.edge_render_limit).toBe(100);
    expect(p.simulation_tick_cap).toBe(300);
  });

  it("returns level <= 1 at threshold boundary", () => {
    const p = compute_degradation_profile(NODE_THRESHOLD, EDGE_THRESHOLD);
    expect(p.level).toBeCloseTo(1, 5);
    expect(p.is_degraded).toBe(false);
  });

  it("degrades for large graph (1000 nodes, 5000 edges)", () => {
    const p = compute_degradation_profile(1000, 5000);
    expect(p.is_degraded).toBe(true);
    expect(p.edge_render_limit).toBeLessThan(5000);
    expect(p.edge_render_limit).toBeGreaterThanOrEqual(500);
    expect(p.simulation_tick_cap).toBeLessThan(220);
    expect(p.simulation_tick_cap).toBeGreaterThanOrEqual(80);
    expect(p.label_visible_min_zoom).toBeGreaterThan(0);
  });

  it("enforces minimum caps for very large graph (5000 nodes, 20000 edges)", () => {
    const p = compute_degradation_profile(5000, 20000);
    expect(p.is_degraded).toBe(true);
    expect(p.edge_render_limit).toBeGreaterThanOrEqual(500);
    expect(p.simulation_tick_cap).toBeGreaterThanOrEqual(80);
    expect(p.label_visible_min_zoom).toBeLessThanOrEqual(1.0);
  });

  it("uses edge count when it drives level higher", () => {
    const p = compute_degradation_profile(100, 3200);
    expect(p.level).toBeCloseTo(3200 / EDGE_THRESHOLD, 5);
    expect(p.is_degraded).toBe(true);
  });
});

describe("sample_edges", () => {
  type E = { source: string; target: string };

  function make_edges(n: number): E[] {
    return Array.from({ length: n }, (_, i) => ({
      source: `n${String(i)}`,
      target: `n${String(i + 1)}`,
    }));
  }

  it("returns all edges when below limit", () => {
    const edges = make_edges(10);
    const result = sample_edges(edges, 20, new Set());
    expect(result).toBe(edges);
  });

  it("returns exactly limit edges when above limit with no priority", () => {
    const edges = make_edges(100);
    const result = sample_edges(edges, 30, new Set());
    expect(result).toHaveLength(30);
  });

  it("always includes priority edges", () => {
    const edges = make_edges(100);
    const priority = new Set(["n50", "n51"]);
    const result = sample_edges(edges, 10, priority);
    expect(result).toHaveLength(10);
    const sources_and_targets = new Set(
      result.flatMap((e) => [e.source, e.target]),
    );
    expect(sources_and_targets.has("n50")).toBe(true);
    expect(sources_and_targets.has("n51")).toBe(true);
  });

  it("returns empty for empty input", () => {
    const result = sample_edges([], 10, new Set());
    expect(result).toEqual([]);
  });

  it("handles priority exceeding limit by truncating", () => {
    const edges: E[] = [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "a", target: "d" },
      { source: "x", target: "y" },
    ];
    const result = sample_edges(edges, 2, new Set(["a"]));
    expect(result).toHaveLength(2);
    for (const e of result) {
      expect(e.source === "a" || e.target === "a").toBe(true);
    }
  });
});
