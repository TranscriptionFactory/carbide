import { describe, it, expect } from "vitest";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

function round_trip(markdown: string): string {
  return serialize_markdown(parse_markdown(markdown));
}

describe("images inside links", () => {
  it.each([
    "[![badge](https://img.shields.io/x.svg)](https://ci)\n",
    "a [![b](i.png)](x) c\n",
    "[![a](i.png) text](x)\n",
    "[![a](1.png)](x) [![b](2.png)](y)\n",
  ])("round-trips %j byte-for-byte", (markdown) => {
    expect(round_trip(markdown)).toBe(markdown);
  });

  it("puts the link mark on the image node", () => {
    const image = parse_markdown("[![a](i.png)](https://x)\n").firstChild
      ?.firstChild;
    expect(image?.type.name).toBe("image");
    expect(image?.marks.map((mark) => mark.attrs["href"])).toEqual([
      "https://x",
    ]);
  });
});
