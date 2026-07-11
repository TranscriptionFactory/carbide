import { describe, expect, it } from "vitest";
import { build_live_html_document } from "$lib/features/document/domain/html_live_document";

const THEME_STYLE = "<style data-theme>:root { --x: 1; }</style>";

describe("build_live_html_document", () => {
  it("injects the theme style into an existing <head>", () => {
    const doc = build_live_html_document({
      content:
        "<!doctype html><html><head><title>X</title></head><body>hi</body></html>",
      theme_style: THEME_STYLE,
    });
    expect(doc).toMatch(/<head><style data-theme>/);
    expect(doc).toContain("<title>X</title>");
  });

  it("creates a <head> when html has no head", () => {
    const doc = build_live_html_document({
      content: "<html><body><p>hi</p></body></html>",
      theme_style: THEME_STYLE,
    });
    expect(doc).toContain("<head><style data-theme>");
    expect(doc).toContain("<body><p>hi</p></body>");
  });

  it("wraps bare body content in a full document", () => {
    const doc = build_live_html_document({
      content: "<p>hi</p>",
      theme_style: THEME_STYLE,
    });
    expect(doc).toMatch(/^<!DOCTYPE html><html><head>/);
    expect(doc).toContain("<body><p>hi</p></body>");
  });

  it("preserves inline <script> tags so live mode can execute them", () => {
    const doc = build_live_html_document({
      content:
        "<html><head><title>T</title></head><body><script>window.x=1;</script></body></html>",
      theme_style: THEME_STYLE,
    });
    expect(doc).toContain("<script>window.x=1;</script>");
  });

  it("injects no meta CSP — the carbide-html: header CSP is authoritative", () => {
    const doc = build_live_html_document({
      content: "<p>hi</p>",
      theme_style: THEME_STYLE,
    });
    expect(doc).not.toContain("Content-Security-Policy");
  });
});
