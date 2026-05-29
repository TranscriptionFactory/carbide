import { describe, expect, it } from "vitest";
import {
  extract_mermaid_sources,
  inject_mermaid_svgs,
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
