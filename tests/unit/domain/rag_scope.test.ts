import { describe, expect, it } from "vitest";
import {
  normalize_folder_scope,
  normalize_tag_scope,
  normalize_base_scope,
  path_in_folder,
  scope_phrase,
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

describe("scope_phrase", () => {
  it("falls back to the whole vault when scope is empty", () => {
    expect(scope_phrase({})).toBe("my vault");
  });

  it("names a single folder without trailing slash", () => {
    expect(scope_phrase({ folders: ["Projects/"] })).toBe(
      'the folder "Projects"',
    );
  });

  it("pluralizes and joins multiple folders", () => {
    expect(scope_phrase({ folders: ["A", "B"] })).toBe(
      'the folders "A" and "B"',
    );
  });

  it("renders tags with a leading hash, deduping existing hashes", () => {
    expect(scope_phrase({ tags: ["#work", "ml"] })).toBe(
      "notes tagged #work and #ml",
    );
  });

  it("combines folders, tags, and bases into one phrase", () => {
    expect(
      scope_phrase({
        folders: ["Daily"],
        tags: ["journal"],
        bases: ["Reading"],
      }),
    ).toBe('the folder "Daily", notes tagged #journal and the "Reading" view');
  });
});
