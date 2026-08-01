import { describe, it, expect } from "vitest";
import {
  GROUP_TINT_COUNT,
  UNTAGGED_GROUP,
  compute_degrees,
  compute_group_grid,
  degree_bucket,
  folder_from_path,
  group_tint,
  group_tint_index,
  grouping_forces,
  primary_tag,
  resolve_group,
  type GroupableNode,
} from "$lib/features/graph/domain/graph_grouping";

const PALETTE = [0x111111, 0x222222, 0x333333, 0x444444, 0x555555];
const FALLBACK = 0x888888;

function node(overrides: Partial<GroupableNode> = {}): GroupableNode {
  return {
    path: "a/x.md",
    folder_group: "a",
    tags: undefined,
    degree: 0,
    ...overrides,
  };
}

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

describe("compute_degrees", () => {
  it("counts both endpoints of every edge", () => {
    const degrees = compute_degrees([
      { source: "a.md", target: "b.md" },
      { source: "b.md", target: "c.md" },
    ]);
    expect(degrees.get("a.md")).toBe(1);
    expect(degrees.get("b.md")).toBe(2);
    expect(degrees.get("c.md")).toBe(1);
  });

  it("leaves unlinked notes out of the map", () => {
    expect(compute_degrees([]).get("a.md")).toBe(undefined);
  });

  it("ignores self-links", () => {
    const degrees = compute_degrees([{ source: "a.md", target: "a.md" }]);
    expect(degrees.get("a.md")).toBe(undefined);
  });

  it("counts parallel edges between the same pair separately", () => {
    const degrees = compute_degrees([
      { source: "a.md", target: "b.md" },
      { source: "b.md", target: "a.md" },
    ]);
    expect(degrees.get("a.md")).toBe(2);
    expect(degrees.get("b.md")).toBe(2);
  });
});

describe("primary_tag", () => {
  it("picks the alphabetically first tag so the choice is order independent", () => {
    expect(primary_tag(["zeta", "alpha", "mid"])).toBe("alpha");
    expect(primary_tag(["mid", "zeta", "alpha"])).toBe("alpha");
  });

  it("returns the only tag when there is one", () => {
    expect(primary_tag(["solo"])).toBe("solo");
  });

  it("has no primary tag for untagged notes", () => {
    expect(primary_tag([])).toBe(undefined);
    expect(primary_tag(undefined)).toBe(undefined);
  });

  it("does not mutate the caller's array", () => {
    const tags = ["zeta", "alpha"];
    primary_tag(tags);
    expect(tags).toEqual(["zeta", "alpha"]);
  });
});

describe("degree_bucket", () => {
  it("buckets connection counts into fixed ranges", () => {
    expect(degree_bucket(0)).toBe("degree:0");
    expect(degree_bucket(1)).toBe("degree:1-2");
    expect(degree_bucket(2)).toBe("degree:1-2");
    expect(degree_bucket(3)).toBe("degree:3-5");
    expect(degree_bucket(5)).toBe("degree:3-5");
    expect(degree_bucket(6)).toBe("degree:6-10");
    expect(degree_bucket(10)).toBe("degree:6-10");
    expect(degree_bucket(11)).toBe("degree:11+");
    expect(degree_bucket(4321)).toBe("degree:11+");
  });

  it("never produces more buckets than the tint palette has slots", () => {
    const buckets = new Set(
      Array.from({ length: 500 }, (_, i) => degree_bucket(i)),
    );
    expect(buckets.size).toBe(GROUP_TINT_COUNT);
  });
});

describe("resolve_group", () => {
  it("drops groups entirely in none mode", () => {
    expect(resolve_group(node(), "none", { "a/x.md": 3 })).toBe(undefined);
  });

  it("keeps the folder group in folder mode even when clusters exist", () => {
    expect(resolve_group(node(), "folder", { "a/x.md": 3 })).toBe("a");
  });

  it("uses the cluster assignment in cluster mode", () => {
    expect(resolve_group(node(), "cluster", { "a/x.md": 3 })).toBe("cluster:3");
  });

  it("falls back to the folder group when clusters are not computed yet", () => {
    expect(resolve_group(node(), "cluster", null)).toBe("a");
  });

  it("falls back to the folder group for nodes missing from the assignments", () => {
    expect(resolve_group(node(), "cluster", { "b/y.md": 1 })).toBe("a");
  });

  it("treats cluster 0 as a real assignment", () => {
    expect(resolve_group(node(), "cluster", { "a/x.md": 0 })).toBe("cluster:0");
  });

  it("groups a multi-tag note under its alphabetically first tag", () => {
    expect(resolve_group(node({ tags: ["work", "admin"] }), "tag", null)).toBe(
      "tag:admin",
    );
  });

  it("puts every untagged note in one shared bucket", () => {
    expect(resolve_group(node({ tags: [] }), "tag", null)).toBe(UNTAGGED_GROUP);
    expect(resolve_group(node({ tags: undefined }), "tag", null)).toBe(
      UNTAGGED_GROUP,
    );
  });

  it("keeps tag groups distinct from folder groups of the same name", () => {
    expect(resolve_group(node({ tags: ["a"] }), "tag", null)).not.toBe(
      resolve_group(node({ folder_group: "a" }), "folder", null),
    );
  });

  it("groups by bucketed connection count in degree mode", () => {
    expect(resolve_group(node({ degree: 0 }), "degree", null)).toBe("degree:0");
    expect(resolve_group(node({ degree: 7 }), "degree", null)).toBe(
      "degree:6-10",
    );
  });

  it("ignores clusters and tags in degree mode", () => {
    expect(
      resolve_group(node({ degree: 4, tags: ["x"] }), "degree", {
        "a/x.md": 9,
      }),
    ).toBe("degree:3-5");
  });
});

describe("compute_group_grid", () => {
  it("places groups in the order it is given", () => {
    const grid = compute_group_grid(["c", "a", "b", "d"]);
    expect(grid.get("c")?.x).toBeLessThan(Number(grid.get("a")?.x));
    expect(grid.get("b")?.y).toBeGreaterThan(Number(grid.get("a")?.y));
  });

  it("gives every group a distinct slot", () => {
    const groups = ["a", "b", "c", "d", "e", "f", "g"];
    const grid = compute_group_grid(groups);
    const slots = new Set(
      [...grid.values()].map((p) => `${String(p.x)},${String(p.y)}`),
    );
    expect(slots.size).toBe(groups.length);
  });

  it("centres a single group at the origin", () => {
    expect(compute_group_grid(["only"]).get("only")).toEqual({ x: 0, y: 0 });
  });

  it("returns an empty grid for no groups", () => {
    expect(compute_group_grid([]).size).toBe(0);
  });
});

describe("grouping_forces", () => {
  it("sends folder forces for a plain vault graph", () => {
    expect(grouping_forces("folder", false)?.mode).toBe("folder");
  });

  it("sends folder forces in cluster mode", () => {
    expect(grouping_forces("cluster", false)?.mode).toBe("folder");
  });

  it("sends folder forces in tag and degree modes", () => {
    expect(grouping_forces("tag", false)?.mode).toBe("folder");
    expect(grouping_forces("degree", false)?.mode).toBe("folder");
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
