import { describe, expect, it } from "vitest";
import {
  is_resolved_wiki_link_target,
  resolve_wiki_link_target,
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
