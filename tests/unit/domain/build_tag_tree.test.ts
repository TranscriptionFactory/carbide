import { describe, it, expect } from "vitest";
import { build_tag_tree } from "$lib/features/tags/domain/build_tag_tree";
import type { TagInfo } from "$lib/features/tags/types";

function tag(name: string, count: number): TagInfo {
  return { tag: name, count };
}

describe("build_tag_tree", () => {
  it("returns empty array for empty input", () => {
    expect(build_tag_tree([])).toEqual([]);
  });

  it("builds flat nodes for non-hierarchical tags", () => {
    const tree = build_tag_tree([tag("rust", 5), tag("svelte", 3)]);

    expect(tree).toHaveLength(2);
    const first = tree[0]!;
    expect(first.segment).toBe("rust");
    expect(first.full_tag).toBe("rust");
    expect(first.own_count).toBe(5);
    expect(first.descendant_count).toBe(0);
    expect(first.children).toEqual([]);
  });

  it("builds nested tree for hierarchical tags", () => {
    const tree = build_tag_tree([
      tag("status/active", 3),
      tag("status/done", 2),
    ]);

    expect(tree).toHaveLength(1);
    const status = tree[0]!;
    expect(status.segment).toBe("status");
    expect(status.full_tag).toBe("status");
    expect(status.own_count).toBe(0);
    expect(status.descendant_count).toBe(5);
    expect(status.children).toHaveLength(2);

    const active = status.children.find((c) => c.segment === "active")!;
    expect(active.full_tag).toBe("status/active");
    expect(active.own_count).toBe(3);
  });

  it("handles mixed flat and hierarchical tags", () => {
    const tree = build_tag_tree([
      tag("rust", 10),
      tag("project/carbide", 5),
      tag("project/carbide", 3),
    ]);

    expect(tree).toHaveLength(2);
    const rust = tree.find((n) => n.segment === "rust")!;
    expect(rust.own_count).toBe(10);
    expect(rust.children).toEqual([]);

    const project = tree.find((n) => n.segment === "project")!;
    expect(project.own_count).toBe(0);
    expect(project.descendant_count).toBe(8);
    expect(project.children).toHaveLength(1);
  });

  it("handles deeply nested tags", () => {
    const tree = build_tag_tree([tag("a/b/c/d", 1)]);

    expect(tree).toHaveLength(1);
    const a = tree[0]!;
    expect(a.segment).toBe("a");
    expect(a.children).toHaveLength(1);
    const b = a.children[0]!;
    expect(b.segment).toBe("b");
    const c = b.children[0]!;
    expect(c.segment).toBe("c");
    const d = c.children[0]!;
    expect(d.segment).toBe("d");
    expect(d.own_count).toBe(1);
  });

  it("propagates descendant counts up the tree", () => {
    const tree = build_tag_tree([
      tag("status", 1),
      tag("status/active", 3),
      tag("status/done", 2),
    ]);

    const status = tree[0]!;
    expect(status.own_count).toBe(1);
    expect(status.descendant_count).toBe(5);
  });

  it("sorts by total count descending, then alphabetically", () => {
    const tree = build_tag_tree([
      tag("alpha", 1),
      tag("beta", 5),
      tag("gamma", 3),
    ]);

    expect(tree.map((n) => n.segment)).toEqual(["beta", "gamma", "alpha"]);
  });

  it("sorts children within parent nodes", () => {
    const tree = build_tag_tree([
      tag("status/zebra", 1),
      tag("status/alpha", 5),
      tag("status/mid", 3),
    ]);

    const children = tree[0]!.children;
    expect(children.map((c) => c.segment)).toEqual(["alpha", "mid", "zebra"]);
  });

  it("handles tag that is both a leaf and a parent", () => {
    const tree = build_tag_tree([tag("project", 2), tag("project/docs", 3)]);

    const project = tree[0]!;
    expect(project.own_count).toBe(2);
    expect(project.descendant_count).toBe(3);
    expect(project.children).toHaveLength(1);
    expect(project.children[0]!.segment).toBe("docs");
  });
});
