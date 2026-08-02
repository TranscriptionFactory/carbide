import { describe, expect, it } from "vitest";
import {
  normalize_folder_scope,
  normalize_tag_scope,
  normalize_base_scope,
  path_in_folder,
  scope_phrase,
  to_retrieval_scope,
} from "$lib/features/assistant/domain/chat_scope";
import type { RetrievalScope } from "$lib/features/assistant";

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

  it("names a scoped note by title rather than by path", () => {
    expect(scope_phrase({ notes: ["projects/Hybrid Retrieval.md"] })).toBe(
      'the note "Hybrid Retrieval"',
    );
  });

  it("pluralizes and joins multiple notes", () => {
    expect(scope_phrase({ notes: ["a/One.md", "b/Two.md"] })).toBe(
      'the notes "One" and "Two"',
    );
  });

  it("leads with the note when it is combined with a wider dimension", () => {
    expect(
      scope_phrase({ notes: ["Daily/Today.md"], folders: ["Daily"] }),
    ).toBe('the note "Today" and the folder "Daily"');
  });
});

// The seam's precondition. Rag inlines a bare startsWith under the port, so an
// unnormalized folder would silently under-match and quietly narrow the user's
// scope rather than throwing. RetrievalScope is branded and this is its only
// constructor, so the compiler — not these tests — is what makes skipping it
// impossible; a hand-built `{ folders: ["projects"] }` does not typecheck as a
// RetrievalScope. These cases pin the normalization itself.
describe("to_retrieval_scope", () => {
  it("normalizes every category into the shape retrieval matches on", () => {
    expect(
      to_retrieval_scope({
        folders: ["/projects/"],
        tags: ["#work"],
        bases: ["  views/active.base  "],
        notes: ["  notes/hybrid-retrieval.md  "],
      }),
    ).toEqual({
      folders: ["projects/"],
      tags: ["work"],
      bases: ["views/active.base"],
      notes: ["notes/hybrid-retrieval.md"],
    });
  });

  // Unlike a folder, a note path is matched whole, so there is no prefix shape
  // to canonicalize — trimming is the entire normalization, and the path must
  // survive it byte for byte or the exact match silently stops matching.
  it("carries a note path through unchanged apart from surrounding whitespace", () => {
    expect(to_retrieval_scope({ notes: ["a/b/Deep Note.md"] }).notes).toEqual([
      "a/b/Deep Note.md",
    ]);
  });

  it("gives folders the trailing slash that makes prefix matching correct", () => {
    const scope = to_retrieval_scope({ folders: ["projects"] });

    expect(scope.folders).toEqual(["projects/"]);
    expect("projects-archive/a.md".startsWith(scope.folders?.[0] ?? "")).toBe(
      false,
    );
  });

  it("drops empty entries rather than emitting a filter that matches nothing", () => {
    expect(
      to_retrieval_scope({
        folders: ["", "  "],
        tags: ["#"],
        bases: [""],
        notes: ["", "   "],
      }),
    ).toEqual({ folders: [], tags: [], bases: [], notes: [] });
  });

  // Compile-time half of the precondition, and the reason the runtime cases
  // above are a formality rather than the guarantee. If the brand is ever
  // dropped from RetrievalScope this directive becomes unused and `pnpm check`
  // fails, which is the loud failure the silent under-match would not give us.
  it("cannot be bypassed by handing the port a raw scope literal", () => {
    const accepts = (scope: RetrievalScope) => scope;

    // @ts-expect-error a scope that skipped to_retrieval_scope is not a RetrievalScope
    expect(() => accepts({ folders: ["projects"] })).not.toThrow();
  });

  it("yields empty categories for an unset scope", () => {
    expect(to_retrieval_scope({})).toEqual({
      folders: [],
      tags: [],
      bases: [],
      notes: [],
    });
  });
});
