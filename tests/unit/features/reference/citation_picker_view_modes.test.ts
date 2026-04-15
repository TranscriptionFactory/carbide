import { describe, it, expect } from "vitest";
import type { LinkedNoteInfo } from "$lib/features/reference/types";
import {
  group_by_source,
  build_tree,
} from "$lib/features/reference/domain/view_mode_helpers";

function make_note(
  path: string,
  opts: Partial<LinkedNoteInfo> = {},
): LinkedNoteInfo {
  return {
    path,
    title: `Title: ${path}`,
    mtime_ms: 1000,
    ...opts,
  };
}

describe("group_by_source", () => {
  it("groups notes by linked_source_id", () => {
    const notes = [
      make_note("a", { linked_source_id: "src1" }),
      make_note("b", { linked_source_id: "src2" }),
      make_note("c", { linked_source_id: "src1" }),
    ];
    const groups = group_by_source(notes);
    expect(groups.size).toBe(2);
    expect(groups.get("src1")).toHaveLength(2);
    expect(groups.get("src2")).toHaveLength(1);
  });

  it("uses 'Unknown' for notes without linked_source_id", () => {
    const notes = [make_note("a"), make_note("b", { linked_source_id: "s1" })];
    const groups = group_by_source(notes);
    expect(groups.has("Unknown")).toBe(true);
    expect(groups.get("Unknown")).toHaveLength(1);
  });

  it("returns empty map for empty input", () => {
    expect(group_by_source([]).size).toBe(0);
  });

  it("preserves insertion order of source keys", () => {
    const notes = [
      make_note("a", { linked_source_id: "z" }),
      make_note("b", { linked_source_id: "a" }),
      make_note("c", { linked_source_id: "m" }),
    ];
    const keys = [...group_by_source(notes).keys()];
    expect(keys).toEqual(["z", "a", "m"]);
  });
});

describe("build_tree", () => {
  it("builds flat tree for top-level notes", () => {
    const notes = [
      make_note("note1", { vault_relative_path: "note1.md" }),
      make_note("note2", { vault_relative_path: "note2.md" }),
    ];
    const tree = build_tree(notes);
    expect(tree).toHaveLength(2);
    expect(tree[0]?.note).toBeDefined();
    expect(tree[1]?.note).toBeDefined();
  });

  it("nests notes under directory nodes", () => {
    const notes = [
      make_note("a/b/c", { vault_relative_path: "folder/sub/file.md" }),
    ];
    const tree = build_tree(notes);
    expect(tree).toHaveLength(1);
    const folder = tree[0];
    expect(folder?.name).toBe("folder");
    expect(folder?.note).toBeUndefined();
    expect(folder?.children).toHaveLength(1);
    const sub = folder?.children?.[0];
    expect(sub?.name).toBe("sub");
    expect(sub?.children).toHaveLength(1);
    const file = sub?.children?.[0];
    expect(file?.name).toBe("file.md");
    expect(file?.note).toBeDefined();
  });

  it("merges notes under the same directory", () => {
    const notes = [
      make_note("p1", { vault_relative_path: "dir/a.md" }),
      make_note("p2", { vault_relative_path: "dir/b.md" }),
    ];
    const tree = build_tree(notes);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("dir");
    expect(tree[0]?.children).toHaveLength(2);
  });

  it("falls back to path when vault_relative_path is absent", () => {
    const note = make_note("folder/file.md");
    const tree = build_tree([note]);
    expect(tree[0]?.name).toBe("folder");
    expect(tree[0]?.children?.[0]?.name).toBe("file.md");
  });

  it("returns empty array for empty input", () => {
    expect(build_tree([])).toHaveLength(0);
  });
});
