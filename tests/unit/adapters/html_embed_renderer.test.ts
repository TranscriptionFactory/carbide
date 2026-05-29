// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  build_safe_embed_srcdoc,
  rewrite_embed_assets,
} from "$lib/features/editor/adapters/html_embed_renderer";

describe("rewrite_embed_assets", () => {
  it("returns input unchanged when no resolver is given", async () => {
    const html = `<img src="logo.png">`;
    expect(
      await rewrite_embed_assets(html, "notes/chart.html", undefined),
    ).toBe(html);
  });

  it("rewrites relative img src against the embedder's directory", async () => {
    const html = `<img src="logo.png" alt="logo">`;
    const out = await rewrite_embed_assets(
      html,
      "dashboards/sales/chart.html",
      (path) => `carbide-asset://vault/v1/${path}`,
    );
    expect(out).toContain(
      `src="carbide-asset://vault/v1/dashboards/sales/logo.png"`,
    );
  });

  it("leaves absolute, scheme, hash, and data URLs untouched", async () => {
    const html = `
      <img src="https://example.com/x.png">
      <img src="//cdn/x.png">
      <a href="#anchor">a</a>
      <a href="mailto:foo@bar">m</a>
      <img src="data:image/png;base64,abc">
    `;
    const resolved: string[] = [];
    const out = await rewrite_embed_assets(html, "notes/chart.html", (p) => {
      resolved.push(p);
      return `carbide-asset://x/${p}`;
    });
    expect(resolved).toEqual([]);
    expect(out).toBe(html);
  });

  it("normalizes ../ segments before resolving", async () => {
    const html = `<img src="../shared/img.png">`;
    let resolved_path = "";
    const out = await rewrite_embed_assets(
      html,
      "dashboards/sales/chart.html",
      (path) => {
        resolved_path = path;
        return `carbide-asset://x/${path}`;
      },
    );
    expect(resolved_path).toBe("dashboards/shared/img.png");
    expect(out).toContain(`src="carbide-asset://x/dashboards/shared/img.png"`);
  });

  it("rewrites href and poster attributes too", async () => {
    const html = `<a href="readme.md"><video poster="thumb.jpg"></video></a>`;
    const out = await rewrite_embed_assets(html, "x/y.html", (p) => `R:${p}`);
    expect(out).toContain(`href="R:x/readme.md"`);
    expect(out).toContain(`poster="R:x/thumb.jpg"`);
  });

  it("keeps the original attribute when the resolver throws", async () => {
    const html = `<img src="missing.png">`;
    const out = await rewrite_embed_assets(html, "n/x.html", () => {
      throw new Error("nope");
    });
    expect(out).toBe(html);
  });
});

describe("build_safe_embed_srcdoc", () => {
  it("sanitizes scripts out of embedded HTML", async () => {
    const srcdoc = await build_safe_embed_srcdoc({
      content: `<p>ok</p><script>alert(1)</script>`,
      host_file_path: "n/x.html",
    });
    expect(srcdoc).not.toContain("<script>alert(1)</script>");
    expect(srcdoc).toContain("<p>ok</p>");
  });

  it("includes a strict CSP that forbids network connections", async () => {
    const srcdoc = await build_safe_embed_srcdoc({
      content: `<p>hi</p>`,
      host_file_path: "n/x.html",
    });
    expect(srcdoc).toContain("connect-src 'none'");
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).toContain("carbide-asset:");
  });

  it("rewrites static asset src before sanitizing", async () => {
    const srcdoc = await build_safe_embed_srcdoc({
      content: `<img src="logo.png">`,
      host_file_path: "n/x.html",
      resolve_asset_url: (p) => `carbide-asset://v/${p}`,
    });
    expect(srcdoc).toContain(`carbide-asset://v/n/logo.png`);
  });
});
