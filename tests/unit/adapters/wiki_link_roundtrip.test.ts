import { describe, it, expect } from "vitest";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

function serialize_wiki_link(input: { href: string; display: string }): string {
  const paragraph = schema.nodes.paragraph.create(null, [
    schema.text(input.display, [
      schema.marks.link.create({ href: input.href, link_source: "wiki" }),
    ]),
  ]);
  const doc = schema.nodes.doc.create(null, [paragraph]);
  return serialize_markdown(doc).trim();
}

describe("wiki link serialization", () => {
  it("writes a plain wiki link back as [[note]]", () => {
    expect(serialize_wiki_link({ href: "note.md", display: "note" })).toBe(
      "[[note]]",
    );
  });

  it("writes a heading anchor back as [[note#Heading]]", () => {
    expect(
      serialize_wiki_link({
        href: "note.md#Heading",
        display: "note > Heading",
      }),
    ).toBe("[[note#Heading]]");
  });

  it("writes a same-note anchor back as [[#Heading]]", () => {
    expect(serialize_wiki_link({ href: "#Heading", display: "Heading" })).toBe(
      "[[#Heading]]",
    );
  });

  it("writes a block anchor back as [[note#^id]]", () => {
    expect(
      serialize_wiki_link({
        href: "note.md#^abc123",
        display: "note > ^abc123",
      }),
    ).toBe("[[note#^abc123]]");
  });

  it("keeps a custom label as [[target|label]]", () => {
    expect(
      serialize_wiki_link({ href: "note.md#Heading", display: "Read this" }),
    ).toBe("[[note#Heading|Read this]]");
  });

  it("leaves markdown links untouched", () => {
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text("note", [
        schema.marks.link.create({
          href: "note.md",
          link_source: "markdown",
        }),
      ]),
    ]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    expect(serialize_markdown(doc).trim()).toBe("[note](note.md)");
  });

  it("normalizes a palette-inserted path to its display form", () => {
    expect(
      serialize_wiki_link({
        href: "folder/note.md#Heading",
        display: "folder/note > Heading",
      }),
    ).toBe("[[folder/note#Heading]]");
  });

  it("re-parses its own output back to the same markdown", () => {
    const written = serialize_wiki_link({
      href: "note.md#Heading",
      display: "note > Heading",
    });
    const reparsed = serialize_markdown(parse_markdown(written)).trim();
    expect(reparsed).toBe(written);
  });
});
