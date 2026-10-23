import { describe, it, expect } from "vitest";
import type { Node as PmNode } from "prosemirror-model";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";

function round_trip(markdown: string): string {
  return serialize_markdown(parse_markdown(markdown));
}

function first_node(markdown: string, type: string): PmNode {
  let found: PmNode | null = null;
  parse_markdown(markdown).descendants((node) => {
    if (!found && node.type.name === type) found = node;
    return !found;
  });
  if (!found) throw new Error(`no ${type} parsed from ${markdown}`);
  return found;
}

function serialize_block(node: PmNode): string {
  return serialize_markdown(schema.nodes.doc.create(null, [node])).trim();
}

describe("embed and image size syntax round-trips byte-for-byte", () => {
  it.each([
    "![[x.html#height=240]]\n",
    "![[note|height=300]]\n",
    "![[note|collapsed|height=300]]\n",
    "![[note#Heading|height=300]]\n",
    "![[drawing.excalidraw|height=320]]\n",
    "![alt|300](a.png)\n",
    "![|300](a.png)\n",
    "see ![alt|120](a.png) inline\n",
    "```mermaid height=300\ngraph TD; A-->B\n```\n",
    "```html collapsed height=200\n<p>x</p>\n```\n",
    "```js preview height=96\nconst x = 1;\n```\n",
  ])("%j", (markdown) => {
    expect(round_trip(markdown)).toBe(markdown);
  });
});

describe("notes without size syntax stay byte-identical", () => {
  it.each([
    "![[x.html]]\n",
    "![[doc.pdf#page=2]]\n",
    "![[note]]\n",
    "![[note|collapsed]]\n",
    "![[note|alias]]\n",
    "![[drawing.excalidraw]]\n",
    "![[x.html|height=300]]\n",
    "![alt](a.png)\n",
    "![a|b](a.png)\n",
    "![w|300px](a.png)\n",
    '![alt](a.png "title")\n',
    "```mermaid\ngraph TD; A-->B\n```\n",
    "```js height=abc\nconst x = 1;\n```\n",
    "```\nplain\n```\n",
  ])("%j", (markdown) => {
    expect(round_trip(markdown)).toBe(markdown);
  });

  it("parses a document of unsized embeds without size attrs", () => {
    const doc = parse_markdown(
      "![[note]]\n\n![[d.excalidraw]]\n\n![a](a.png)\n\n```js\nx\n```\n",
    );
    const sizes: unknown[] = [];
    doc.descendants((node) => {
      if ("height" in node.attrs && node.type.name !== "file_embed")
        sizes.push(node.attrs["height"]);
      if (node.type.name === "image") sizes.push(node.attrs["width"]);
    });
    expect(sizes).toEqual([null, null, "", null]);
  });
});

describe("size syntax parses into node attrs", () => {
  it("reads note embed height and collapse in either order", () => {
    for (const md of [
      "![[note|collapsed|height=300]]",
      "![[note|height=300|collapsed]]",
    ]) {
      const node = first_node(md, "note_embed");
      expect(node.attrs).toMatchObject({
        src: "note.md",
        display_src: "note",
        collapsed: true,
        height: 300,
      });
    }
  });

  it("writes collapse before height", () => {
    expect(round_trip("![[note|height=300|collapsed]]\n")).toBe(
      "![[note|collapsed|height=300]]\n",
    );
  });

  it("reads excalidraw height", () => {
    const node = first_node("![[d.excalidraw|height=250]]", "excalidraw_embed");
    expect(node.attrs).toEqual({ src: "d.excalidraw", height: 250 });
  });

  it("keeps a height tail on a file target as part of the target", () => {
    const node = first_node("![[x.html|height=300]]", "note_embed");
    expect(node.attrs["display_src"]).toBe("x.html|height=300");
    expect(node.attrs["height"]).toBeNull();
  });

  it("reads image width from the Obsidian alt suffix", () => {
    const node = first_node("![Cat photo|300](cat.png)", "image");
    expect(node.attrs).toMatchObject({ alt: "Cat photo", width: "300px" });
  });

  it("moves the fence height token off meta into the height attr", () => {
    const node = first_node(
      "```html preview height=200\n<p/>\n```",
      "code_block",
    );
    expect(node.attrs).toMatchObject({ meta: "preview", height: 200 });
  });

  it("leaves a malformed fence height in meta", () => {
    const node = first_node("```js height=abc\nx\n```", "code_block");
    expect(node.attrs).toMatchObject({ meta: "height=abc", height: null });
  });
});

describe("cleared sizes remove the syntax", () => {
  it("drops note embed height", () => {
    const node = schema.nodes.note_embed.create({
      src: "note.md",
      display_src: "note",
      collapsed: true,
      height: null,
    });
    expect(serialize_block(node)).toBe("![[note|collapsed]]");
  });

  it("drops excalidraw height", () => {
    const node = schema.nodes.excalidraw_embed.create({
      src: "d.excalidraw",
      height: null,
    });
    expect(serialize_block(node)).toBe("![[d.excalidraw]]");
  });

  it("drops file embed height at the default", () => {
    const node = schema.nodes.file_embed.create({
      src: "x.html",
      file_type: "html",
      height: 400,
    });
    expect(serialize_block(node)).toBe("![[x.html]]");
  });

  it("drops code block height", () => {
    const node = schema.nodes.code_block.create(
      { language: "mermaid", meta: "", height: null },
      schema.text("graph TD"),
    );
    expect(serialize_block(node)).toBe("```mermaid\ngraph TD\n```");
  });

  it("drops image width", () => {
    const node = schema.nodes["image-block"].create({
      src: "a.png",
      alt: "a",
      width: "",
    });
    expect(serialize_block(node)).toBe("![a](a.png)");
  });
});

describe("resized widths serialize", () => {
  it("writes an image-block pixel width as the alt suffix", () => {
    const node = schema.nodes["image-block"].create({
      src: "a.png",
      alt: "a",
      width: "320px",
    });
    expect(serialize_block(node)).toBe("![a|320](a.png)");
  });

  it("does not write a percent width, which has no markdown form", () => {
    const node = schema.nodes["image-block"].create({
      src: "a.png",
      alt: "a",
      width: "50%",
    });
    expect(serialize_block(node)).toBe("![a](a.png)");
  });

  it("writes a resized code block height into the fence", () => {
    const node = schema.nodes.code_block.create(
      { language: "html", meta: "preview", height: 240 },
      schema.text("<p/>"),
    );
    expect(serialize_block(node)).toBe("```html preview height=240\n<p/>\n```");
  });
});
