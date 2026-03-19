import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

describe("details_block markdown parsing", () => {
  it("parses basic <details> with summary and body", () => {
    const md = [
      "<details>",
      "<summary>Click me</summary>",
      "",
      "Hello world",
      "",
      "</details>",
    ].join("\n");

    const doc = parse_markdown(md);
    const details = doc.firstChild;
    expect(details).toBeTruthy();
    expect(details!.type.name).toBe("details_block");
    expect(details!.attrs["open"]).toBe(false);

    const summary = details!.child(0);
    expect(summary.type.name).toBe("details_summary");
    expect(summary.textContent).toBe("Click me");

    const content = details!.child(1);
    expect(content.type.name).toBe("details_content");
    expect(content.firstChild!.type.name).toBe("paragraph");
    expect(content.firstChild!.textContent).toBe("Hello world");
  });

  it("parses <details open> attribute", () => {
    const md = [
      "<details open>",
      "<summary>Expanded</summary>",
      "",
      "Body",
      "",
      "</details>",
    ].join("\n");

    const doc = parse_markdown(md);
    const details = doc.firstChild;
    expect(details!.attrs["open"]).toBe(true);
  });

  it("parses details with no summary tag", () => {
    const md = ["<details>", "", "Just body", "", "</details>"].join("\n");

    const doc = parse_markdown(md);
    const details = doc.firstChild;
    expect(details).toBeTruthy();
    expect(details!.type.name).toBe("details_block");

    const summary = details!.child(0);
    expect(summary.textContent).toBe("Details");
  });

  it("parses details with empty body", () => {
    const md = ["<details>", "<summary>Title</summary>", "</details>"].join(
      "\n",
    );

    const doc = parse_markdown(md);
    const details = doc.firstChild;
    expect(details).toBeTruthy();
    expect(details!.type.name).toBe("details_block");

    const content = details!.child(1);
    expect(content.type.name).toBe("details_content");
    expect(content.childCount).toBeGreaterThanOrEqual(1);
  });

  it("parses details with markdown body content", () => {
    const md = [
      "<details>",
      "<summary>Section</summary>",
      "",
      "## Heading",
      "",
      "- Item 1",
      "- Item 2",
      "",
      "</details>",
    ].join("\n");

    const doc = parse_markdown(md);
    const details = doc.firstChild;
    const content = details!.child(1);

    const child_types = [];
    for (let i = 0; i < content.childCount; i++) {
      child_types.push(content.child(i).type.name);
    }
    expect(child_types).toContain("heading");
    expect(child_types).toContain("bullet_list");
  });

  it("parses nested details blocks", () => {
    const md = [
      "<details>",
      "<summary>Outer</summary>",
      "",
      "<details>",
      "<summary>Inner</summary>",
      "",
      "Nested content",
      "",
      "</details>",
      "",
      "</details>",
    ].join("\n");

    const doc = parse_markdown(md);
    const outer = doc.firstChild;
    expect(outer!.type.name).toBe("details_block");
    expect(outer!.child(0).textContent).toBe("Outer");

    const outer_content = outer!.child(1);
    const inner = outer_content.firstChild;
    expect(inner!.type.name).toBe("details_block");
    expect(inner!.child(0).textContent).toBe("Inner");
  });
});

describe("details_block markdown serialization", () => {
  it("round-trips basic details block", () => {
    const md = [
      "<details>",
      "<summary>Click me</summary>",
      "",
      "Hello world",
      "",
      "</details>",
    ].join("\n");

    const doc = parse_markdown(md);
    const output = serialize_markdown(doc);

    expect(output).toContain("<details>");
    expect(output).toContain("<summary>Click me</summary>");
    expect(output).toContain("Hello world");
    expect(output).toContain("</details>");
  });

  it("round-trips open attribute", () => {
    const md = [
      "<details open>",
      "<summary>Expanded</summary>",
      "",
      "Body",
      "",
      "</details>",
    ].join("\n");

    const doc = parse_markdown(md);
    const output = serialize_markdown(doc);
    expect(output).toContain("<details open>");
  });

  it("round-trips details with markdown content", () => {
    const md = [
      "<details>",
      "<summary>Section</summary>",
      "",
      "## Heading",
      "",
      "- Item 1",
      "- Item 2",
      "",
      "</details>",
    ].join("\n");

    const doc = parse_markdown(md);
    const output = serialize_markdown(doc);

    expect(output).toContain("<details>");
    expect(output).toContain("<summary>Section</summary>");
    expect(output).toContain("## Heading");
    expect(output).toContain("- Item 1");
    expect(output).toContain("</details>");
  });

  it("round-trips nested details", () => {
    const md = [
      "<details>",
      "<summary>Outer</summary>",
      "",
      "<details>",
      "<summary>Inner</summary>",
      "",
      "Nested",
      "",
      "</details>",
      "",
      "</details>",
    ].join("\n");

    const doc = parse_markdown(md);
    const output = serialize_markdown(doc);

    const details_count = (output.match(/<details>/g) || []).length;
    const close_count = (output.match(/<\/details>/g) || []).length;
    expect(details_count).toBe(2);
    expect(close_count).toBe(2);
    expect(output).toContain("<summary>Outer</summary>");
    expect(output).toContain("<summary>Inner</summary>");
  });
});

describe("details_block schema validation", () => {
  it("creates valid details_block structure", () => {
    const md = [
      "<details>",
      "<summary>Test</summary>",
      "",
      "Content",
      "",
      "</details>",
    ].join("\n");

    const doc = parse_markdown(md);
    const details = doc.firstChild;
    expect(details!.childCount).toBe(2);
    expect(details!.child(0).type.name).toBe("details_summary");
    expect(details!.child(1).type.name).toBe("details_content");
  });
});
