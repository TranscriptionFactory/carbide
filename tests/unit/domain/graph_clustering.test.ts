import { describe, it, expect } from "vitest";
import {
  label_propagation,
  is_clustering_meaningful,
} from "$lib/features/graph/domain/graph_clustering";

describe("label_propagation", () => {
  it("returns empty map for empty input", () => {
    const result = label_propagation([], []);
    expect(result.size).toBe(0);
  });

  it("assigns single-node graphs to cluster 0", () => {
    const result = label_propagation(["a"], []);
    expect(result.get("a")).toBe(0);
  });

  it("groups connected nodes into same cluster", () => {
    const nodes = ["a", "b", "c"];
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];
    const result = label_propagation(nodes, edges);
    expect(result.get("a")).toBe(result.get("b"));
    expect(result.get("b")).toBe(result.get("c"));
  });

  it("separates disconnected components", () => {
    const nodes = ["a", "b", "c", "d"];
    const edges = [
      { source: "a", target: "b" },
      { source: "c", target: "d" },
    ];
    const result = label_propagation(nodes, edges);
    expect(result.get("a")).toBe(result.get("b"));
    expect(result.get("c")).toBe(result.get("d"));
    expect(result.get("a")).not.toBe(result.get("c"));
  });

  it("handles triangles as single cluster", () => {
    const nodes = ["a", "b", "c"];
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "a" },
    ];
    const result = label_propagation(nodes, edges);
    const cluster_a = result.get("a");
    expect(result.get("b")).toBe(cluster_a);
    expect(result.get("c")).toBe(cluster_a);
  });

  it("produces normalized labels starting from 0", () => {
    const nodes = ["x", "y", "z"];
    const edges = [
      { source: "x", target: "y" },
      { source: "y", target: "z" },
    ];
    const result = label_propagation(nodes, edges);
    const labels = new Set(result.values());
    expect(labels.has(0)).toBe(true);
  });

  it("handles two dense clusters connected by a bridge", () => {
    const nodes = ["a1", "a2", "a3", "b1", "b2", "b3"];
    const edges = [
      { source: "a1", target: "a2" },
      { source: "a2", target: "a3" },
      { source: "a1", target: "a3" },
      { source: "b1", target: "b2" },
      { source: "b2", target: "b3" },
      { source: "b1", target: "b3" },
      { source: "a3", target: "b1" },
    ];
    const result = label_propagation(nodes, edges);
    const unique_clusters = new Set(result.values());
    expect(unique_clusters.size).toBeGreaterThanOrEqual(1);
    expect(unique_clusters.size).toBeLessThanOrEqual(2);
  });
});

describe("is_clustering_meaningful", () => {
  it("returns false for fewer than 4 nodes", () => {
    const clusters = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    expect(is_clustering_meaningful(clusters, 2)).toBe(false);
  });

  it("returns false when all nodes in single cluster", () => {
    const clusters = new Map([
      ["a", 0],
      ["b", 0],
      ["c", 0],
      ["d", 0],
    ]);
    expect(is_clustering_meaningful(clusters, 4)).toBe(false);
  });

  it("returns false when too many singletons", () => {
    const clusters = new Map([
      ["a", 0],
      ["b", 1],
      ["c", 2],
      ["d", 3],
    ]);
    expect(is_clustering_meaningful(clusters, 4)).toBe(false);
  });

  it("returns true for meaningful clustering", () => {
    const clusters = new Map([
      ["a", 0],
      ["b", 0],
      ["c", 1],
      ["d", 1],
    ]);
    expect(is_clustering_meaningful(clusters, 4)).toBe(true);
  });
});
