/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  is_previewable_language,
  normalize_preview_language,
  meta_has_token,
  should_show_preview,
  fence_mode_from_meta,
  set_fence_mode_token,
  build_code_preview_srcdoc,
  build_safe_code_preview_srcdoc,
  clamp_preview_height,
  read_preview_theme_tokens,
  CODE_PREVIEW_SANDBOX,
  PREVIEW_HEIGHT_MESSAGE,
  PREVIEW_MIN_HEIGHT_PX,
  PREVIEW_MAX_HEIGHT_PX,
} from "$lib/features/editor/adapters/code_preview";

describe("preview language gating", () => {
  it("recognizes previewable languages and aliases", () => {
    for (const lang of [
      "html",
      "htm",
      "xml",
      "svg",
      "css",
      "js",
      "javascript",
    ]) {
      expect(is_previewable_language(lang)).toBe(true);
    }
  });

  it("rejects non-previewable languages", () => {
    for (const lang of ["python", "rust", "mermaid", "", "tsx"]) {
      expect(is_previewable_language(lang)).toBe(false);
    }
  });

  it("normalizes aliases to a canonical language", () => {
    expect(normalize_preview_language("HTM")).toBe("html");
    expect(normalize_preview_language("JavaScript")).toBe("js");
    expect(normalize_preview_language("svg")).toBe("xml");
  });
});

describe("meta token gating", () => {
  it("detects a bare preview token", () => {
    expect(meta_has_token("preview", "preview")).toBe(true);
    expect(meta_has_token("preview title=Demo", "preview")).toBe(true);
  });

  it("ignores token values when matching keys", () => {
    expect(meta_has_token('title="x" preview h=400', "preview")).toBe(true);
    expect(meta_has_token("title=preview", "preview")).toBe(false);
  });

  it("still requires the preview token for non-html languages", () => {
    expect(should_show_preview("xml", "preview")).toBe(true);
    expect(should_show_preview("css", "preview")).toBe(true);
    expect(should_show_preview("js", "preview")).toBe(true);
    expect(should_show_preview("xml", "")).toBe(false);
    expect(should_show_preview("css", "")).toBe(false);
    expect(should_show_preview("js", "")).toBe(false);
    expect(should_show_preview("python", "preview")).toBe(false);
  });

  it("auto-previews html unless nopreview is set", () => {
    expect(should_show_preview("html", "")).toBe(true);
    expect(should_show_preview("html", "preview")).toBe(true);
    expect(should_show_preview("html", "title=Demo")).toBe(true);
    expect(should_show_preview("html", "nopreview")).toBe(false);
    expect(should_show_preview("html", "preview nopreview")).toBe(false);
    expect(should_show_preview("xml", "preview nopreview")).toBe(false);
  });

  // Visibility (above) is independent of the render mode: a bare ```html fence
  // still shows a preview, it just shows the Safe one.
  it("defaults every fence to safe mode, including bare html", () => {
    expect(fence_mode_from_meta("")).toBe("safe");
    expect(fence_mode_from_meta("preview")).toBe("safe");
    expect(fence_mode_from_meta("nopreview")).toBe("safe");
    expect(fence_mode_from_meta("safe")).toBe("safe");
    expect(fence_mode_from_meta("live")).toBe("live");
  });

  it("ignores a live token that is only a value, not a key", () => {
    expect(fence_mode_from_meta("title=live")).toBe("safe");
  });

  it("round-trips the live token without disturbing the other tokens", () => {
    const live = set_fence_mode_token("nopreview title=Demo", "live");
    expect(live).toBe("nopreview title=Demo live");
    expect(fence_mode_from_meta(live)).toBe("live");

    const back = set_fence_mode_token(live, "safe");
    expect(back).toBe("nopreview title=Demo");
    expect(fence_mode_from_meta(back)).toBe("safe");
    expect(set_fence_mode_token(back, "safe")).toBe("nopreview title=Demo");
  });

  it("auto-previews normalized html variants", () => {
    expect(should_show_preview("HTML", "")).toBe(true);
    expect(should_show_preview("htm", "")).toBe(true);
    expect(should_show_preview("HTML", "nopreview")).toBe(false);
  });
});

describe("preview srcdoc", () => {
  it("uses an allow-scripts-only sandbox", () => {
    expect(CODE_PREVIEW_SANDBOX).toBe("allow-scripts");
  });

  it("omits a meta CSP so the carbide-html header is the single source", () => {
    const doc = build_code_preview_srcdoc("html", "<p>hi</p>");
    expect(doc).not.toContain("Content-Security-Policy");
  });

  it("embeds raw html source directly", () => {
    const doc = build_code_preview_srcdoc("html", "<h1>Title</h1>");
    expect(doc).toContain("<body><h1>Title</h1>");
  });

  it("wraps css in a style tag", () => {
    const doc = build_code_preview_srcdoc("css", "body { color: red; }");
    expect(doc).toContain("<body><style>body { color: red; }</style>");
  });

  it("wraps js in a script tag", () => {
    const doc = build_code_preview_srcdoc("js", "document.title = 'x';");
    expect(doc).toContain("<body><script>document.title = 'x';</script>");
  });

  it("applies a dark class for the dark theme", () => {
    expect(build_code_preview_srcdoc("html", "x", "dark")).toContain(
      '<html class="dark">',
    );
    expect(build_code_preview_srcdoc("html", "x", "light")).toContain("<html>");
  });

  it("pins color-scheme to the active theme rather than light dark", () => {
    expect(build_code_preview_srcdoc("html", "x", "light")).toContain(
      "color-scheme:light",
    );
    expect(build_code_preview_srcdoc("html", "x", "dark")).toContain(
      "color-scheme:dark",
    );
    expect(build_code_preview_srcdoc("html", "x", "light")).not.toContain(
      "color-scheme: light dark",
    );
  });

  it("forwards theme tokens into the preview :root", () => {
    const doc = build_code_preview_srcdoc("html", "x", "light", {
      "--foreground": "oklch(0.25 0.012 66)",
      "--chart-1": "oklch(0.7 0.15 40)",
    });
    expect(doc).toContain("--foreground:oklch(0.25 0.012 66);");
    expect(doc).toContain("--chart-1:oklch(0.7 0.15 40);");
  });

  it("dresses the themed surface with the editor tokens the embed path uses", () => {
    const doc = build_code_preview_srcdoc("html", "<p>hi</p>", "dark", {
      "--editor-background": "oklch(0.2 0 0)",
      "--editor-text": "oklch(0.9 0 0)",
    });
    expect(doc).toContain(
      "body { color: var(--editor-text, var(--foreground)); background: var(--editor-background, var(--background)); }",
    );
    expect(doc).not.toMatch(/#(?:18181b|ffffff)/i);
  });

  it("renders author-styled html on a neutral light surface in dark theme", () => {
    const doc = build_code_preview_srcdoc(
      "html",
      `<div style="background:#ffffff;color:#111111">hi</div>`,
      "dark",
      { "--foreground": "oklch(0.95 0 0)" },
    );
    expect(doc).toContain("color-scheme:light");
    expect(doc).not.toContain('<html class="dark">');
    expect(doc).not.toContain("--foreground:oklch(0.95 0 0);");
    expect(doc).toContain("body { color: #18181b; background: #ffffff; }");
  });

  it("treats a css block that sets colors as author-styled", () => {
    const doc = build_code_preview_srcdoc(
      "css",
      "body { color: red; }",
      "dark",
    );
    expect(doc).toContain("color-scheme:light");
    expect(doc).toContain("body { color: #18181b; background: #ffffff; }");
  });

  it("keeps theme tokens for html that declares no colors", () => {
    const doc = build_code_preview_srcdoc(
      "html",
      `<div style="padding:4px">hi</div>`,
      "dark",
      { "--foreground": "oklch(0.95 0 0)" },
    );
    expect(doc).toContain('<html class="dark">');
    expect(doc).toContain("color-scheme:dark");
    expect(doc).toContain("--foreground:oklch(0.95 0 0);");
    expect(doc).not.toContain("body { color: #18181b; background: #ffffff; }");
  });

  it("drops token entries that could break out of the style block", () => {
    const doc = build_code_preview_srcdoc("html", "x", "light", {
      "--evil": "red}</style><script>alert(1)</script>",
    });
    expect(doc).not.toContain("alert(1)");
  });

  it("ships a height reporter that measures the body, not the frame viewport", () => {
    const doc = build_code_preview_srcdoc("html", "<p>hi</p>");
    expect(doc).toContain(PREVIEW_HEIGHT_MESSAGE);
    expect(doc).toContain("document.body.getBoundingClientRect().height");
    expect(doc).toContain("new ResizeObserver(send).observe(document.body)");
  });

  it("keeps the height reporter out of author-color detection", () => {
    const doc = build_code_preview_srcdoc("html", "<p>hi</p>", "dark", {
      "--foreground": "oklch(0.95 0 0)",
    });
    expect(doc).toContain("color-scheme:dark");
    expect(doc).not.toContain("body { color: #18181b; background: #ffffff; }");
  });
});

describe("safe preview srcdoc", () => {
  it("drops author scripts and their handlers", () => {
    const doc = build_safe_code_preview_srcdoc(
      "html",
      `<p onclick="steal()">hi</p><script>steal()</script>`,
    );
    expect(doc).toContain("<p>hi</p>");
    expect(doc).not.toContain("steal()");
    expect(doc).not.toContain("onclick");
  });

  it("drops author javascript: urls and frames", () => {
    const doc = build_safe_code_preview_srcdoc(
      "html",
      `<a href="javascript:steal()">x</a><iframe src="https://evil.test"></iframe>`,
    );
    expect(doc).not.toContain("javascript:");
    expect(doc).not.toContain("evil.test");
  });

  it("keeps the author stylesheet", () => {
    const doc = build_safe_code_preview_srcdoc(
      "html",
      `<style>.x { color: red; }</style><p class="x">hi</p>`,
    );
    expect(doc).toContain(".x { color: red; }");
    expect(doc).toContain('<p class="x">hi</p>');
  });

  it("denies network access through a meta CSP", () => {
    const doc = build_safe_code_preview_srcdoc("html", "<p>hi</p>");
    expect(doc).toContain('http-equiv="Content-Security-Policy"');
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain("form-action 'none'");
    expect(doc).toContain("default-src 'none'");
  });

  it("keeps the height reporter so the preview can size itself", () => {
    const doc = build_safe_code_preview_srcdoc("html", "<p>hi</p>");
    expect(doc).toContain(PREVIEW_HEIGHT_MESSAGE);
  });

  it("renders a css fence as a stylesheet rather than as markup", () => {
    const doc = build_safe_code_preview_srcdoc("css", "body { color: red; }");
    expect(doc).toContain("body { color: red; }");
    expect(doc).not.toContain("<body>body { color: red; }");
  });
});

describe("preview height clamping", () => {
  it("rounds a fractional content height up to whole pixels", () => {
    expect(clamp_preview_height(46.2)).toBe(47);
  });

  it("floors an empty preview at the minimum height", () => {
    expect(clamp_preview_height(0)).toBe(PREVIEW_MIN_HEIGHT_PX);
    expect(clamp_preview_height(-40)).toBe(PREVIEW_MIN_HEIGHT_PX);
  });

  it("caps a runaway document at the maximum height", () => {
    expect(clamp_preview_height(9000)).toBe(PREVIEW_MAX_HEIGHT_PX);
  });

  it("falls back to the minimum for a non-finite height", () => {
    expect(clamp_preview_height(Number.NaN)).toBe(PREVIEW_MIN_HEIGHT_PX);
    expect(clamp_preview_height(Number.POSITIVE_INFINITY)).toBe(
      PREVIEW_MIN_HEIGHT_PX,
    );
  });
});

describe("preview theme token reads", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-color-scheme");
    vi.restoreAllMocks();
  });

  it("reuses the computed tokens until a root attribute changes", () => {
    document.documentElement.setAttribute("data-color-scheme", "light");
    read_preview_theme_tokens();

    const computed = vi.spyOn(window, "getComputedStyle");

    read_preview_theme_tokens();
    read_preview_theme_tokens();
    expect(computed).not.toHaveBeenCalled();

    document.documentElement.setAttribute("data-color-scheme", "dark");
    read_preview_theme_tokens();
    expect(computed).toHaveBeenCalledTimes(1);
  });
});
