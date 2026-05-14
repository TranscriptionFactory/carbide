import { describe, it, expect } from "vitest";
import { radial_layout } from "$lib/features/graph/domain/radial_layout";

describe("radial_layout", () => {
  it("places center node at origin", () => {
    const result = radial_layout("center", []);
    expect(result.positions.get("center")).toEqual({ x: 0, y: 0 });
  });

  it("places 1-hop neighbors on inner ring", () => {
    const edges = [
      { source: "center", target: "a" },
      { source: "center", target: "b" },
    ];
    const result = radial_layout("center", edges);

    const a_pos = result.positions.get("a")!;
    const b_pos = result.positions.get("b")!;
    const a_dist = Math.sqrt(a_pos.x ** 2 + a_pos.y ** 2);
    const b_dist = Math.sqrt(b_pos.x ** 2 + b_pos.y ** 2);

    expect(a_dist).toBeCloseTo(150, 0);
    expect(b_dist).toBeCloseTo(150, 0);
  });

  it("places 2-hop neighbors on outer ring", () => {
    const edges = [
      { source: "center", target: "hop1" },
      { source: "hop1", target: "hop2" },
    ];
    const result = radial_layout("center", edges);

    const hop2_pos = result.positions.get("hop2")!;
    const dist = Math.sqrt(hop2_pos.x ** 2 + hop2_pos.y ** 2);
    expect(dist).toBeCloseTo(300, 0);
  });

  it("correctly identifies 1-hop and 2-hop sets", () => {
    const edges = [
      { source: "center", target: "n1" },
      { source: "center", target: "n2" },
      { source: "n1", target: "far" },
    ];
    const result = radial_layout("center", edges);

    expect(result.neighbor_ids_1hop.has("n1")).toBe(true);
    expect(result.neighbor_ids_1hop.has("n2")).toBe(true);
    expect(result.neighbor_ids_2hop.has("far")).toBe(true);
    expect(result.neighbor_ids_1hop.has("far")).toBe(false);
  });

  it("does not include center in neighbor sets", () => {
    const edges = [{ source: "center", target: "a" }];
    const result = radial_layout("center", edges);

    expect(result.neighbor_ids_1hop.has("center")).toBe(false);
    expect(result.neighbor_ids_2hop.has("center")).toBe(false);
  });

  it("handles isolated center", () => {
    const result = radial_layout("center", []);
    expect(result.positions.size).toBe(1);
    expect(result.neighbor_ids_1hop.size).toBe(0);
    expect(result.neighbor_ids_2hop.size).toBe(0);
  });

  it("respects custom center position", () => {
    const result = radial_layout("c", [], 100, 200);
    expect(result.positions.get("c")).toEqual({ x: 100, y: 200 });
  });

  it("spaces 1-hop neighbors evenly around the ring", () => {
    const edges = [
      { source: "c", target: "n1" },
      { source: "c", target: "n2" },
      { source: "c", target: "n3" },
      { source: "c", target: "n4" },
    ];
    const result = radial_layout("c", edges);
    const positions = ["n1", "n2", "n3", "n4"].map(
      (id) => result.positions.get(id)!,
    );

    for (let i = 0; i < positions.length; i++) {
      const next = positions[(i + 1) % positions.length]!;
      const dx = positions[i]!.x - next.x;
      const dy = positions[i]!.y - next.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeGreaterThan(50);
    }
  });
});
