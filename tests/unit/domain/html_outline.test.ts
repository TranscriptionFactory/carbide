// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extract_html_headings } from "$lib/features/document/domain/html_outline";

describe("extract_html_headings", () => {
  it("extracts nested headings with stable occurrence keys", () => {
    expect(
      extract_html_headings(
        "<h1 id='top'>Top</h1><section><h2>Child</h2></section>",
      ),
    ).toEqual([
      { id: "top--carbide-0", level: 1, text: "Top", pos: 0 },
      { id: "carbide-heading-1", level: 2, text: "Child", pos: 1 },
    ]);
  });

  it("gives duplicate authored ids unique occurrence keys", () => {
    expect(
      extract_html_headings("<h2 id='x'>One</h2><h2 id='x'>Two</h2>"),
    ).toMatchObject([{ id: "x--carbide-0" }, { id: "x--carbide-1" }]);
  });

  it("normalizes malformed heading contents to text", () => {
    expect(
      extract_html_headings("<h2>Hello <em>world</em></h2>")[0]?.text,
    ).toBe("Hello world");
  });
});
