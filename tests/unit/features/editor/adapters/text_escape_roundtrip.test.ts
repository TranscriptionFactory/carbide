import { describe, expect, it } from "vitest";
import type { Root } from "mdast";
import {
  parse_processor,
  stringify_processor,
} from "$lib/features/editor/adapters/remark_plugins/remark_processor";

function parse(md: string): Root {
  return parse_processor.runSync(parse_processor.parse(md)) as Root;
}

function serialize(tree: Root): string {
  return stringify_processor.stringify(tree) as string;
}

function roundtrip(md: string): string {
  return serialize(parse(md)).trimEnd();
}

describe("markdown text escaping (Layer-3 narrowed escaper)", () => {
  describe("literals stay unescaped", () => {
    const cases: Array<[string, string]> = [
      ["isolated asterisk", "a * b"],
      ["intra-word underscores", "snake_case_word"],
      ["unmatched bracket", "see [the docs]"],
      ["unmatched paren", "cost is 5 (each)"],
      ["mid-sentence hash", "use the # symbol"],
      ["mid-sentence ordered marker", "see 1. not a list here"],
      ["isolated backtick", "the ` char"],
    ];

    it.each(cases)("%s: %s", (_name, input) => {
      const out = roundtrip(input);
      expect(out).not.toContain("\\");
      expect(roundtrip(out)).toBe(out);
    });
  });

  describe("genuine markdown is preserved", () => {
    it("keeps emphasis as emphasis", () => {
      const out = roundtrip("*emphasis*");
      expect(out).toBe("*emphasis*");
      expect(parse(out).children[0]).toMatchObject({
        type: "paragraph",
        children: [{ type: "emphasis" }],
      });
    });

    it("keeps strong as strong", () => {
      const out = roundtrip("**bold**");
      expect(out).toBe("**bold**");
      expect(parse(out).children[0]).toMatchObject({
        type: "paragraph",
        children: [{ type: "strong" }],
      });
    });

    it("keeps inline code as code", () => {
      const out = roundtrip("`code`");
      expect(out).toBe("`code`");
      expect(parse(out).children[0]).toMatchObject({
        type: "paragraph",
        children: [{ type: "inlineCode", value: "code" }],
      });
    });

    it("escapes a genuine entity so it round-trips as literal text", () => {
      const out = roundtrip("\\&amp;");
      expect(out).toBe("\\&amp;");
      expect(parse(out).children[0]).toMatchObject({
        type: "paragraph",
        children: [{ type: "text", value: "&amp;" }],
      });
    });

    it("preserves a real emphasized delimiter run wrapped in text", () => {
      const out = roundtrip("a *b* c");
      expect(parse(out).children[0]).toMatchObject({
        type: "paragraph",
        children: [
          { type: "text", value: "a " },
          { type: "emphasis", children: [{ type: "text", value: "b" }] },
          { type: "text", value: " c" },
        ],
      });
    });
  });

  describe("idempotency", () => {
    const samples = [
      "a * b and snake_case_word",
      "see [the docs] and cost is 5 (each)",
      "*emphasis* with `code` and \\&amp;",
      "use the # symbol, 1. not a list",
    ];

    it.each(samples)("serialize(parse(x)) is stable for: %s", (sample) => {
      const once = roundtrip(sample);
      const twice = roundtrip(once);
      expect(twice).toBe(once);
    });
  });
});
