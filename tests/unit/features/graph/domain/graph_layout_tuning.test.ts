import { describe, it, expect } from "vitest";
import {
  compute_tick_budget,
  label_collision_radius,
  truncate_label,
  LABEL_MAX_CHARS,
} from "$lib/features/graph/domain/graph_layout_tuning";

describe("compute_tick_budget", () => {
  it("gives small graphs at least 300 ticks to converge", () => {
    expect(compute_tick_budget(0)).toBe(300);
    expect(compute_tick_budget(40)).toBe(300);
    expect(compute_tick_budget(600)).toBe(300);
  });

  it("scales with node count between floor and cap", () => {
    expect(compute_tick_budget(800)).toBe(400);
  });

  it("caps at 500 ticks for large graphs", () => {
    expect(compute_tick_budget(1000)).toBe(500);
    expect(compute_tick_budget(50_000)).toBe(500);
  });
});

describe("label_collision_radius", () => {
  it("returns the base radius for short labels", () => {
    expect(label_collision_radius(0, 48)).toBe(48);
    expect(label_collision_radius(10, 48)).toBe(48);
  });

  it("grows with label length once it exceeds the base", () => {
    expect(label_collision_radius(20, 48)).toBeCloseTo(66);
    expect(label_collision_radius(40, 20)).toBeCloseTo(132);
  });
});

describe("truncate_label", () => {
  it("keeps short labels untouched", () => {
    expect(truncate_label("Note")).toBe("Note");
  });

  it("keeps labels at exactly the limit untouched", () => {
    const exact = "a".repeat(LABEL_MAX_CHARS);
    expect(truncate_label(exact)).toBe(exact);
  });

  it("truncates long labels to the limit plus ellipsis", () => {
    const long = "b".repeat(LABEL_MAX_CHARS + 10);
    const result = truncate_label(long);
    expect(result).toBe(`${"b".repeat(LABEL_MAX_CHARS)}…`);
    expect(result.length).toBe(LABEL_MAX_CHARS + 1);
  });

  it("honors a custom limit", () => {
    expect(truncate_label("abcdef", 3)).toBe("abc…");
  });
});
