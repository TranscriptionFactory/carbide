import { describe, expect, it } from "vitest";
import {
  build_filetree,
  derive_starred_tree,
  sort_tree,
} from "$lib/features/folder";
import { create_test_note } from "../helpers/test_fixtures";

describe("derive_starred_tree", () => {
  it("reuses the indexed tree for starred folders", () => {
    const tree = sort_tree(
      build_filetree(
        [
          create_test_note("projects/a", "a"),
          create_test_note("projects/nested/b", "b"),
        ],
        ["projects", "projects/nested"],
      ),
    );

    const nodes = derive_starred_tree({
      tree,
      starred_paths: ["projects"],
      expanded_node_ids: new Set(["starred:projects:"]),
      load_states: new Map(),
      error_messages: new Map(),
      show_hidden_files: true,
      pagination: new Map(),
    });

    expect(nodes.map((node) => node.path)).toEqual([
      "projects",
      "projects/nested",
      "projects/a.md",
    ]);
  });

  it("falls back to a synthetic note node when metadata is unavailable", () => {
    const tree = sort_tree(build_filetree([], []));

    const nodes = derive_starred_tree({
      tree,
      starred_paths: ["missing.md"],
      expanded_node_ids: new Set(),
      load_states: new Map(),
      error_messages: new Map(),
      show_hidden_files: true,
      pagination: new Map(),
    });

    expect(nodes[0]).toMatchObject({
      path: "missing.md",
      is_folder: false,
    });
    expect(nodes[0]?.note?.path).toBe("missing.md");
    expect(nodes[0]?.note?.title).toBe("missing");
  });
});
