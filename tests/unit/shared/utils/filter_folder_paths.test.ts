import { describe, it, expect } from "vitest";
import {
  filter_folder_paths,
  normalize_folder_query,
} from "$lib/shared/utils/filter_folder_paths";

const folders = [
  "folder1",
  "folder1/folder2",
  "folder1/folder2/folder3",
  "other",
];

describe("filter_folder_paths drill-down", () => {
  it("lists nested subfolders when drilling into a parent with a trailing slash", () => {
    const result = filter_folder_paths("folder1/", folders);
    expect(result).toContain("folder1/folder2");
    expect(result).not.toContain("other");
  });

  it("drills deeper into a grandchild folder", () => {
    expect(filter_folder_paths("folder1/folder2/", folders)).toContain(
      "folder1/folder2/folder3",
    );
  });

  it("matches case-insensitively", () => {
    expect(filter_folder_paths("FOLDER1", folders)).toContain("folder1");
  });

  it("offers the vault root and folders for an empty query", () => {
    const result = filter_folder_paths("", folders);
    expect(result[0]).toBe("");
    expect(result).toContain("folder1");
  });

  it("normalizes a trailing slash off the query", () => {
    expect(normalize_folder_query("folder1/")).toBe("folder1");
  });
});
