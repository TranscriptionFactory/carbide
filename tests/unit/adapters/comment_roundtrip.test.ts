import { describe, it, expect } from "vitest";
import type { Node as ProseNode } from "prosemirror-model";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";

function roundtrip(markdown: string): string {
  return serialize_markdown(parse_markdown(markdown));
}

function expect_byte_identical(input: string) {
  const once = roundtrip(input);
  expect(once).toBe(`${input}\n`);
  expect(roundtrip(once)).toBe(once);
}

function block_types(doc: ProseNode): string[] {
  const types: string[] = [];
  doc.forEach((child) => types.push(child.type.name));
  return types;
}

function inline_types(block: ProseNode): string[] {
  const types: string[] = [];
  block.forEach((child) => types.push(child.type.name));
  return types;
}

describe("inline comments", () => {
  it("keeps an inline comment as plain text and round-trips it", () => {
    const input = "text %%hidden%% more";
    expect(parse_markdown(input).child(0).textContent).toBe(input);
    expect_byte_identical(input);
  });

  it("round-trips a comment spanning emphasis, keeping the mark", () => {
    const input = "a %%x *b* y%% tail";
    const para = parse_markdown(input).child(0);
    expect(para.textContent).toBe("a %%x b y%% tail");
    expect(para.child(1).marks.map((m) => m.type.name)).toEqual(["em"]);
    expect_byte_identical(input);
  });

  it("keeps a one-line comment at the start of a paragraph as a paragraph", () => {
    const input = "%%c%% *italic*";
    expect(block_types(parse_markdown(input))).toEqual(["paragraph"]);
    expect_byte_identical(input);
  });
});

describe("block comments", () => {
  it("parses a multi-line comment into a comment_block holding its source", () => {
    const input = "%%\nblock\ncomment\n%%";
    const doc = parse_markdown(input);
    expect(block_types(doc)).toEqual(["comment_block"]);
    expect(doc.child(0).textContent).toBe(input);
    expect_byte_identical(input);
  });

  it("keeps blank lines and Markdown inside a comment verbatim", () => {
    const input =
      "before\n\n%%\nhidden\n\nTitle\n===\n\n* star item\n\n__bold__\n%%\n\nafter";
    const doc = parse_markdown(input);
    expect(block_types(doc)).toEqual([
      "paragraph",
      "comment_block",
      "paragraph",
    ]);
    expect(doc.child(1).textContent).toBe(
      "%%\nhidden\n\nTitle\n===\n\n* star item\n\n__bold__\n%%",
    );
    expect_byte_identical(input);
  });

  it("swallows the rest of the line holding the closing marker", () => {
    const input = "%%\nhidden\n%% trailing *text*\n\nafter";
    const doc = parse_markdown(input);
    expect(block_types(doc)).toEqual(["comment_block", "paragraph"]);
    expect(doc.child(0).textContent).toBe("%%\nhidden\n%% trailing *text*");
    expect_byte_identical(input);
  });

  it("runs an unclosed comment to the end of the note", () => {
    const input = "intro\n\n%%\nrest __x__\n\n* list\n\n# Heading";
    const doc = parse_markdown(input);
    expect(block_types(doc)).toEqual(["paragraph", "comment_block"]);
    expect(doc.child(1).textContent).toBe(
      "%%\nrest __x__\n\n* list\n\n# Heading",
    );
    expect_byte_identical(input);
  });

  it("serializes an edited comment_block verbatim", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.comment_block.create(null, schema.text("%%\n* edited\n%%")),
      schema.nodes.paragraph.create(null, schema.text("after")),
    ]);
    expect(serialize_markdown(doc)).toBe("%%\n* edited\n%%\n\nafter\n");
  });
});

describe("escaped comment markers", () => {
  it("round-trips backslash-escaped markers unchanged", () => {
    expect_byte_identical("show \\%%literal\\%% here");
    expect_byte_identical("both \\%\\% escaped");
  });

  it("keeps escaped markers out of the comment text", () => {
    const para = parse_markdown("show \\%%literal\\%% here").child(0);
    expect(inline_types(para)).toEqual([
      "text",
      "raw_inline",
      "text",
      "raw_inline",
      "text",
    ]);
    expect(para.child(1).attrs["value"]).toBe("\\%");
  });

  it("round-trips escaped markers inside a blockquote and emphasis", () => {
    expect_byte_identical("> quoted\n> \\%%not a comment\\%%");
    expect_byte_identical("*a \\%% b*");
  });

  it("leaves an escaped backslash before a real marker alone", () => {
    const input = "a \\\\%%real%% b";
    expect(inline_types(parse_markdown(input).child(0))).toEqual(["text"]);
    expect_byte_identical(input);
  });

  it("does not open a block comment behind an escaped marker", () => {
    const input = "\\%%\nnot a comment";
    expect(block_types(parse_markdown(input))).toEqual(["paragraph"]);
    expect_byte_identical(input);
  });
});

describe("comment markers inside code", () => {
  it("leaves %% in inline code and fenced code untouched", () => {
    const input = "Use `%%x%%` here\n\n```\n%%\ncode\n%%\n```";
    const doc = parse_markdown(input);
    expect(block_types(doc)).toEqual(["paragraph", "code_block"]);
    expect(doc.child(1).textContent).toBe("%%\ncode\n%%");
    expect_byte_identical(input);
  });
});
