/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { DOMParser as PmDOMParser } from "prosemirror-model";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import {
  is_web_embed_src,
  parse_html_embed,
} from "$lib/features/editor/adapters/html_embed";
import { schema } from "$lib/features/editor/adapters/schema";

const VAULT_HTML_IFRAME = `<iframe src="carbide-asset://vault-1/notes/x.html"></iframe>`;

const REJECTED_SRCS = [
  "carbide-asset://vault-1/x.html",
  "javascript:alert(1)",
  " JavaScript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "blob:tauri://localhost/0b1c",
  "carbide-html://vault-1/x.html",
  "file:///etc/passwd",
  "/relative/page.html",
  "//example.com/x",
];

function iframe_dom(src: string): HTMLElement {
  const container = document.createElement("div");
  const iframe = document.createElement("iframe");
  iframe.setAttribute("src", src);
  container.appendChild(iframe);
  return container;
}

function node_types_from_dom(dom: HTMLElement): string[] {
  const doc = PmDOMParser.fromSchema(schema).parse(dom);
  const names: string[] = [];
  doc.descendants((node) => {
    names.push(node.type.name);
  });
  return names;
}

describe("web_embed src scheme allowlist", () => {
  it("accepts http and https srcs", () => {
    expect(is_web_embed_src("https://www.youtube.com/embed/abc")).toBe(true);
    expect(is_web_embed_src("http://example.com/x")).toBe(true);
  });

  it.each(REJECTED_SRCS)("rejects %s", (src) => {
    expect(is_web_embed_src(src)).toBe(false);
    expect(parse_html_embed(`<iframe src="${src}"></iframe>`)).toBeNull();
  });

  it("parses a youtube iframe to web_embed", () => {
    const doc = parse_markdown(
      `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>`,
    );
    expect(doc.child(0).type.name).toBe("web_embed");
    expect(doc.child(0).attrs["src"]).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("keeps a vault-asset iframe as a non-rendering raw_block", () => {
    const doc = parse_markdown(VAULT_HTML_IFRAME);
    expect(doc.child(0).type.name).toBe("raw_block");
  });

  it("round-trips a vault-asset iframe byte-identical", () => {
    const input = `before\n\n${VAULT_HTML_IFRAME}\n\nafter\n`;
    expect(serialize_markdown(parse_markdown(input))).toBe(input);
  });

  it("drops a pasted non-http iframe instead of creating a web_embed", () => {
    const names = node_types_from_dom(
      iframe_dom("carbide-asset://vault-1/x.html"),
    );
    expect(names).not.toContain("web_embed");
  });

  it("keeps a pasted https iframe as web_embed", () => {
    const names = node_types_from_dom(iframe_dom("https://example.com/x"));
    expect(names).toContain("web_embed");
  });
});
