import { describe, expect, it } from "vitest";
import { Schema, type Node as ProseNode } from "prosemirror-model";
import { find_inline_tag_ranges } from "$lib/features/editor/domain/tag_ranges";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    code_block: { group: "block", content: "text*", marks: "" },
    frontmatter: { group: "block", content: "text*", marks: "" },
    text: { group: "inline" },
  },
  marks: {
    strong: {},
    code_inline: {},
  },
});

function paragraph_doc(
  text_runs: ReadonlyArray<{ text: string; mark?: "strong" | "code_inline" }>,
): ProseNode {
  return schema.node("doc", null, [
    schema.node(
      "paragraph",
      null,
      text_runs.map((run) =>
        schema.text(run.text, run.mark ? [schema.mark(run.mark)] : undefined),
      ),
    ),
  ]);
}

describe("find_inline_tag_ranges", () => {
  it("detects a tag at the start of a paragraph", () => {
    const doc = paragraph_doc([{ text: "#alpha beta" }]);
    expect(find_inline_tag_ranges(doc)).toEqual([
      { from: 1, to: 7, tag: "alpha" },
    ]);
  });

  it("detects multiple whitespace-separated tags with exact positions", () => {
    const doc = paragraph_doc([{ text: "see #one and #two" }]);
    expect(find_inline_tag_ranges(doc)).toEqual([
      { from: 5, to: 9, tag: "one" },
      { from: 14, to: 18, tag: "two" },
    ]);
  });

  it("captures nested paths, dashes, and underscores in tag names", () => {
    const doc = paragraph_doc([{ text: "#proj/sub-task_1 done" }]);
    expect(find_inline_tag_ranges(doc)).toEqual([
      { from: 1, to: 17, tag: "proj/sub-task_1" },
    ]);
  });

  it("detects unicode tag names", () => {
    const doc = paragraph_doc([{ text: "note #日本語 end" }]);
    expect(find_inline_tag_ranges(doc)).toEqual([
      { from: 6, to: 10, tag: "日本語" },
    ]);
  });

  it("ignores a hash inside a word", () => {
    const doc = paragraph_doc([{ text: "foo#bar" }]);
    expect(find_inline_tag_ranges(doc)).toEqual([]);
  });

  it("ignores double-hash sequences", () => {
    const doc = paragraph_doc([{ text: "##foo" }]);
    expect(find_inline_tag_ranges(doc)).toEqual([]);
  });

  it("ignores a bare hash without a name", () => {
    const doc = paragraph_doc([{ text: "# " }]);
    expect(find_inline_tag_ranges(doc)).toEqual([]);
  });

  it("skips code block content", () => {
    const doc = schema.node("doc", null, [
      schema.node("code_block", null, [schema.text("#not-a-tag")]),
      schema.node("paragraph", null, [schema.text("#real")]),
    ]);
    expect(find_inline_tag_ranges(doc)).toEqual([
      { from: 13, to: 18, tag: "real" },
    ]);
  });

  it("skips frontmatter content", () => {
    const doc = schema.node("doc", null, [
      schema.node("frontmatter", null, [schema.text("tags: #meta")]),
      schema.node("paragraph", null, [schema.text("#real")]),
    ]);
    expect(find_inline_tag_ranges(doc)).toEqual([
      { from: 14, to: 19, tag: "real" },
    ]);
  });

  it("skips text marked as inline code", () => {
    const doc = paragraph_doc([{ text: "#code", mark: "code_inline" }]);
    expect(find_inline_tag_ranges(doc)).toEqual([]);
  });

  it("rejects a hash directly after a non-whitespace styled run", () => {
    const doc = paragraph_doc([
      { text: "bold", mark: "strong" },
      { text: "#tag" },
    ]);
    expect(find_inline_tag_ranges(doc)).toEqual([]);
  });

  it("accepts a hash after a styled run ending in whitespace", () => {
    const doc = paragraph_doc([
      { text: "bold ", mark: "strong" },
      { text: "#tag" },
    ]);
    expect(find_inline_tag_ranges(doc)).toEqual([
      { from: 6, to: 10, tag: "tag" },
    ]);
  });

  it("stops the tag at punctuation", () => {
    const doc = paragraph_doc([{ text: "#done." }]);
    expect(find_inline_tag_ranges(doc)).toEqual([
      { from: 1, to: 6, tag: "done" },
    ]);
  });
});
