import { describe, expect, it } from "vitest";
import { extract_local_links } from "$lib/features/links/domain/extract_local_links";

describe("extract_local_links", () => {
  it("extracts standard markdown links as outlink paths", () => {
    const md = "See [other note](./notes/other.md) for details.";
    const result = extract_local_links(md);

    expect(result.outlink_paths).toContain("./notes/other.md");
    expect(result.external_links).toEqual([]);
  });

  it("strips fragment from local link paths", () => {
    const md = "[section](./notes/other.md#heading)";
    const result = extract_local_links(md);

    expect(result.outlink_paths).toContain("./notes/other.md");
  });

  it("extracts external URLs as external links", () => {
    const md =
      "Visit [Example](https://example.com) and [Google](http://google.com).";
    const result = extract_local_links(md);

    expect(result.external_links).toEqual([
      { url: "https://example.com", text: "Example" },
      { url: "http://google.com", text: "Google" },
    ]);
    expect(result.outlink_paths).toEqual([]);
  });

  it("extracts wikilinks as outlink paths", () => {
    const md = "Link to [[other note]] and [[folder/nested]].";
    const result = extract_local_links(md);

    expect(result.outlink_paths).toContain("other note");
    expect(result.outlink_paths).toContain("folder/nested");
  });

  it("extracts wikilinks with display text", () => {
    const md = "Link to [[target|display text]].";
    const result = extract_local_links(md);

    expect(result.outlink_paths).toContain("target");
  });

  it("deduplicates outlink paths", () => {
    const md = "[[note]] and [[note]] again.";
    const result = extract_local_links(md);

    expect(result.outlink_paths.filter((p) => p === "note")).toHaveLength(1);
  });

  it("deduplicates external links by URL", () => {
    const md = "[A](https://example.com) and [B](https://example.com).";
    const result = extract_local_links(md);

    expect(result.external_links).toHaveLength(1);
  });

  it("returns empty for plain text without links", () => {
    const md = "Just some plain text with no links.";
    const result = extract_local_links(md);

    expect(result.outlink_paths).toEqual([]);
    expect(result.external_links).toEqual([]);
  });

  it("handles mixed local and external links", () => {
    const md =
      "See [docs](./docs.md), [[wiki page]], and [site](https://example.com).";
    const result = extract_local_links(md);

    expect(result.outlink_paths).toContain("./docs.md");
    expect(result.outlink_paths).toContain("wiki page");
    expect(result.external_links).toEqual([
      { url: "https://example.com", text: "site" },
    ]);
  });

  it("separates attachment paths from outlink paths (markdown links)", () => {
    const md =
      "See [report](doc.pdf) and [photo](images/photo.png) and [note](related.md).";
    const result = extract_local_links(md);

    expect(result.attachment_paths).toContain("doc.pdf");
    expect(result.attachment_paths).toContain("images/photo.png");
    expect(result.outlink_paths).toContain("related.md");
    expect(result.outlink_paths).not.toContain("doc.pdf");
    expect(result.outlink_paths).not.toContain("images/photo.png");
  });

  it("separates attachment paths from outlink paths (wikilinks)", () => {
    const md = "Embed [[image.png]] and link [[other note]].";
    const result = extract_local_links(md);

    expect(result.attachment_paths).toContain("image.png");
    expect(result.outlink_paths).toContain("other note");
    expect(result.outlink_paths).not.toContain("image.png");
  });

  it("deduplicates attachment paths", () => {
    const md = "[[photo.jpg]] and [[photo.jpg]] again.";
    const result = extract_local_links(md);

    expect(
      result.attachment_paths.filter((p) => p === "photo.jpg"),
    ).toHaveLength(1);
  });

  it("returns empty attachment_paths for plain text", () => {
    const md = "Just some plain text.";
    const result = extract_local_links(md);

    expect(result.attachment_paths).toEqual([]);
  });
});
