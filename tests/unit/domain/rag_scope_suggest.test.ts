import { describe, expect, it } from "vitest";
import { build_scope_suggestions } from "$lib/features/rag/domain/rag_scope_suggest";
import type { ScopeSources } from "$lib/features/rag/domain/rag_scope_suggest";

const sources: ScopeSources = {
  folder_paths: ["projects", "projects/alpha", "archive"],
  tags: [
    { tag: "active", count: 5 },
    { tag: "project/active", count: 2 },
    { tag: "idea", count: 1 },
  ],
  saved_views: [
    { name: "Active Projects", path: "views/active.base" },
    { name: "Reading List", path: "views/reading.base" },
  ],
};

describe("build_scope_suggestions", () => {
  it("matches folders by prefix", () => {
    const { folders } = build_scope_suggestions("projects", sources, {});
    expect(folders.map((f) => f.value)).toEqual(["projects", "projects/alpha"]);
    expect(folders[0]).toMatchObject({ kind: "folder", label: "projects" });
  });

  it("labels folder root suggestion when query is empty", () => {
    const { folders } = build_scope_suggestions("", sources, {});
    expect(folders[0]).toMatchObject({ value: "", label: "(vault root)" });
  });

  it("ranks tags and renders them with a hash prefix and count hint", () => {
    const { tags } = build_scope_suggestions("active", sources, {});
    const active = tags.find((t) => t.value === "active");
    expect(active).toMatchObject({
      kind: "tag",
      label: "#active",
      hint: "5",
    });
  });

  it("matches bases by substring on name", () => {
    const { bases } = build_scope_suggestions("active", sources, {});
    expect(bases).toEqual([
      { kind: "base", value: "views/active.base", label: "Active Projects" },
    ]);
  });

  it("returns no tag suggestions for an empty query", () => {
    const { tags } = build_scope_suggestions("", sources, {});
    expect(tags).toEqual([]);
  });

  it("excludes items already selected", () => {
    const result = build_scope_suggestions("", sources, {
      folders: ["projects"],
      bases: ["views/active.base"],
    });
    expect(result.folders.map((f) => f.value)).not.toContain("projects");
    expect(result.bases.map((b) => b.value)).not.toContain("views/active.base");
    expect(result.bases.map((b) => b.value)).toContain("views/reading.base");
  });
});
