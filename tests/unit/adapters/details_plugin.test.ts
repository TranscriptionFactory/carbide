import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import type { Node as ProsemirrorNode } from "prosemirror-model";

function expect_defined<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeTruthy();
  return value as T;
}

function details_node(doc: ProsemirrorNode): ProsemirrorNode {
  return expect_defined(doc.firstChild, "details block");
}

function child_node(node: ProsemirrorNode, index: number, label: string) {
  return expect_defined(node.child(index), label);
}

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
    const details = details_node(doc);
    expect(details.type.name).toBe("details_block");
    expect(details.attrs["open"]).toBe(false);

    const summary = child_node(details, 0, "details summary");
    expect(summary.type.name).toBe("details_summary");
    expect(summary.textContent).toBe("Click me");

    const content = child_node(details, 1, "details content");
    expect(content.type.name).toBe("details_content");
    const paragraph = expect_defined(content.firstChild, "details paragraph");
    expect(paragraph.type.name).toBe("paragraph");
    expect(paragraph.textContent).toBe("Hello world");
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
    const details = details_node(doc);
    expect(details.attrs["open"]).toBe(true);
  });

  it("parses details with no summary tag", () => {
    const md = ["<details>", "", "Just body", "", "</details>"].join("\n");

    const doc = parse_markdown(md);
    const details = details_node(doc);
    expect(details.type.name).toBe("details_block");

    const summary = child_node(details, 0, "details summary");
    expect(summary.textContent).toBe("Details");
  });

  it("parses details with empty body", () => {
    const md = ["<details>", "<summary>Title</summary>", "</details>"].join(
      "\n",
    );

    const doc = parse_markdown(md);
    const details = details_node(doc);
    expect(details.type.name).toBe("details_block");

    const content = child_node(details, 1, "details content");
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
    const details = details_node(doc);
    const content = child_node(details, 1, "details content");

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
    const outer = details_node(doc);
    expect(outer.type.name).toBe("details_block");
    expect(child_node(outer, 0, "outer summary").textContent).toBe("Outer");

    const outer_content = child_node(outer, 1, "outer content");
    const inner = expect_defined(outer_content.firstChild, "inner details");
    expect(inner.type.name).toBe("details_block");
    expect(child_node(inner, 0, "inner summary").textContent).toBe("Inner");
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
    const details = details_node(doc);
    expect(details.childCount).toBe(2);
    expect(child_node(details, 0, "details summary").type.name).toBe(
      "details_summary",
    );
    expect(child_node(details, 1, "details content").type.name).toBe(
      "details_content",
    );
  });
});
