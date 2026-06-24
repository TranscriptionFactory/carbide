import { describe, expect, it } from "vitest";
import {
  build_live_csp,
  build_live_html_document,
} from "$lib/features/document/domain/html_live_document";

const THEME_STYLE = "<style data-theme>:root { --x: 1; }</style>";

// Canonical CSP strings — mirror src-tauri/src/shared/live_html.rs::live_html_csp.
// Drift in one side without the other fails the pinned test there.
const CSP_LIVE =
  "default-src 'none'; " +
  "script-src 'unsafe-inline' 'unsafe-eval' blob: data:; " +
  "style-src 'unsafe-inline' data:; " +
  "img-src data: blob: https: http: carbide-html:; " +
  "font-src data: https: http: carbide-html:; " +
  "media-src data: blob: https: http: carbide-html:; " +
  "frame-src data: blob:; " +
  "connect-src 'none'";

const CSP_LIVE_NET =
  "default-src 'none'; " +
  "script-src 'unsafe-inline' 'unsafe-eval' blob: data: https:; " +
  "style-src 'unsafe-inline' data: https:; " +
  "img-src data: blob: https: http: carbide-html:; " +
  "font-src data: https: http: carbide-html:; " +
  "media-src data: blob: https: http: carbide-html:; " +
  "frame-src data: blob:; " +
  "connect-src *";

describe("build_live_csp", () => {
  it("emits the canonical no-network (live) policy", () => {
    expect(build_live_csp(false)).toBe(CSP_LIVE);
  });

  it("emits the canonical network (live+net) policy", () => {
    expect(build_live_csp(true)).toBe(CSP_LIVE_NET);
  });

  it("only grants https: scripts/styles in the network tier", () => {
    const live = build_live_csp(false);
    expect(live).toContain(
      "script-src 'unsafe-inline' 'unsafe-eval' blob: data:;",
    );
    expect(live).not.toContain(
      "script-src 'unsafe-inline' 'unsafe-eval' blob: data: https:",
    );
    expect(live).toContain("style-src 'unsafe-inline' data:;");
    expect(live).not.toContain("style-src 'unsafe-inline' data: https:");

    const net = build_live_csp(true);
    expect(net).toContain(
      "script-src 'unsafe-inline' 'unsafe-eval' blob: data: https:",
    );
    expect(net).toContain("style-src 'unsafe-inline' data: https:");
  });

  it("never allows http: for scripts or styles in either tier", () => {
    for (const csp of [build_live_csp(false), build_live_csp(true)]) {
      const directives = csp.split("; ");
      const script = directives.find((d) => d.startsWith("script-src"));
      const style = directives.find((d) => d.startsWith("style-src"));
      expect(script).not.toContain("http:");
      expect(style).not.toContain("http:");
    }
  });

  it("allows carbide-html: local assets for img/font/media in both tiers", () => {
    for (const csp of [build_live_csp(false), build_live_csp(true)]) {
      expect(csp).toContain("img-src data: blob: https: http: carbide-html:");
      expect(csp).toContain("font-src data: https: http: carbide-html:");
      expect(csp).toContain("media-src data: blob: https: http: carbide-html:");
    }
  });

  it("gates connect-src on network", () => {
    expect(build_live_csp(false)).toContain("connect-src 'none'");
    expect(build_live_csp(true)).toContain("connect-src *");
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
