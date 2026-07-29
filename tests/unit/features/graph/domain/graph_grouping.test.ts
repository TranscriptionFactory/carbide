import { describe, it, expect } from "vitest";
import {
  GROUP_TINT_COUNT,
  folder_from_path,
  group_tint,
  group_tint_index,
  grouping_forces,
  resolve_group,
} from "$lib/features/graph/domain/graph_grouping";

const PALETTE = [0x111111, 0x222222, 0x333333, 0x444444, 0x555555];
const FALLBACK = 0x888888;

describe("folder_from_path", () => {
  it("returns the parent folder", () => {
    expect(folder_from_path("projects/alpha.md")).toBe("projects");
  });

  it("returns the full nested folder path", () => {
    expect(folder_from_path("journal/2026/07/entry.md")).toBe(
      "journal/2026/07",
    );
  });

  it("returns an empty group for vault-root notes", () => {
    expect(folder_from_path("root.md")).toBe("");
  });
});

describe("resolve_group", () => {
  it("drops groups entirely in none mode", () => {
    expect(resolve_group("a/x.md", "a", "none", { "a/x.md": 3 })).toBe(
      undefined,
    );
  });

  it("keeps the folder group in folder mode even when clusters exist", () => {
    expect(resolve_group("a/x.md", "a", "folder", { "a/x.md": 3 })).toBe("a");
  });

  it("uses the cluster assignment in cluster mode", () => {
    expect(resolve_group("a/x.md", "a", "cluster", { "a/x.md": 3 })).toBe(
      "cluster:3",
    );
  });

  it("falls back to the folder group when clusters are not computed yet", () => {
    expect(resolve_group("a/x.md", "a", "cluster", null)).toBe("a");
  });

  it("falls back to the folder group for nodes missing from the assignments", () => {
    expect(resolve_group("a/x.md", "a", "cluster", { "b/y.md": 1 })).toBe("a");
  });

  it("treats cluster 0 as a real assignment", () => {
    expect(resolve_group("a/x.md", "a", "cluster", { "a/x.md": 0 })).toBe(
      "cluster:0",
    );
  });
});

describe("grouping_forces", () => {
  it("sends folder forces for a plain vault graph", () => {
    expect(grouping_forces("folder", false)?.mode).toBe("folder");
  });

  it("sends folder forces in cluster mode", () => {
    expect(grouping_forces("cluster", false)?.mode).toBe("folder");
  });

  it("sends no forces when grouping is off and there is no search meta", () => {
    expect(grouping_forces("none", false)).toBe(undefined);
  });

  it("combines group and hit-center forces for search graphs", () => {
    expect(grouping_forces("folder", true)?.mode).toBe("both");
  });

  it("keeps hit-centering for search graphs with grouping off", () => {
    expect(grouping_forces("none", true)?.mode).toBe("hit_center");
  });

  it("carries positive strengths", () => {
    const forces = grouping_forces("folder", true);
    expect(forces?.folder_strength).toBeGreaterThan(0);
    expect(forces?.hit_center_strength).toBeGreaterThan(0);
  });
});

describe("group_tint_index", () => {
  it("maps a group to the same tint on every call", () => {
    const first = group_tint_index("projects/alpha");
    for (let i = 0; i < 100; i++) {
      expect(group_tint_index("projects/alpha")).toBe(first);
    }
  });

  it("stays inside the palette", () => {
    const groups = [
      "",
      "a",
      "projects",
      "journal/2026/07",
      "cluster:0",
      "cluster:41",
      "very/deeply/nested/folder/path",
    ];
    for (const group of groups) {
      const index = group_tint_index(group);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(GROUP_TINT_COUNT);
    }
  });

  it("is independent of the order groups are seen in", () => {
    const forward = ["a", "b", "c"].map(group_tint_index);
    const backward = ["c", "b", "a"].map(group_tint_index).reverse();
    expect(backward).toEqual(forward);
  });

  it("spreads distinct groups across more than one tint", () => {
    const indices = new Set(
      ["cluster:0", "cluster:1", "cluster:2", "cluster:3", "cluster:4"].map(
        group_tint_index,
      ),
    );
    expect(indices.size).toBeGreaterThan(1);
  });
});

describe("group_tint", () => {
  it("returns the same tint for a group on every lookup", () => {
    const groups = ["projects", "journal/2026", "cluster:7", ""];
    const first = groups.map((g) => group_tint(g, PALETTE, FALLBACK));
    for (let run = 0; run < 50; run++) {
      expect(groups.map((g) => group_tint(g, PALETTE, FALLBACK))).toEqual(
        first,
      );
    }
  });

  it("resolves the same palette slot regardless of which palette is applied", () => {
    const other = [0xaa0000, 0xbb0000, 0xcc0000, 0xdd0000, 0xee0000];
    for (const group of ["projects", "cluster:7", "a/b/c"]) {
      const slot = PALETTE.indexOf(group_tint(group, PALETTE, FALLBACK));
      expect(other.indexOf(group_tint(group, other, FALLBACK))).toBe(slot);
    }
  });

  it("only ever returns colours from the palette", () => {
    for (let i = 0; i < 200; i++) {
      expect(PALETTE).toContain(
        group_tint(`cluster:${String(i)}`, PALETTE, FALLBACK),
      );
    }
  });

  it("falls back for ungrouped nodes", () => {
    expect(group_tint(undefined, PALETTE, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back when the palette is not populated yet", () => {
    expect(group_tint("projects", [], FALLBACK)).toBe(FALLBACK);
  });
});
