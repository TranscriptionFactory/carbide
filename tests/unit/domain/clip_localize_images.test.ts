/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_IMAGES,
  plan_image_localization,
  rewrite_image_srcs,
} from "$lib/features/clip/domain/localize_images";

const BASE = "https://example.com/articles/post";

describe("plan_image_localization", () => {
  it("collects absolutized http(s) image urls", () => {
    const html =
      '<p><img src="/img/a.png"><img src="https://cdn.example.com/b.jpg"></p>';
    expect(plan_image_localization(html, BASE).urls).toEqual([
      "https://example.com/img/a.png",
      "https://cdn.example.com/b.jpg",
    ]);
  });

  it("skips data:, blob:, and invalid srcs", () => {
    const html =
      '<img src="data:image/png;base64,xx"><img src="blob:abc"><img src="https://example.com/ok.png">';
    expect(plan_image_localization(html, BASE).urls).toEqual([
      "https://example.com/ok.png",
    ]);
  });

  it("dedupes repeated urls", () => {
    const html = '<img src="/a.png"><img src="/a.png"><img src="/b.png">';
    expect(plan_image_localization(html, BASE).urls).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
    ]);
  });

  it("collects svg image hrefs alongside img srcs", () => {
    const html =
      '<img src="/a.png"><svg><image href="/a.png"></image><image href="/b.webp"></image><image xlink:href="/c.jpg"></image></svg>';
    expect(plan_image_localization(html, BASE).urls).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.webp",
      "https://example.com/c.jpg",
    ]);
  });

  it("caps the number of images and reports how many it skipped", () => {
    const html = Array.from(
      { length: 30 },
      (_, i) => `<img src="/img-${String(i)}.png">`,
    ).join("");
    const plan = plan_image_localization(html, BASE, 3);
    expect(plan.urls).toHaveLength(3);
    expect(plan.skipped).toBe(27);
  });

  it("keeps a default cap large enough for figure-heavy articles", () => {
    expect(DEFAULT_MAX_IMAGES).toBeGreaterThanOrEqual(400);
  });
});

describe("rewrite_image_srcs", () => {
  it("rewrites mapped srcs and strips srcset/sizes", () => {
    const html =
      '<img src="/a.png" srcset="/a-2x.png 2x" sizes="100vw" alt="a">';
    const mapping = new Map([
      ["https://example.com/a.png", ".assets/a-local.png"],
    ]);
    const result = rewrite_image_srcs(html, BASE, mapping);
    expect(result).toContain('src=".assets/a-local.png"');
    expect(result).not.toContain("srcset");
    expect(result).not.toContain("sizes");
    expect(result).toContain('alt="a"');
  });

  it("keeps unmapped images pointing at their remote url", () => {
    const html = '<img src="https://example.com/kept.png" srcset="x 2x">';
    const result = rewrite_image_srcs(html, BASE, new Map());
    expect(result).toContain('src="https://example.com/kept.png"');
    expect(result).toContain("srcset");
  });

  it("rewrites svg image hrefs, including xlink:href", () => {
    const html =
      '<svg><image href="/a.png"></image><image xlink:href="/b.png"></image></svg>';
    const mapping = new Map([
      ["https://example.com/a.png", ".assets/a-local.png"],
      ["https://example.com/b.png", ".assets/b-local.png"],
    ]);
    const result = rewrite_image_srcs(html, BASE, mapping);
    expect(result).toContain('href=".assets/a-local.png"');
    expect(result).toContain('xlink:href=".assets/b-local.png"');
  });
});
