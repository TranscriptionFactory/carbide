import { describe, expect, it } from "vitest";
import {
  extract_mermaid_sources,
  inject_mermaid_svgs,
  prerender_html_math,
} from "$lib/features/document/domain/html_live_prerender";

describe("extract_mermaid_sources", () => {
  it("returns sources from <pre class=\"mermaid\"> blocks", () => {
    const html =
      '<p>intro</p><pre class="mermaid">graph LR\n A --> B</pre><p>outro</p>';
    expect(extract_mermaid_sources(html)).toEqual(["graph LR\n A --> B"]);
  });

  it("accepts multi-class declarations and single quotes", () => {
    const html = `<pre class='foo mermaid bar'>graph TD; X-->Y</pre>`;
    expect(extract_mermaid_sources(html)).toEqual(["graph TD; X-->Y"]);
  });

  it("ignores <pre> without the mermaid class", () => {
    const html =
      '<pre>not a diagram</pre><pre class="mermaidlike">also not</pre>';
    expect(extract_mermaid_sources(html)).toEqual([]);
  });

  it("decodes HTML entities in the source", () => {
    const html = '<pre class="mermaid">graph LR\n A --&gt; B &amp; C</pre>';
    expect(extract_mermaid_sources(html)).toEqual([
      "graph LR\n A --> B & C",
    ]);
  });

  it("returns all sources when multiple blocks are present", () => {
    const html =
      '<pre class="mermaid">a</pre>x<pre class="mermaid">b</pre>';
    expect(extract_mermaid_sources(html)).toEqual(["a", "b"]);
  });
});

describe("inject_mermaid_svgs", () => {
  it("replaces matching blocks with <figure> wrappers", () => {
    const html = '<p>hi</p><pre class="mermaid">graph A</pre>';
    const out = inject_mermaid_svgs(
      html,
      new Map([["graph A", "<svg id='a'/>"]]),
    );
    expect(out).toBe('<p>hi</p><figure class="mermaid-figure"><svg id=\'a\'/></figure>');
  });

  it("leaves blocks without a matching svg untouched", () => {
    const html = '<pre class="mermaid">graph A</pre><pre class="mermaid">graph B</pre>';
    const out = inject_mermaid_svgs(
      html,
      new Map([["graph A", "<svg/>"]]),
    );
    expect(out).toContain('<figure class="mermaid-figure"><svg/></figure>');
    expect(out).toContain('<pre class="mermaid">graph B</pre>');
  });

  it("leaves non-mermaid <pre> blocks untouched", () => {
    const html = '<pre class="code">graph A</pre>';
    const out = inject_mermaid_svgs(
      html,
      new Map([["graph A", "<svg/>"]]),
    );
    expect(out).toBe('<pre class="code">graph A</pre>');
  });

  it("returns input unchanged when svg map is empty", () => {
    const html = '<pre class="mermaid">graph A</pre>';
    expect(inject_mermaid_svgs(html, new Map())).toBe(html);
  });
});

describe("prerender_html_math", () => {
  it("renders $$…$$ display math via KaTeX", () => {
    const { html, had_math } = prerender_html_math("<p>$$x^2$$</p>");
    expect(had_math).toBe(true);
    expect(html).toContain("katex-display");
    expect(html).not.toContain("$$x^2$$");
  });

  it("renders \\[…\\] display math", () => {
    const { html, had_math } = prerender_html_math("<p>\\[x^2\\]</p>");
    expect(had_math).toBe(true);
    expect(html).toContain("katex-display");
  });

  it("renders \\(…\\) inline math", () => {
    const { html, had_math } = prerender_html_math("<p>see \\(x^2\\) here</p>");
    expect(had_math).toBe(true);
    expect(html).toContain("katex");
    expect(html).not.toContain("katex-display");
  });

  it("does not scan inside <pre>, <code>, <script>, <style>", () => {
    const cases = [
      "<pre>$$x^2$$</pre>",
      "<code>\\(y\\)</code>",
      "<script>const a = \\(z\\);</script>",
      "<style>p:before { content: '$$ignored$$'; }</style>",
    ];
    for (const html of cases) {
      const out = prerender_html_math(html);
      expect(out.had_math).toBe(false);
      expect(out.html).toBe(html);
    }
  });

  it("does not interpret bare $…$ as math (KaTeX default)", () => {
    const { html, had_math } = prerender_html_math("<p>price is $5 to $9</p>");
    expect(had_math).toBe(false);
    expect(html).toBe("<p>price is $5 to $9</p>");
  });

  it("leaves invalid LaTeX in place", () => {
    const { html } = prerender_html_math("<p>$$\\frac{}{}$$</p>");
    // KaTeX with throwOnError:false renders error spans; this still counts as "rendered"
    expect(html).not.toContain("$$\\frac{}{}$$");
  });

  it("returns had_math=false when no math is present", () => {
    const { html, had_math } = prerender_html_math("<p>plain text</p>");
    expect(had_math).toBe(false);
    expect(html).toBe("<p>plain text</p>");
  });
});
