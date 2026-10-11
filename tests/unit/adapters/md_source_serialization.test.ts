import { describe, it, expect } from "vitest";
import type { Mark, Node as ProseNode } from "prosemirror-model";
import {
  parse_markdown,
  schema,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

const md_source = schema.marks.md_source.create();

function doc_of(...inline: ProseNode[]): ProseNode {
  return schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, inline),
  ]);
}

function text(value: string, marks: readonly Mark[] = []): ProseNode {
  return schema.text(value, marks);
}

describe("md_source mark serialization", () => {
  it("serializes source text byte-identical to the formatted run it stands for", () => {
    const formatted = doc_of(
      text("a "),
      text("bold", [schema.marks.strong.create()]),
      text(" b"),
    );
    const source = doc_of(
      text("a "),
      text("**bold**", [md_source]),
      text(" b"),
    );

    expect(serialize_markdown(source)).toBe(serialize_markdown(formatted));
    expect(serialize_markdown(source)).toBe("a **bold** b\n");
  });

  it("never writes the mark itself: the output re-parses without it", () => {
    const source = doc_of(text("x "), text("*em*", [md_source]));
    const reparsed = parse_markdown(serialize_markdown(source));

    let has_mark = false;
    reparsed.descendants((node) => {
      if (schema.marks.md_source.isInSet(node.marks)) has_mark = true;
    });
    expect(has_mark).toBe(false);
  });

  it("stays separate from html_inline: source inside an inline tag keeps the tag", () => {
    const formatted = parse_markdown("<u>**x**</u> y");
    const u_mark = formatted
      .child(0)
      .child(0)
      .marks.find((m) => m.type.name === "html_inline");
    expect(u_mark).toBeDefined();
    const marks = u_mark ? [u_mark] : [];
    const source = doc_of(text("**x**", [...marks, md_source]), text(" y"));

    expect(serialize_markdown(source)).toBe(serialize_markdown(formatted));
    expect(schema.marks.md_source.excludes(schema.marks.html_inline)).toBe(
      false,
    );
  });
});
