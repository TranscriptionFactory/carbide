import { describe, expect, it } from "vitest";
import { classify_html_link } from "$lib/features/document/domain/html_link";

describe("classify_html_link", () => {
  it("classifies supported external links", () => {
    expect(classify_html_link("https://example.com", "docs/a.html")).toEqual({
      kind: "external",
      url: "https://example.com",
    });
    expect(
      classify_html_link("mailto:a@example.com", "docs/a.html")?.kind,
    ).toBe("external");
  });

  it("resolves fragments and relative vault paths", () => {
    expect(classify_html_link("#part", "docs/a.html")).toEqual({
      kind: "fragment",
      fragment: "part",
    });
    expect(classify_html_link("../note.md#part", "docs/a.html")).toEqual({
      kind: "vault",
      path: "note.md",
      fragment: "part",
    });
  });

  it("rejects active and internal schemes", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,x",
      "blob:x",
      "file:///x",
      "carbide-html://live/x",
    ]) {
      expect(classify_html_link(href, "a.html")).toBeNull();
    }
  });

  it("rejects malformed percent encoding", () => {
    expect(classify_html_link("#%", "docs/a.html")).toBeNull();
    expect(classify_html_link("foo%ZZ.html", "docs/a.html")).toBeNull();
  });
});
