import { describe, it, expect } from "vitest";
import type { Node as PmNode } from "prosemirror-model";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import { normalize_markdown_line_breaks } from "$lib/features/editor/domain/markdown_line_breaks";

function roundtrip(markdown: string): string {
  return serialize_markdown(parse_markdown(markdown)).trimEnd();
}

function inline_nodes(markdown: string): PmNode[] {
  const nodes: PmNode[] = [];
  parse_markdown(markdown).descendants((node) => {
    if (node.isInline) nodes.push(node);
    return true;
  });
  return nodes;
}

function raw_values(markdown: string): string[] {
  return inline_nodes(markdown)
    .filter((node) => node.type.name === "raw_inline")
    .map((node) => node.attrs["value"] as string);
}

function html_tags_on(markdown: string, text: string): string[] {
  const node = inline_nodes(markdown).find((n) => n.text === text);
  if (!node) throw new Error(`no text node "${text}" in ${markdown}`);
  return node.marks
    .filter((mark) => mark.type.name === "html_inline")
    .map(
      (mark) => `${String(mark.attrs["open"])}${String(mark.attrs["close"])}`,
    );
}

describe("inline <br>", () => {
  it.each(["a<br>b", "a<br/>b", "a<br />b", "a<BR>b"])(
    "keeps %s as a raw break atom and round-trips it byte-identical",
    (input) => {
      expect(raw_values(input)).toEqual([input.slice(1, -1)]);
      expect(roundtrip(input)).toBe(input);
    },
  );

  it("keeps the line ending before a <br> that starts a line", () => {
    const input = "a\n<br>b";
    expect(roundtrip(input)).toBe(input);
  });

  it("round-trips a <br> inside a table cell", () => {
    const input = "| a<br>b | c |\n| --- | --- |\n| d | e<br/>f |";
    expect(raw_values(input)).toEqual(["<br>", "<br/>"]);
    expect(roundtrip(input)).toBe(input);
  });

  it("saves an existing note with a trailing <br> unchanged", () => {
    const input = "one<br />\ntwo";
    const loaded = normalize_markdown_line_breaks(input);
    expect(loaded).toBe(input);
    expect(normalize_markdown_line_breaks(roundtrip(loaded))).toBe(input);
  });
});

describe("paired inline HTML", () => {
  it.each([
    ["x <u>under</u> y", "under", ["<u></u>"]],
    ["E = mc<sup>2</sup>", "2", ["<sup></sup>"]],
    ["H<sub>2</sub>O", "2", ["<sub></sub>"]],
    [
      'a <span style="color:red">red</span> b',
      "red",
      ['<span style="color:red"></span>'],
    ],
    ["press <kbd>K</kbd>", "K", ["<kbd></kbd>"]],
    ["<mark>hi</mark>", "hi", ["<mark></mark>"]],
    ["<s>gone</s>", "gone", ["<s></s>"]],
    ['<font color="red">red</font>', "red", ['<font color="red"></font>']],
    ["<U>keeps case</U>", "keeps case", ["<U></U>"]],
  ])("pairs %s into an html_inline mark", (input, text, tags) => {
    expect(html_tags_on(input, text)).toEqual(tags);
    expect(raw_values(input)).toEqual([]);
    expect(roundtrip(input)).toBe(input);
  });

  it.each([
    "<sup>1</sup><sup>2</sup>",
    '<span style="color:red">a</span><span style="color:blue">b</span>',
    "<u><s>x</s></u>",
    "<s><u>x</u></s>",
    "<u>**x**</u>",
    "**<u>x</u>**",
    "***<u>x</u>***",
    "**<u><s>x</s></u>**",
    "[<u>x</u>](https://example.com)",
    "<u>a *b* c</u>",
    "<u>a<br>b</u>",
    "<u>a\\\nb</u>",
    "a\n<u>x</u> b",
    "x <u>under</u> y <u>again</u>",
  ])("round-trips %s byte-identical", (input) => {
    expect(roundtrip(input)).toBe(input);
  });

  it("keeps adjacent pairs with identical tags as separate marks", () => {
    const input = "<sup>1</sup><sup>2</sup>";
    expect(html_tags_on(input, "1")).toEqual(["<sup></sup>"]);
    expect(html_tags_on(input, "2")).toEqual(["<sup></sup>"]);
  });

  it("stacks nested pairs outermost first", () => {
    expect(html_tags_on("<u><s>x</s></u>", "x")).toEqual([
      "<u></u>",
      "<s></s>",
    ]);
  });

  it("leaves non-whitelisted tags raw inside a pair (misnested <u><b>x</u></b>)", () => {
    const input = "<u><b>x</u></b>";
    expect(raw_values(input)).toEqual(["<b>", "</b>"]);
    expect(roundtrip(input)).toBe(input);
  });

  it("leaves misnested whitelisted tags raw", () => {
    const input = "<u><s>x</u></s>";
    expect(raw_values(input)).toEqual(["<u>", "<s>", "</u>", "</s>"]);
    expect(roundtrip(input)).toBe(input);
  });

  it("leaves an unmatched open tag raw", () => {
    const input = "<u>never closed";
    expect(raw_values(input)).toEqual(["<u>"]);
    expect(roundtrip(input)).toBe(input);
  });

  it("does not pair tags split across different markdown parents", () => {
    const input = "<u>a **b</u> c**";
    expect(raw_values(input)).toEqual(["<u>", "</u>"]);
    expect(roundtrip(input)).toBe(input);
  });

  it("keeps <script> as raw source", () => {
    const input = "a <script>alert(1)</script> b";
    expect(raw_values(input)).toEqual(["<script>", "</script>"]);
    expect(roundtrip(input)).toBe(input);
  });
});
