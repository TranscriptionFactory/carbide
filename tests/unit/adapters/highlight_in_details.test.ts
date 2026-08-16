import { describe, it, expect } from "vitest";
import { parse_to_mdast } from "$lib/features/editor/adapters/markdown_pipeline";

const SELF_CONTAINED_HIGHLIGHT =
  "<details><summary>S</summary>Some ==marked== text</details>\n";
const BLANK_LINE_HIGHLIGHT =
  "<details>\n<summary>S</summary>\n\nSome ==marked== text\n\n</details>\n";
const SELF_CONTAINED_CALLOUT =
  "<details><summary>S</summary>\n> [!note]\n> body\n</details>\n";
const BLANK_LINE_CALLOUT =
  "<details>\n<summary>S</summary>\n\n> [!note]\n> body\n\n</details>\n";

function has_type(node: unknown, type: string): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { type?: string; children?: unknown[] };
  if (n.type === type) return true;
  if (!Array.isArray(n.children)) return false;
  return n.children.some((child) => has_type(child, type));
}

function has_nested_type(node: unknown, outer: string, inner: string): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { type?: string; children?: unknown[] };
  if (n.type === outer && has_type(n, inner)) return true;
  if (!Array.isArray(n.children)) return false;
  return n.children.some((child) => has_nested_type(child, outer, inner));
}

function highlighted_values(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== "object") return found;
  const n = node as { type?: string; children?: unknown[]; value?: string };
  if (n.type === "highlight") {
    found.push(
      (n.children ?? [])
        .map((child) => (child as { value?: string }).value ?? "")
        .join(""),
    );
  }
  if (Array.isArray(n.children)) {
    for (const child of n.children) highlighted_values(child, found);
  }
  return found;
}

describe("highlight inside a details body", () => {
  it("highlights ==marked== in a self-contained one-line details", () => {
    const tree = parse_to_mdast(SELF_CONTAINED_HIGHLIGHT);
    expect(has_type(tree, "details")).toBe(true);
    expect(has_nested_type(tree, "detailsContent", "highlight")).toBe(true);
    expect(highlighted_values(tree)).toEqual(["marked"]);
  });

  it("highlights ==marked== in a blank-line-form details", () => {
    const tree = parse_to_mdast(BLANK_LINE_HIGHLIGHT);
    expect(has_type(tree, "details")).toBe(true);
    expect(has_nested_type(tree, "detailsContent", "highlight")).toBe(true);
    expect(highlighted_values(tree)).toEqual(["marked"]);
  });

  it("still highlights ==marked== at top level", () => {
    const tree = parse_to_mdast("Some ==marked== text\n");
    expect(highlighted_values(tree)).toEqual(["marked"]);
  });
});

describe("callout inside a details body", () => {
  it("parses a callout in a self-contained one-line details", () => {
    const tree = parse_to_mdast(SELF_CONTAINED_CALLOUT);
    expect(has_type(tree, "details")).toBe(true);
    expect(has_nested_type(tree, "detailsContent", "callout")).toBe(true);
  });

  it("parses a callout in a blank-line-form details", () => {
    const tree = parse_to_mdast(BLANK_LINE_CALLOUT);
    expect(has_type(tree, "details")).toBe(true);
    expect(has_nested_type(tree, "detailsContent", "callout")).toBe(true);
  });
});

// remark_highlight now runs after remark_details and remark_callout. It rewrites
// `text` nodes wherever they sit, so every container that already highlighted
// must keep doing so.
describe("highlight in other containers is unaffected by plugin order", () => {
  it("highlights inside a callout body", () => {
    const tree = parse_to_mdast("> [!note]\n> Some ==marked== text\n");
    expect(has_nested_type(tree, "callout", "highlight")).toBe(true);
  });

  it("highlights inside a blockquote", () => {
    const tree = parse_to_mdast("> Some ==marked== text\n");
    expect(has_nested_type(tree, "blockquote", "highlight")).toBe(true);
  });

  it("highlights inside a table cell", () => {
    const tree = parse_to_mdast("| a | b |\n| --- | --- |\n| ==x== | y |\n");
    expect(has_nested_type(tree, "tableCell", "highlight")).toBe(true);
  });

  it("highlights inside a list item", () => {
    const tree = parse_to_mdast("- Some ==marked== text\n");
    expect(has_nested_type(tree, "listItem", "highlight")).toBe(true);
  });
});
