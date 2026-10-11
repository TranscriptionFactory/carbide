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

function find_text(markdown: string, type_name: string): string | undefined {
  let text: string | undefined;
  parse_markdown(markdown).descendants((node) => {
    if (text === undefined && node.type.name === type_name) {
      text = node.textContent;
    }
    return text === undefined;
  });
  return text;
}

const CONTAINED_FOOTNOTES = {
  blockquote: "> [^1]: first\n>     second\n",
  callout: "> [!note] Title\n> [^1]: first\n>     second\n",
  "list item": "- item\n  [^1]: first\n      second\n",
  "nested blockquote": "> > [^1]: first\n> >     second\n",
};

describe("raw nodes inside containers", () => {
  for (const [container, input] of Object.entries(CONTAINED_FOOTNOTES)) {
    it(`round-trips a multi-line footnote definition in a ${container}`, () => {
      expect_stable_roundtrip(input);
    });

    it(`strips the ${container} prefix from the footnote source`, () => {
      expect(find_text(input, "footnote_def")).toBe("[^1]: first\n    second");
    });
  }

  it("round-trips a multi-line reference definition in a blockquote", () => {
    const input = '> [a]: https://x.y\n>   "title"\n';
    expect(find_text(input, "raw_block")).toBe('[a]: https://x.y\n  "title"');
    expect_stable_roundtrip(input);
  });

  it("round-trips a reference link spanning lines in a blockquote", () => {
    const input = "> a [ref\n> text][a]\n\n[a]: https://x\n";
    expect_stable_roundtrip(input);
  });

  it("round-trips a reference link spanning lines in a list item", () => {
    const input = "- a [ref\n  text][a]\n\n[a]: https://x\n";
    expect_stable_roundtrip(input);
  });

  it("never grows blockquote prefixes over repeated saves", () => {
    const input = "> > [^1]: first\n> >     second\n>\n> > [b]: https://x\n> >   \"t\"\n";
    let current = input;
    for (let i = 0; i < 5; i++) current = roundtrip(current);
    expect(current).toBe(input);
    expect(current).not.toContain("> > >");
  });
});
