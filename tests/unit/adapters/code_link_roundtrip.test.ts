import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

function round_trip(markdown: string): string {
  return serialize_markdown(parse_markdown(markdown));
}

describe("links whose text is inline code", () => {
  it.each([
    "[`Rocinante-12B`](https://hf.co/x)\n",
    "**[`Rocinante`](https://x) exported at `Q4_K_M`** (or on [`base`](https://y)).\n",
    "| a |\n| --- |\n| [`A`](https://x) / [`B`](https://y) |\n",
    "[`a` and b](https://x)\n",
    "**[`a`](https://x)**\n",
  ])("round-trips %j byte-for-byte", (markdown) => {
    expect(round_trip(markdown)).toBe(markdown);
  });

  it("is stable across repeated saves", () => {
    const markdown = "1. **[`A`](https://x) at `Q4`** (or [`B`](https://y)).\n";
    expect(round_trip(round_trip(round_trip(markdown)))).toBe(markdown);
  });
});
