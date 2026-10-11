import { describe, it, expect } from "vitest";
import type { Node as ProseNode } from "prosemirror-model";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";
import { find_inline_comment_ranges } from "$lib/features/editor/domain/comment_ranges";

function comment_texts(markdown: string): string[] {
  const doc = parse_markdown(markdown);
  return find_inline_comment_ranges(doc).map((range) =>
    slice_text(doc, range.from, range.to),
  );
}

function slice_text(doc: ProseNode, from: number, to: number): string {
  return doc.textBetween(from, to, "\n", (leaf) =>
    leaf.type.name === "raw_inline"
      ? String(leaf.attrs["value"])
      : leaf.textContent || "□",
  );
}

describe("find_inline_comment_ranges", () => {
  it("finds a comment inside a paragraph", () => {
    expect(comment_texts("text %%hidden%% more")).toEqual(["%%hidden%%"]);
  });

  it("finds every comment on a line", () => {
    expect(comment_texts("%%a%% b %%c%%")).toEqual(["%%a%%", "%%c%%"]);
  });

  it("spans formatting inside the comment", () => {
    expect(comment_texts("a %%x *b* **c** y%% tail")).toEqual(["%%x b c y%%"]);
  });

  it("finds comments in headings and list items", () => {
    expect(comment_texts("# Title %%note%%\n\n- item %%todo%%")).toEqual([
      "%%note%%",
      "%%todo%%",
    ]);
  });

  it("maps offsets across inline atoms before and inside the comment", () => {
    expect(comment_texts("$x$ then %%see $y$ here%%")).toEqual([
      "%%see y here%%",
    ]);
  });

  it("needs both markers on one line", () => {
    expect(comment_texts("start %%open\nclose%% end")).toEqual([]);
    expect(comment_texts("start %%open  \nclose%% end")).toEqual([]);
  });

  it("ignores an unclosed marker", () => {
    expect(comment_texts("only %%one marker")).toEqual([]);
  });

  it("ignores markers inside inline code", () => {
    expect(comment_texts("use `%%x%%` here")).toEqual([]);
    expect(comment_texts("`%%` text %%")).toEqual([]);
  });

  it("ignores backslash-escaped markers", () => {
    expect(comment_texts("show \\%%literal\\%% here")).toEqual([]);
  });

  it("skips code blocks and block comments", () => {
    expect(comment_texts("```\n%%a%%\n```\n\n%%\nb %%c%%\n%%")).toEqual([]);
  });
});
