import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

function roundtrip(markdown: string): string {
  return serialize_markdown(parse_markdown(markdown));
}

function expect_stable_roundtrip(input: string, cycles = 3): void {
  let current = input;
  for (let i = 0; i < cycles; i++) {
    current = roundtrip(current);
    expect(current).toBe(input);
  }
}

function first_list_item_child_types(markdown: string): string[] {
  const types: string[] = [];
  parse_markdown(markdown).descendants((node) => {
    if (types.length > 0) return false;
    if (node.type.name === "list_item") {
      node.forEach((child) => types.push(child.type.name));
      return false;
    }
    return true;
  });
  return types;
}

const LEADING_BLOCKS = {
  "reference definition": '- [a]: https://x.y\n  "title"\n',
  "footnote definition": "- [^1]: first\n",
  "fenced code": "- ```js\n  const a = 1;\n  ```\n",
  heading: "- # h\n",
  blockquote: "- > q\n",
  "html block": "- <div>x</div>\n",
  table: "- | a | b |\n  | --- | --- |\n  | 1 | 2 |\n",
  "thematic break": "* ---\n",
};

const NORMALIZED_LEADING_BLOCKS = {
  "table delimiter row": {
    input: "- | a | b |\n  | - | - |\n  | 1 | 2 |\n",
    saved: LEADING_BLOCKS.table,
  },
  "thematic break marker": {
    input: "- ***\n",
    saved: LEADING_BLOCKS["thematic break"],
  },
};

describe("list item whose first child is not a paragraph", () => {
  for (const [kind, input] of Object.entries(LEADING_BLOCKS)) {
    it(`round-trips a leading ${kind} byte-identically`, () => {
      expect_stable_roundtrip(input);
    });
  }

  for (const [kind, { input, saved }] of Object.entries(
    NORMALIZED_LEADING_BLOCKS,
  )) {
    it(`normalizes a leading ${kind} once, then stays stable`, () => {
      expect(roundtrip(input)).toBe(saved);
      expect_stable_roundtrip(saved);
    });
  }

  for (const [kind, input] of Object.entries(LEADING_BLOCKS)) {
    it(`parses a leading ${kind} into a schema-valid list item`, () => {
      expect(() => {
        parse_markdown(input).check();
      }).not.toThrow();
    });
  }

  it("keeps a leading reference definition as raw source", () => {
    expect(
      first_list_item_child_types(LEADING_BLOCKS["reference definition"]),
    ).toEqual(["paragraph", "raw_block"]);
  });

  it("keeps a leading footnote definition as a footnote definition", () => {
    expect(
      first_list_item_child_types(LEADING_BLOCKS["footnote definition"]),
    ).toEqual(["paragraph", "footnote_def"]);
  });

  it("keeps a leading fenced code block as a code block", () => {
    expect(first_list_item_child_types(LEADING_BLOCKS["fenced code"])).toEqual([
      "paragraph",
      "code_block",
    ]);
  });

  it("keeps a leading heading as a heading", () => {
    expect(first_list_item_child_types(LEADING_BLOCKS.heading)).toEqual([
      "paragraph",
      "heading",
    ]);
  });

  it("round-trips a leading code block followed by a paragraph", () => {
    expect_stable_roundtrip("- ```js\n  x\n  ```\n  after\n");
  });

  it("round-trips a leading heading in an ordered list", () => {
    expect_stable_roundtrip("1. # h\n2. b\n");
  });

  it("round-trips a task item whose body starts on the next line", () => {
    expect_stable_roundtrip("- [ ] task\n");
  });

  it("round-trips an empty list item", () => {
    expect_stable_roundtrip("- a\n-\n- b\n");
  });
});
