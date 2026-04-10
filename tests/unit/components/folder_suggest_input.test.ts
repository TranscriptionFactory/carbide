import { describe, expect, it } from "vitest";
import { longest_common_prefix } from "$lib/shared/utils/longest_common_prefix";
import { filter_folder_paths } from "$lib/shared/utils/filter_folder_paths";

describe("filter_folder_paths", () => {
  const folders = [
    "archive",
    "docs",
    "docs/api",
    "docs/guides",
    "notes",
    "notes/daily",
    "notes/daily/2024",
    "notes/weekly",
    "projects",
  ];

  it("returns root + all top-level folders for empty query", () => {
    const result = filter_folder_paths("", folders);
    expect(result[0]).toBe("");
    expect(result).toContain("archive");
    expect(result).toContain("docs");
    expect(result).toContain("notes");
  });

  it("filters by prefix", () => {
    const result = filter_folder_paths("doc", folders);
    expect(result).toEqual(["docs", "docs/api", "docs/guides"]);
  });

  it("filters case-insensitively", () => {
    const result = filter_folder_paths("DOC", folders);
    expect(result).toEqual(["docs", "docs/api", "docs/guides"]);
  });

  it("matches deep paths", () => {
    const result = filter_folder_paths("notes/d", folders);
    expect(result).toEqual(["notes/daily", "notes/daily/2024"]);
  });

  it("strips trailing slash from query", () => {
    const result = filter_folder_paths("docs/", folders);
    expect(result).toEqual(["docs", "docs/api", "docs/guides"]);
  });

  it("limits to 10 results", () => {
    const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
    const result = filter_folder_paths("", many);
    expect(result.length).toBe(10);
  });

  it("returns empty for no matches", () => {
    const result = filter_folder_paths("nonexistent", folders);
    expect(result).toEqual([]);
  });

  it("matches nested paths typed with intermediate slash", () => {
    const result = filter_folder_paths("notes/d", folders);
    expect(result).toEqual(["notes/daily", "notes/daily/2024"]);
  });

  it("trailing slash shows parent and children", () => {
    const result = filter_folder_paths("notes/", folders);
    expect(result).toContain("notes");
    expect(result).toContain("notes/daily");
    expect(result).toContain("notes/weekly");
  });

  it("deeply nested trailing slash filters correctly", () => {
    const result = filter_folder_paths("notes/daily/", folders);
    expect(result).toContain("notes/daily");
    expect(result).toContain("notes/daily/2024");
  });
});

describe("longest_common_prefix", () => {
  it("returns empty for empty array", () => {
    expect(longest_common_prefix([])).toBe("");
  });

  it("returns the single path for single-element array", () => {
    expect(longest_common_prefix(["docs/api"])).toBe("docs/api");
  });

  it("finds common prefix", () => {
    expect(longest_common_prefix(["docs/api", "docs/guides"])).toBe("docs/");
  });

  it("returns empty when no common prefix", () => {
    expect(longest_common_prefix(["alpha", "beta"])).toBe("");
  });

  it("handles exact matches", () => {
    expect(longest_common_prefix(["notes", "notes"])).toBe("notes");
  });

  it("handles nested paths", () => {
    expect(longest_common_prefix(["notes/daily", "notes/daily/2024"])).toBe(
      "notes/daily",
    );
  });
});
