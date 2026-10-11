// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { DOMParser, DOMSerializer } from "prosemirror-model";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";

function render(markdown: string): HTMLElement {
  const container = document.createElement("div");
  container.appendChild(
    DOMSerializer.fromSchema(schema).serializeFragment(
      parse_markdown(markdown).content,
    ),
  );
  return container;
}

describe("inline HTML rendering in the editor", () => {
  it.each(["a<br>b", "a<br/>b", "a<br />b", "a<BR>b"])(
    "renders %s as a line break that keeps its source",
    (input) => {
      const br = render(input).querySelector("br[data-type='raw_inline']");
      expect(br?.getAttribute("data-value")).toBe(input.slice(1, -1));
    },
  );

  it("renders a <br> inside a table cell as a line break", () => {
    const dom = render("| a<br>b | c |\n| --- | --- |");
    expect(dom.querySelector("td br, th br")).not.toBeNull();
  });

  it.each([
    ["x <u>under</u> y", "u", "under"],
    ["E = mc<sup>2</sup>", "sup", "2"],
    ["press <kbd>K</kbd>", "kbd", "K"],
    ["<mark>hi</mark>", "mark", "hi"],
  ])("renders %s as a <%s> element", (input, tag, text) => {
    expect(render(input).querySelector(tag)?.textContent).toBe(text);
  });

  it("renders allowed inline styles", () => {
    const span = render(
      '<span style="color:red">x</span>',
    ).querySelector<HTMLElement>("span[data-html-open]");
    expect(span?.style.color).toBe("red");
    expect(span?.textContent).toBe("x");
  });

  it("drops disallowed style properties and event handlers", () => {
    const span = render(
      '<span style="position:fixed; color:blue" onclick="alert(1)">x</span>',
    ).querySelector<HTMLElement>("span[data-html-open]");
    expect(span?.style.position).toBe("");
    expect(span?.style.color).toBe("blue");
    expect(span?.hasAttribute("onclick")).toBe(false);
  });

  it("shows <script> as text, never as an element", () => {
    const dom = render("a <script>alert(1)</script> b");
    expect(dom.querySelector("script")).toBeNull();
    expect(dom.textContent).toContain("<script>");
  });

  it("parses the rendered DOM back to the same document", () => {
    const input = 'a <span style="color:red">x</span><br>b';
    const reparsed = DOMParser.fromSchema(schema).parse(render(input));
    expect(reparsed.eq(parse_markdown(input))).toBe(true);
  });
});
