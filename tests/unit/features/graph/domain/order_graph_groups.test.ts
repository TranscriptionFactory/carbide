import { describe, it, expect } from "vitest";
import {
  order_graph_groups,
  type OrderableNode,
} from "$lib/features/graph/domain/order_graph_groups";

function node(
  group: string | undefined,
  created: number,
  modified: number,
): OrderableNode {
  return {
    group,
    date_created_ms: created,
    date_modified_ms: modified,
  };
}

const NODES: OrderableNode[] = [
  node("alpha", 300, 100),
  node("alpha", 100, 200),
  node("beta", 200, 900),
  node("gamma", 900, 50),
];

describe("order_graph_groups", () => {
  it("orders groups alphabetically by name", () => {
    expect(order_graph_groups(NODES, "name")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("orders by the newest creation date in each group, newest first", () => {
    expect(order_graph_groups(NODES, "date_created")).toEqual([
      "gamma",
      "alpha",
      "beta",
    ]);
  });

  it("orders by the newest modification date in each group, newest first", () => {
    expect(order_graph_groups(NODES, "date_modified")).toEqual([
      "beta",
      "alpha",
      "gamma",
    ]);
  });

  it("returns each group exactly once", () => {
    const ordered = order_graph_groups(NODES, "name");
    expect(new Set(ordered).size).toBe(ordered.length);
  });

  it("skips ungrouped nodes", () => {
    expect(order_graph_groups([node(undefined, 1, 1)], "name")).toEqual([]);
  });

  it("is independent of the order nodes arrive in", () => {
    const reversed = [...NODES].reverse();
    for (const mode of ["name", "date_created", "date_modified"] as const) {
      expect(order_graph_groups(reversed, mode)).toEqual(
        order_graph_groups(NODES, mode),
      );
    }
  });

  it("breaks date ties by name", () => {
    const tied = [node("b", 5, 5), node("a", 5, 5)];
    expect(order_graph_groups(tied, "date_created")).toEqual(["a", "b"]);
  });

  it("sorts missing dates last", () => {
    const mixed = [{ group: "undated" }, node("dated", 10, 10)];
    expect(order_graph_groups(mixed, "date_created")).toEqual([
      "dated",
      "undated",
    ]);
  });

  it("orders degree buckets by connection count, not string order", () => {
    const buckets = [
      node("degree:11+", 0, 0),
      node("degree:3-5", 0, 0),
      node("degree:1-2", 0, 0),
      node("degree:6-10", 0, 0),
      node("degree:0", 0, 0),
    ];
    expect(order_graph_groups(buckets, "name")).toEqual([
      "degree:0",
      "degree:1-2",
      "degree:3-5",
      "degree:6-10",
      "degree:11+",
    ]);
  });
});
