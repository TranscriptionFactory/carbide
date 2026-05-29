import { describe, expect, it } from "vitest";
import {
  build_live_csp,
  build_live_html_document,
} from "$lib/features/document/domain/html_live_document";

const THEME_STYLE = "<style data-theme>:root { --x: 1; }</style>";

describe("build_live_csp", () => {
  it("blocks connect-src by default", () => {
    const csp = build_live_csp(false);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("default-src 'none'");
  });

  it("mirrors the Rust live_html_csp permissive baseline", () => {
    const csp = build_live_csp(false);
    expect(csp).toContain("script-src 'unsafe-inline' 'unsafe-eval' blob: data:");
    expect(csp).toContain("style-src 'unsafe-inline' data:");
    expect(csp).toContain("img-src data: blob: https: http:");
    expect(csp).toContain("font-src data: https: http:");
    expect(csp).toContain("media-src data: blob: https: http:");
    expect(csp).toContain("frame-src data: blob:");
  });

  it("only differs by connect-src when network is granted", () => {
    const csp = build_live_csp(true);
    expect(csp).toContain("connect-src *");
    expect(csp).toContain("img-src data: blob: https: http:");
  });
});

describe("build_live_html_document", () => {
  it("injects CSP meta into an existing <head>", () => {
    const doc = build_live_html_document({
      content:
        "<!doctype html><html><head><title>X</title></head><body>hi</body></html>",
      theme_style: THEME_STYLE,
      allow_network: false,
    });
    expect(doc).toMatch(
      /<head><meta http-equiv="Content-Security-Policy" content="[^"]+"><style/,
    );
    expect(doc).toContain("<title>X</title>");
  });

  it("creates a <head> when html has no head", () => {
    const doc = build_live_html_document({
      content: "<html><body><p>hi</p></body></html>",
      theme_style: THEME_STYLE,
      allow_network: false,
    });
    expect(doc).toContain('<head><meta http-equiv="Content-Security-Policy"');
    expect(doc).toContain("<body><p>hi</p></body>");
  });

  it("wraps bare body content in a full document", () => {
    const doc = build_live_html_document({
      content: "<p>hi</p>",
      theme_style: THEME_STYLE,
      allow_network: false,
    });
    expect(doc).toMatch(/^<!DOCTYPE html><html><head>/);
    expect(doc).toContain("<body><p>hi</p></body>");
  });

  it("preserves inline <script> tags so live mode can execute them", () => {
    const doc = build_live_html_document({
      content:
        "<html><head><title>T</title></head><body><script>window.x=1;</script></body></html>",
      theme_style: THEME_STYLE,
      allow_network: false,
    });
    expect(doc).toContain("<script>window.x=1;</script>");
  });

  it("reflects allow_network in the embedded CSP", () => {
    const doc = build_live_html_document({
      content: "<p>hi</p>",
      theme_style: "",
      allow_network: true,
    });
    expect(doc).toContain("connect-src *");
  });
});
