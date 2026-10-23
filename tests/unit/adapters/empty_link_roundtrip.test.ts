import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

function round_trip(markdown: string): string {
  return serialize_markdown(parse_markdown(markdown));
}

function raw_inline_values(markdown: string): string[] {
  const values: string[] = [];
  parse_markdown(markdown).descendants((node) => {
    if (node.type.name === "raw_inline") {
      values.push(node.attrs["value"] as string);
    }
  });
  return values;
}

describe("empty-text links", () => {
  it.each([
    "[](https://x)\n",
    "[](6_BLOB/x.png)\n",
    "a [](x) b\n",
    "\\![](6_BLOB/x.png)\n",
    "[]()\n",
    "[](<x y>)\n",
    "**a [](x) b**\n",
    "> quote [](x)\n",
  ])("round-trips %j byte-for-byte", (markdown) => {
    expect(round_trip(markdown)).toBe(markdown);
  });

  it("keeps the link source visible in the document", () => {
    expect(raw_inline_values("a [](https://x) b\n")).toEqual(["[](https://x)"]);
  });

  it("keeps the escaped image line visible instead of a bare '!'", () => {
    const doc = parse_markdown("\\![](6_BLOB/x.png)\n");
    expect(doc.textContent).toBe("!");
    expect(raw_inline_values("\\![](6_BLOB/x.png)\n")).toEqual([
      "[](6_BLOB/x.png)",
    ]);
  });

  it("still parses links with text as link marks", () => {
    expect(raw_inline_values("[label](https://x)\n")).toEqual([]);
    expect(round_trip("[label](https://x)\n")).toBe("[label](https://x)\n");
  });
});
