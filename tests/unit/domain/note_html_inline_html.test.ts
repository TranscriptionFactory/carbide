// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render_note_body_html } from "$lib/features/document/domain/note_html";

function render(markdown: string): Promise<string> {
  return render_note_body_html("Note", markdown);
}

describe("export of inline HTML", () => {
  it("renders whitelisted inline tags", async () => {
    const html = await render(
      "Press <kbd>Esc</kbd>, <u>under</u> and x<sup>2</sup>.",
    );
    expect(html).toContain("<kbd>Esc</kbd>");
    expect(html).toContain("<u>under</u>");
    expect(html).toContain("x<sup>2</sup>");
    expect(html).not.toContain("raw-html");
  });

  it("renders <br> in any spelling, including table cells", async () => {
    const html = await render("a<BR/>b\n\n| c<br>d |\n| --- |");
    expect(html).toContain("a<br>b");
    expect(html).toContain("c<br>d");
  });

  it("filters inline styles to the allowed properties", async () => {
    const html = await render(
      '<span style="color:red; position:fixed" onclick="x">red</span>',
    );
    expect(html).toContain('<span style="color:red">red</span>');
    expect(html).not.toContain("position");
    expect(html).not.toContain("onclick");
  });

  it("keeps unmatched and misnested tags as escaped source", async () => {
    const html = await render("<u><s>x</u></s> and <u>open");
    expect(html).not.toContain("<u>");
    expect(html).not.toContain("<s>");
    expect(html).toContain('<code class="raw-html">&lt;u&gt;</code>');
  });

  it("does not pair tags that cross markdown emphasis", async () => {
    const html = await render("**a <u>b** c</u>");
    expect(html).not.toContain("<u>");
  });

  it("keeps non-whitelisted tags such as <script> escaped", async () => {
    const html = await render("a <script>alert(1)</script> b");
    expect(html).not.toContain("<script>");
    expect(html).toContain('<code class="raw-html">&lt;script&gt;</code>');
  });
});
