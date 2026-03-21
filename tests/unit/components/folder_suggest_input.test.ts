import { describe, expect, it } from "vitest";

function longest_common_prefix(paths: string[]): string {
  if (paths.length === 0) return "";
  let prefix = paths[0] ?? "";
  for (let i = 1; i < paths.length; i++) {
    const p = paths[i] ?? "";
    let j = 0;
    while (j < prefix.length && j < p.length && prefix[j] === p[j]) j++;
    prefix = prefix.slice(0, j);
  }
  return prefix;
}

function filter_folders(query: string, folder_paths: string[]): string[] {
  const q = query.toLowerCase().replace(/\/$/, "");
  const candidates = ["", ...folder_paths];
  if (q === "" || q === "/") return candidates.slice(0, 10);
  return candidates
    .filter((p) => p.toLowerCase().startsWith(q))
    .slice(0, 10);
}

describe("folder suggest filtering", () => {
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
    const result = filter_folders("", folders);
    expect(result[0]).toBe("");
    expect(result).toContain("archive");
    expect(result).toContain("docs");
    expect(result).toContain("notes");
  });

  it("filters by prefix", () => {
    const result = filter_folders("doc", folders);
    expect(result).toEqual(["docs", "docs/api", "docs/guides"]);
  });

  it("filters case-insensitively", () => {
    const result = filter_folders("DOC", folders);
    expect(result).toEqual(["docs", "docs/api", "docs/guides"]);
  });

  it("matches deep paths", () => {
    const result = filter_folders("notes/d", folders);
    expect(result).toEqual(["notes/daily", "notes/daily/2024"]);
  });

  it("strips trailing slash from query", () => {
    const result = filter_folders("docs/", folders);
    expect(result).toEqual(["docs", "docs/api", "docs/guides"]);
  });

  it("limits to 10 results", () => {
    const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
    const result = filter_folders("", many);
    expect(result.length).toBe(10);
  });

  it("returns empty for no matches", () => {
    const result = filter_folders("nonexistent", folders);
    expect(result).toEqual([]);
  });
});

describe("longest common prefix", () => {
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
    expect(
      longest_common_prefix(["notes/daily", "notes/daily/2024"]),
    ).toBe("notes/daily");
  });
});
