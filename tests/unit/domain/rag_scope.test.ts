import { describe, expect, it } from "vitest";
import {
  normalize_folder_scope,
  normalize_tag_scope,
  normalize_base_scope,
  migrate_scope,
  path_in_folder,
} from "$lib/features/rag/domain/rag_scope";

describe("normalize_folder_scope", () => {
  it("returns null for empty or whitespace input", () => {
    expect(normalize_folder_scope("")).toBeNull();
    expect(normalize_folder_scope("   ")).toBeNull();
    expect(normalize_folder_scope(null)).toBeNull();
    expect(normalize_folder_scope(undefined)).toBeNull();
  });

  it("trims surrounding slashes and appends a single trailing slash", () => {
    expect(normalize_folder_scope("projects")).toBe("projects/");
    expect(normalize_folder_scope("/projects/")).toBe("projects/");
    expect(normalize_folder_scope("  work/active  ")).toBe("work/active/");
  });
});

describe("normalize_tag_scope", () => {
  it("returns null for empty or whitespace input", () => {
    expect(normalize_tag_scope("")).toBeNull();
    expect(normalize_tag_scope("   ")).toBeNull();
    expect(normalize_tag_scope("#")).toBeNull();
    expect(normalize_tag_scope(null)).toBeNull();
    expect(normalize_tag_scope(undefined)).toBeNull();
  });

  it("trims whitespace and strips a leading hash", () => {
    expect(normalize_tag_scope("active")).toBe("active");
    expect(normalize_tag_scope("#active")).toBe("active");
    expect(normalize_tag_scope("  #project/active  ")).toBe("project/active");
  });
});

describe("normalize_base_scope", () => {
  it("returns null for empty or whitespace input", () => {
    expect(normalize_base_scope("")).toBeNull();
    expect(normalize_base_scope("   ")).toBeNull();
    expect(normalize_base_scope(null)).toBeNull();
    expect(normalize_base_scope(undefined)).toBeNull();
  });

  it("trims surrounding whitespace and keeps the path", () => {
    expect(normalize_base_scope("views/active.base")).toBe("views/active.base");
    expect(normalize_base_scope("  views/active.base  ")).toBe(
      "views/active.base",
    );
  });
});

describe("migrate_scope", () => {
  it("coerces legacy single-value folder and tag into arrays", () => {
    expect(migrate_scope({ folder: "projects", tag: "active" })).toEqual({
      folders: ["projects"],
      tags: ["active"],
    });
  });

  it("drops legacy empty values", () => {
    expect(migrate_scope({ folder: "", tag: "  " })).toEqual({});
    expect(migrate_scope({ folder: "projects", tag: "" })).toEqual({
      folders: ["projects"],
    });
  });

  it("passes array shapes through unchanged", () => {
    expect(
      migrate_scope({
        folders: ["a", "b"],
        tags: ["t"],
        bases: ["views/x.base"],
      }),
    ).toEqual({ folders: ["a", "b"], tags: ["t"], bases: ["views/x.base"] });
  });

  it("returns an empty scope for empty or invalid input", () => {
    expect(migrate_scope({})).toEqual({});
    expect(migrate_scope(null)).toEqual({});
    expect(migrate_scope(undefined)).toEqual({});
  });
});

describe("path_in_folder", () => {
  it("matches notes under the folder prefix", () => {
    expect(path_in_folder("projects/alpha.md", "projects/")).toBe(true);
    expect(path_in_folder("projects/sub/beta.md", "projects/")).toBe(true);
  });

  it("rejects notes outside the folder prefix", () => {
    expect(path_in_folder("archive/old.md", "projects/")).toBe(false);
    expect(path_in_folder("projectsX/note.md", "projects/")).toBe(false);
  });
});
