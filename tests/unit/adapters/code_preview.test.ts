import { describe, it, expect } from "vitest";
import {
  is_previewable_language,
  normalize_preview_language,
  meta_has_token,
  should_show_preview,
  build_code_preview_srcdoc,
  CODE_PREVIEW_SANDBOX,
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

  it("requires both a previewable language and the preview token", () => {
    expect(should_show_preview("html", "preview")).toBe(true);
    expect(should_show_preview("html", "")).toBe(false);
    expect(should_show_preview("python", "preview")).toBe(false);
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
    expect(doc).toContain("<body><h1>Title</h1></body>");
  });

  it("wraps css in a style tag", () => {
    const doc = build_code_preview_srcdoc("css", "body { color: red; }");
    expect(doc).toContain("<body><style>body { color: red; }</style></body>");
  });

  it("wraps js in a script tag", () => {
    const doc = build_code_preview_srcdoc("js", "document.title = 'x';");
    expect(doc).toContain(
      "<body><script>document.title = 'x';</script></body>",
    );
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

  it("drops token entries that could break out of the style block", () => {
    const doc = build_code_preview_srcdoc("html", "x", "light", {
      "--evil": "red}</style><script>alert(1)</script>",
    });
    expect(doc).not.toContain("alert(1)");
  });
});
