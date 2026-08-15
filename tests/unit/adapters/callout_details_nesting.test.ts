import { describe, it, expect } from "vitest";
import type { Node as PmNode } from "prosemirror-model";
import type { Root } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { remark_callout } from "$lib/features/editor/adapters/remark_plugins/remark_callout";
import { remark_details } from "$lib/features/editor/adapters/remark_plugins/remark_details";

const CALLOUT_IN_CALLOUT = "> [!note]\n> > [!warning]\n> > inner";
const CALLOUT_IN_BLOCKQUOTE = "> > [!warning]\n> > inner";
const DETAILS_IN_CALLOUT =
  "> [!note] Outer\n> <details>\n> <summary>S</summary>\n>\n> body\n>\n> </details>";
const CALLOUT_IN_MULTILINE_DETAILS =
  "<details>\n<summary>S</summary>\n\n> [!warning] Inner\n> text\n\n</details>";
const CALLOUT_IN_SELF_CONTAINED_DETAILS =
  "<details><summary>S</summary>\n> [!warning] Inner\n> text\n</details>";
const DETAILS_IN_DETAILS_IN_CALLOUT =
  "> [!note] Outer\n> <details>\n> <summary>A</summary>\n>\n> <details>\n> <summary>B</summary>\n>\n> deep\n>\n> </details>\n>\n> </details>";

function collect_type_names(doc: PmNode): string[] {
  const names: string[] = [];
  doc.descendants((node) => {
    names.push(node.type.name);
    return true;
  });
  return names;
}

function body_of(node: PmNode): PmNode {
  return node.child(1);
}

function mdast_outline(node: unknown, depth = 0): string {
  const n = node as { type: string; children?: unknown[]; value?: string };
  const indent = "  ".repeat(depth);
  const value = n.value === undefined ? "" : ` ${JSON.stringify(n.value)}`;
  const children = Array.isArray(n.children)
    ? n.children.map((child) => mdast_outline(child, depth + 1)).join("\n")
    : "";
  return `${indent}${n.type}${value}${children ? "\n" + children : ""}`;
}

function parse_with_plugin_order(
  markdown: string,
  details_first: boolean,
): string {
  const base = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
  const processor = details_first
    ? base.use(remark_details).use(remark_callout)
    : base.use(remark_callout).use(remark_details);
  return mdast_outline(processor.runSync(processor.parse(markdown)) as Root);
}

describe("callout nested in a callout", () => {
  it("parses an inner callout directive into a nested callout node", () => {
    const outer = parse_markdown(CALLOUT_IN_CALLOUT).child(0);
    expect(outer.type.name).toBe("callout");
    expect(outer.child(0).textContent).toBe("Note");

    const inner = body_of(outer).child(0);
    expect(inner.type.name).toBe("callout");
    expect(inner.child(0).textContent).toBe("Warning");
    expect(body_of(inner).textContent).toBe("inner");
  });
});

describe("callout nested in a plain blockquote", () => {
  it("parses the inner directive into a callout inside the blockquote", () => {
    const quote = parse_markdown(CALLOUT_IN_BLOCKQUOTE).child(0);
    expect(quote.type.name).toBe("blockquote");

    const callout = quote.child(0);
    expect(callout.type.name).toBe("callout");
    expect(callout.child(0).textContent).toBe("Warning");
    expect(body_of(callout).textContent).toBe("inner");
  });
});

describe("details nested in a callout", () => {
  it("parses a details block inside a callout body instead of raw HTML", () => {
    const doc = parse_markdown(DETAILS_IN_CALLOUT);
    const callout = doc.child(0);
    expect(callout.type.name).toBe("callout");

    const details = body_of(callout).child(0);
    expect(details.type.name).toBe("details_block");
    expect(details.child(0).textContent).toBe("S");
    expect(body_of(details).textContent).toBe("body");
    expect(collect_type_names(doc)).not.toContain("raw_block");
  });

  it("keeps the details depth counter working two levels deep", () => {
    const doc = parse_markdown(DETAILS_IN_DETAILS_IN_CALLOUT);
    const callout = doc.child(0);
    expect(callout.type.name).toBe("callout");

    const outer_details = body_of(callout).child(0);
    expect(outer_details.type.name).toBe("details_block");
    expect(outer_details.child(0).textContent).toBe("A");

    const inner_details = body_of(outer_details).child(0);
    expect(inner_details.type.name).toBe("details_block");
    expect(inner_details.child(0).textContent).toBe("B");
    expect(body_of(inner_details).textContent).toBe("deep");
    expect(collect_type_names(doc)).not.toContain("raw_block");
  });
});

describe("callout nested in a details block", () => {
  it("parses a callout inside a multi-line details block", () => {
    const details = parse_markdown(CALLOUT_IN_MULTILINE_DETAILS).child(0);
    expect(details.type.name).toBe("details_block");

    const callout = body_of(details).child(0);
    expect(callout.type.name).toBe("callout");
    expect(callout.child(0).textContent).toBe("Inner");
    expect(body_of(callout).textContent).toBe("text");
  });

  it("parses a callout inside a self-contained details block", () => {
    const details = parse_markdown(CALLOUT_IN_SELF_CONTAINED_DETAILS).child(0);
    expect(details.type.name).toBe("details_block");

    const callout = body_of(details).child(0);
    expect(callout.type.name).toBe("callout");
    expect(callout.child(0).textContent).toBe("Inner");
  });
});

describe("nesting recursion leaves inline HTML alone", () => {
  it("keeps a mid-sentence <details> tag as inline content", () => {
    const source = "Use the <details> and <summary> tags in HTML.";
    const doc = parse_markdown(source);
    expect(doc.child(0).type.name).toBe("paragraph");
    expect(collect_type_names(doc)).not.toContain("details_block");
    expect(serialize_markdown(doc).trimEnd()).toBe(source);
  });
});

describe("plugin order independence", () => {
  const cases: Array<[string, string]> = [
    ["callout in callout", CALLOUT_IN_CALLOUT],
    ["details in callout", DETAILS_IN_CALLOUT],
    ["callout in multi-line details", CALLOUT_IN_MULTILINE_DETAILS],
    ["details in details in callout", DETAILS_IN_DETAILS_IN_CALLOUT],
  ];

  for (const [name, markdown] of cases) {
    it(`builds the same tree in either plugin order for ${name}`, () => {
      expect(parse_with_plugin_order(markdown, false)).toBe(
        parse_with_plugin_order(markdown, true),
      );
    });
  }
});

describe("nested callout and details round-trips", () => {
  // The self-contained one-line form is the only fixture that is not already
  // canonical: serializing normalizes it to the multi-line spelling.
  const cases: Array<{ name: string; markdown: string; expected: string }> = [
    {
      name: "callout in callout",
      markdown: CALLOUT_IN_CALLOUT,
      expected: CALLOUT_IN_CALLOUT,
    },
    {
      name: "callout in blockquote",
      markdown: CALLOUT_IN_BLOCKQUOTE,
      expected: CALLOUT_IN_BLOCKQUOTE,
    },
    {
      name: "details in callout",
      markdown: DETAILS_IN_CALLOUT,
      expected: DETAILS_IN_CALLOUT,
    },
    {
      name: "callout in multi-line details",
      markdown: CALLOUT_IN_MULTILINE_DETAILS,
      expected: CALLOUT_IN_MULTILINE_DETAILS,
    },
    {
      name: "callout in self-contained details",
      markdown: CALLOUT_IN_SELF_CONTAINED_DETAILS,
      expected: CALLOUT_IN_MULTILINE_DETAILS,
    },
    {
      name: "details in details in callout",
      markdown: DETAILS_IN_DETAILS_IN_CALLOUT,
      expected: DETAILS_IN_DETAILS_IN_CALLOUT,
    },
  ];

  for (const { name, markdown, expected } of cases) {
    it(`reaches a serialization fixed point for ${name}`, () => {
      const once = serialize_markdown(parse_markdown(markdown));
      expect(once.trimEnd()).toBe(expected.trimEnd());
      expect(serialize_markdown(parse_markdown(once))).toBe(once);
    });
  }
});
