import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";

describe("wiki embed markdown roundtrip", () => {
  it("round-trips ![[image.png]]", () => {
    const input = "![[image.png]]";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toBe(input);
  });

  it("round-trips ![[doc.pdf#page=2&height=600]]", () => {
    const input = "![[doc.pdf#page=2&height=600]]";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toBe(input);
  });

  it("produces note_embed for extensionless target", () => {
    const input = "![[My Note]]";
    const doc = parse_markdown(input);
    const node = doc.firstChild;
    expect(node?.type.name).toBe("note_embed");
    expect(node?.attrs["src"]).toBe("My Note.md");
    expect(node?.attrs["display_src"]).toBe("My Note");
  });

  it("produces excalidraw_embed for .excalidraw", () => {
    const input = "![[drawing.excalidraw]]";
    const doc = parse_markdown(input);
    const node = doc.firstChild;
    expect(node?.type.name).toBe("excalidraw_embed");
    expect(node?.attrs["src"]).toBe("drawing.excalidraw");
  });

  it("produces excalidraw_embed for .canvas", () => {
    const input = "![[board.canvas]]";
    const doc = parse_markdown(input);
    const node = doc.firstChild;
    expect(node?.type.name).toBe("excalidraw_embed");
    expect(node?.attrs["src"]).toBe("board.canvas");
  });

  it("round-trips ![[image.png]] inside a list item", () => {
    const input = "- ![[image.png]]";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc).trim();
    expect(output).toBe(input);
  });

  it("produces file_embed with correct attrs for image", () => {
    const input = "![[photo.jpg]]";
    const doc = parse_markdown(input);
    const node = doc.firstChild;
    expect(node?.type.name).toBe("file_embed");
    expect(node?.attrs["src"]).toBe("photo.jpg");
    expect(node?.attrs["file_type"]).toBe("image");
  });

  it("produces file_embed with parsed fragment params", () => {
    const input = "![[doc.pdf#page=3&height=500]]";
    const doc = parse_markdown(input);
    const node = doc.firstChild;
    expect(node?.type.name).toBe("file_embed");
    expect(node?.attrs["src"]).toBe("doc.pdf");
    expect(node?.attrs["file_type"]).toBe("pdf");
    expect(node?.attrs["page"]).toBe(3);
    expect(node?.attrs["height"]).toBe(500);
  });

  it("round-trips note_embed with fragment", () => {
    const input = "![[My Note#section]]";
    const doc = parse_markdown(input);
    const node = doc.firstChild;
    expect(node?.type.name).toBe("note_embed");
    expect(node?.attrs["fragment"]).toBe("section");
    const output = serialize_markdown(doc).trim();
    expect(output).toBe(input);
  });
});

describe("wiki embed PM-level roundtrip", () => {
  it("file_embed PM node → serialize → parse → same PM node", () => {
    const embed = schema.nodes.file_embed.create({
      src: "image.png",
      file_type: "image",
      page: null,
      height: 400,
    });
    const doc = schema.nodes.doc.create(null, [embed]);
    const md = serialize_markdown(doc).trim();
    expect(md).toBe("![[image.png]]");

    const reparsed = parse_markdown(md);
    const node = reparsed.firstChild;
    expect(node?.type.name).toBe("file_embed");
    expect(node?.attrs["src"]).toBe("image.png");
    expect(node?.attrs["file_type"]).toBe("image");
  });

  it("note_embed PM node → serialize → parse → same PM node", () => {
    const embed = schema.nodes.note_embed.create({
      src: "Todo.md",
      fragment: null,
      display_src: "Todo",
    });
    const doc = schema.nodes.doc.create(null, [embed]);
    const md = serialize_markdown(doc).trim();
    expect(md).toBe("![[Todo]]");

    const reparsed = parse_markdown(md);
    const node = reparsed.firstChild;
    expect(node?.type.name).toBe("note_embed");
    expect(node?.attrs["src"]).toBe("Todo.md");
  });

  it("excalidraw_embed PM node → serialize → parse → same PM node", () => {
    const embed = schema.nodes.excalidraw_embed.create({
      src: "diagram.excalidraw",
    });
    const doc = schema.nodes.doc.create(null, [embed]);
    const md = serialize_markdown(doc).trim();
    expect(md).toBe("![[diagram.excalidraw]]");

    const reparsed = parse_markdown(md);
    const node = reparsed.firstChild;
    expect(node?.type.name).toBe("excalidraw_embed");
    expect(node?.attrs["src"]).toBe("diagram.excalidraw");
  });
});
