import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { find_inline_math_in_text } from "$lib/features/editor/adapters/math_plugin";

describe("find_inline_math_in_text", () => {
  it("matches inline math at end of text", () => {
    const result = find_inline_math_in_text("hello $E=mc^2$");
    expect(result).toEqual({
      content: "E=mc^2",
      match_start: 6,
      match_end: 14,
    });
  });

  it("matches inline math at start of text", () => {
    const result = find_inline_math_in_text("$x^2$");
    expect(result).toEqual({
      content: "x^2",
      match_start: 0,
      match_end: 5,
    });
  });

  it("returns null for unclosed dollar sign", () => {
    expect(find_inline_math_in_text("hello $x^2")).toBeNull();
  });

  it("returns null for empty math content", () => {
    expect(find_inline_math_in_text("hello $$")).toBeNull();
  });

  it("returns null when preceded by backslash (escaped dollar)", () => {
    expect(find_inline_math_in_text("hello \\$x$")).toBeNull();
  });

  it("returns null when preceded by dollar (double dollar)", () => {
    expect(find_inline_math_in_text("hello $$x$")).toBeNull();
  });

  it("matches math with LaTeX commands", () => {
    const result = find_inline_math_in_text("the $\\frac{1}{2}$");
    expect(result).toEqual({
      content: "\\frac{1}{2}",
      match_start: 4,
      match_end: 17,
    });
  });

  it("returns null for text without dollar signs", () => {
    expect(find_inline_math_in_text("hello world")).toBeNull();
  });

  it("returns null for multiline content (newline inside dollars)", () => {
    expect(find_inline_math_in_text("$x\ny$")).toBeNull();
  });
});

function create_schema() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0] as const,
        parseDOM: [{ tag: "p" }],
      },
      math_inline: {
        group: "inline",
        inline: true,
        atom: true,
        content: "text*",
        toDOM: () => ["span", { "data-type": "math_inline" }, 0] as const,
        parseDOM: [{ tag: "span[data-type='math_inline']" }],
      },
      text: { group: "inline" },
    },
  });
}

describe("inline math conversion via appendTransaction", () => {
  it("converts $content$ to math_inline node when typed", () => {
    const schema = create_schema();
    const paragraph = schema.nodes["paragraph"];
    const math_inline = schema.nodes["math_inline"];

    const doc_with_text = schema.nodes["doc"].create(null, [
      paragraph.create(null, [schema.text("hello $x^2$")]),
    ]);

    const state = EditorState.create({ doc: doc_with_text });
    const text = "hello $x^2$";
    const result = find_inline_math_in_text(text);

    expect(result).not.toBeNull();
    expect(result!.content).toBe("x^2");

    const math_node = math_inline.create(null, schema.text(result!.content));
    expect(math_node.type.name).toBe("math_inline");
    expect(math_node.textContent).toBe("x^2");
  });
});
