import { describe, it, expect } from "vitest";
import type { Node as PmNode } from "prosemirror-model";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

const IFRAME = '<iframe src="https://example.com"></iframe>';

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

describe("wiki embeds inside callouts", () => {
  it("converts an embed in a callout body instead of leaving it as text", () => {
    const callout = parse_markdown("> [!note] T\n>\n> ![[img.png]]").child(0);
    expect(callout.type.name).toBe("callout");
    expect(body_of(callout).child(0).type.name).toBe("file_embed");
  });

  it("converts an embed in a nested callout body", () => {
    const outer = parse_markdown(
      "> [!note] T\n> > [!warning] I\n> >\n> > ![[img.png]]",
    ).child(0);
    const inner = body_of(outer).child(0);
    expect(inner.type.name).toBe("callout");
    expect(body_of(inner).child(0).type.name).toBe("file_embed");
  });

  it("does not escape the embed syntax when serializing from a callout", () => {
    const source = "> [!note] T\n>\n> ![[img.png]]";
    const once = serialize_markdown(parse_markdown(source));
    expect(once).toContain("> ![[img.png]]");
    expect(once).not.toContain("\\![[");
    expect(serialize_markdown(parse_markdown(once))).toBe(once);
  });
});

describe("wiki embeds inside details blocks", () => {
  it("converts an embed in a details body", () => {
    const details = parse_markdown(
      "<details>\n<summary>S</summary>\n\n![[img.png]]\n\n</details>",
    ).child(0);
    expect(details.type.name).toBe("details_block");
    expect(body_of(details).child(0).type.name).toBe("file_embed");
  });
});

describe("html embeds inside callouts", () => {
  it("converts an iframe in a callout body instead of leaving raw HTML", () => {
    const doc = parse_markdown(`> [!note] T\n>\n> ${IFRAME}`);
    const callout = doc.child(0);
    expect(callout.type.name).toBe("callout");
    expect(body_of(callout).child(0).type.name).toBe("web_embed");
    expect(collect_type_names(doc)).not.toContain("raw_block");
  });

  it("converts an iframe in a nested callout body", () => {
    const outer = parse_markdown(
      `> [!note] T\n> > [!warning] I\n> >\n> > ${IFRAME}`,
    ).child(0);
    const inner = body_of(outer).child(0);
    expect(inner.type.name).toBe("callout");
    expect(body_of(inner).child(0).type.name).toBe("web_embed");
  });
});

describe("html embeds inside details blocks", () => {
  it("converts an iframe in a details body", () => {
    const doc = parse_markdown(
      `<details>\n<summary>S</summary>\n\n${IFRAME}\n\n</details>`,
    );
    const details = doc.child(0);
    expect(details.type.name).toBe("details_block");
    expect(body_of(details).child(0).type.name).toBe("web_embed");
    expect(collect_type_names(doc)).not.toContain("raw_block");
  });
});

describe("embeds in containers the walkers already handled", () => {
  const cases: Array<[string, string, string]> = [
    ["wiki embed at top level", "![[img.png]]", "file_embed"],
    ["wiki embed in a blockquote", "> ![[img.png]]", "file_embed"],
    ["wiki embed in a list item", "- ![[img.png]]", "file_embed"],
    ["html embed at top level", IFRAME, "web_embed"],
    ["html embed in a blockquote", `> ${IFRAME}`, "web_embed"],
  ];

  for (const [name, markdown, expected] of cases) {
    it(`still converts a ${name}`, () => {
      expect(collect_type_names(parse_markdown(markdown))).toContain(expected);
    });
  }
});
