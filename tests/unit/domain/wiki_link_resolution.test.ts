import { describe, expect, it } from "vitest";
import {
  is_resolved_wiki_link_target,
  resolve_wiki_link_target,
  resolve_wiki_link_note_path,
  resolve_wiki_file_target,
} from "$lib/features/editor/domain/wiki_link_resolution";

describe("resolve_wiki_link_target", () => {
  it("returns the docName on direct page-set membership", () => {
    const pages = new Set(["README", "docs/getting-started"]);
    expect(resolve_wiki_link_target("README", pages)).toBe("README");
    expect(resolve_wiki_link_target("docs/getting-started", pages)).toBe(
      "docs/getting-started",
    );
  });

  it("returns the case-preserved docName when target is a slug-form alias", () => {
    const pages = new Set(["README"]);
    expect(resolve_wiki_link_target("readme", pages)).toBe("README");
  });

  it("returns undefined for absent targets", () => {
    const pages = new Set(["README"]);
    expect(resolve_wiki_link_target("does-not-exist", pages)).toBeUndefined();
    expect(resolve_wiki_link_target("", pages)).toBeUndefined();
    expect(resolve_wiki_link_target("   ", pages)).toBeUndefined();
  });

  it("handles human-readable targets via slug match", () => {
    const pages = new Set(["nonexistent-page"]);
    expect(resolve_wiki_link_target("Nonexistent Page", pages)).toBe(
      "nonexistent-page",
    );
  });

  it("resolves underscore/case filenames via slug", () => {
    const pages = new Set(["BA_for_Depression_Research"]);
    expect(resolve_wiki_link_target("ba-for-depression-research", pages)).toBe(
      "BA_for_Depression_Research",
    );
  });

  it("matches a same-basename file in a subfolder", () => {
    const pages = new Set(["andrew-data/project-x/analysis"]);
    expect(resolve_wiki_link_target("analysis", pages)).toBe(
      "andrew-data/project-x/analysis",
    );
  });

  it("alphabetical-first tie-break across colliding basenames", () => {
    const pages = new Set(["z/foo", "a/foo", "m/foo"]);
    expect(resolve_wiki_link_target("foo", pages)).toBe("a/foo");
  });

  it("slug-normalized basename matches a Title Case subfolder file", () => {
    const pages = new Set(["subfolder/Project X"]);
    expect(resolve_wiki_link_target("project x", pages)).toBe(
      "subfolder/Project X",
    );
  });

  it("ignores path-shaped targets in the basename branch", () => {
    const pages = new Set(["other/foo"]);
    expect(resolve_wiki_link_target("sub/foo", pages)).toBeUndefined();
  });

  it("exact docName match wins over a same-basename subfolder file", () => {
    const pages = new Set(["foo", "sub/foo"]);
    expect(resolve_wiki_link_target("foo", pages)).toBe("foo");
  });

  it("canonical folder-index wins over basename", () => {
    const pages = new Set(["reports/index", "other/reports"]);
    expect(resolve_wiki_link_target("reports", pages)).toBe("reports/index");
  });

  it("legacy folder note wins over basename", () => {
    const pages = new Set(["reports/reports", "other/reports"]);
    expect(resolve_wiki_link_target("reports", pages)).toBe("reports/reports");
  });

  it("canonical folder-index resolves a path-shaped target", () => {
    const pages = new Set(["docs/api/index"]);
    expect(resolve_wiki_link_target("docs/api", pages)).toBe("docs/api/index");
  });

  it("legacy folder note resolves a path-shaped target", () => {
    const pages = new Set(["docs/api/api"]);
    expect(resolve_wiki_link_target("docs/api", pages)).toBe("docs/api/api");
  });
});

describe("resolve_wiki_link_note_path", () => {
  const paths = [
    "README.md",
    "docs/getting-started.md",
    "andrew-data/project-x/analysis.md",
  ];

  it("returns the full note path for an exact vault-relative target", () => {
    expect(resolve_wiki_link_note_path("README.md", paths)).toBe("README.md");
    expect(resolve_wiki_link_note_path("docs/getting-started.md", paths)).toBe(
      "docs/getting-started.md",
    );
  });

  it("resolves a bare basename target to a subfolder note", () => {
    expect(resolve_wiki_link_note_path("analysis.md", paths)).toBe(
      "andrew-data/project-x/analysis.md",
    );
    expect(resolve_wiki_link_note_path("analysis", paths)).toBe(
      "andrew-data/project-x/analysis.md",
    );
  });

  it("resolves case-mismatched targets", () => {
    expect(resolve_wiki_link_note_path("readme", paths)).toBe("README.md");
    expect(resolve_wiki_link_note_path("readme.md", paths)).toBe("README.md");
  });

  it("strips fragment and query suffixes before resolving", () => {
    expect(resolve_wiki_link_note_path("analysis#Results", paths)).toBe(
      "andrew-data/project-x/analysis.md",
    );
    expect(resolve_wiki_link_note_path("analysis?x=1", paths)).toBe(
      "andrew-data/project-x/analysis.md",
    );
  });

  it("returns null for absent or empty targets", () => {
    expect(resolve_wiki_link_note_path("missing.md", paths)).toBeNull();
    expect(resolve_wiki_link_note_path("", paths)).toBeNull();
    expect(resolve_wiki_link_note_path("   ", paths)).toBeNull();
  });
});

describe("resolve_wiki_file_target", () => {
  const files = [
    "papers/deep-learning.pdf",
    "media/Talk Recording.mp4",
    "root.pdf",
  ];

  it("returns an exact vault-relative path unchanged", () => {
    expect(resolve_wiki_file_target("root.pdf", files)).toBe("root.pdf");
    expect(resolve_wiki_file_target("papers/deep-learning.pdf", files)).toBe(
      "papers/deep-learning.pdf",
    );
  });

  it("resolves a bare filename to its subfolder path", () => {
    expect(resolve_wiki_file_target("deep-learning.pdf", files)).toBe(
      "papers/deep-learning.pdf",
    );
  });

  it("matches basenames case-insensitively", () => {
    expect(resolve_wiki_file_target("talk recording.mp4", files)).toBe(
      "media/Talk Recording.mp4",
    );
  });

  it("matches full paths case-insensitively", () => {
    expect(resolve_wiki_file_target("PAPERS/Deep-Learning.PDF", files)).toBe(
      "papers/deep-learning.pdf",
    );
  });

  it("tie-breaks colliding basenames alphabetically", () => {
    const colliding = ["z/scan.pdf", "a/scan.pdf", "m/scan.pdf"];
    expect(resolve_wiki_file_target("scan.pdf", colliding)).toBe("a/scan.pdf");
  });

  it("does not basename-match path-shaped targets", () => {
    expect(
      resolve_wiki_file_target("wrong-folder/deep-learning.pdf", files),
    ).toBeUndefined();
  });

  it("returns undefined for absent or empty targets", () => {
    expect(resolve_wiki_file_target("missing.pdf", files)).toBeUndefined();
    expect(resolve_wiki_file_target("", files)).toBeUndefined();
    expect(resolve_wiki_file_target("   ", files)).toBeUndefined();
  });
});

describe("is_resolved_wiki_link_target", () => {
  it("matches exact doc names and slug-equivalent human labels", () => {
    const pages = new Set(["test-doc", "nonexistent-page"]);
    expect(is_resolved_wiki_link_target("test-doc", pages)).toBe(true);
    expect(is_resolved_wiki_link_target("Nonexistent Page", pages)).toBe(true);
    expect(is_resolved_wiki_link_target("Missing Page", pages)).toBe(false);
  });

  it("resolves case-insensitively against case-preserved entries", () => {
    const pages = new Set(["README"]);
    expect(is_resolved_wiki_link_target("readme", pages)).toBe(true);
    expect(is_resolved_wiki_link_target("README", pages)).toBe(true);
  });

  it("resolves a bare-name → subfolder basename match", () => {
    const pages = new Set(["andrew-data/project-x/analysis"]);
    expect(is_resolved_wiki_link_target("analysis", pages)).toBe(true);
  });

  it("resolves subdirectory-preserving docNames case-insensitively", () => {
    const pages = new Set(["packages/server/README"]);
    expect(is_resolved_wiki_link_target("packages/server/README", pages)).toBe(
      true,
    );
    expect(is_resolved_wiki_link_target("packages/server/readme", pages)).toBe(
      true,
    );
  });

  it("never resolves empty / whitespace targets", () => {
    const pages = new Set(["README"]);
    expect(is_resolved_wiki_link_target("", pages)).toBe(false);
    expect(is_resolved_wiki_link_target("   ", pages)).toBe(false);
  });

  it("does not match a path-shaped target via basename", () => {
    const pages = new Set(["other/foo"]);
    expect(is_resolved_wiki_link_target("sub/foo", pages)).toBe(false);
  });
});
