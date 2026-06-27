import { describe, expect, it } from "vitest";
import {
  looks_like_markdown,
  is_bare_url,
  pick_paste_mode,
} from "$lib/features/editor/adapters/markdown_paste_utils";

describe("looks_like_markdown", () => {
  it("detects headings", () => {
    expect(looks_like_markdown("# Hello")).toBe(true);
    expect(looks_like_markdown("## Sub")).toBe(true);
  });

  it("detects top-level lists", () => {
    expect(looks_like_markdown("- item")).toBe(true);
    expect(looks_like_markdown("1. item")).toBe(true);
  });

  it("detects code fences", () => {
    expect(looks_like_markdown("```js\ncode\n```")).toBe(true);
  });

  it("detects blockquotes", () => {
    expect(looks_like_markdown("> quote")).toBe(true);
  });

  it("detects links", () => {
    expect(looks_like_markdown("[text](url)")).toBe(true);
  });

  it("detects images", () => {
    expect(looks_like_markdown("![alt](url)")).toBe(true);
  });

  it("detects emphasis", () => {
    expect(looks_like_markdown("**bold**")).toBe(true);
    expect(looks_like_markdown("*italic*")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(looks_like_markdown("hello world")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(looks_like_markdown("")).toBe(false);
  });

  it("does not detect bare URLs as markdown", () => {
    expect(looks_like_markdown("https://example.com")).toBe(false);
  });

  it("detects samples the prior heuristic missed", () => {
    expect(looks_like_markdown("Title\n=====")).toBe(true);
    expect(looks_like_markdown("~~~js\ncode\n~~~")).toBe(true);
    expect(looks_like_markdown("\\*escaped\\*")).toBe(true);
    expect(looks_like_markdown('<img src="x.png" />')).toBe(true);
  });
});

describe("is_bare_url", () => {
  it("detects http URLs", () => {
    expect(is_bare_url("http://example.com")).toBe(true);
    expect(is_bare_url("https://example.com")).toBe(true);
  });

  it("detects URLs with paths", () => {
    expect(is_bare_url("https://example.com/path?q=1#hash")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(is_bare_url("  https://example.com  ")).toBe(true);
  });

  it("rejects multi-word strings", () => {
    expect(is_bare_url("visit https://example.com now")).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(is_bare_url("ftp://example.com")).toBe(false);
  });

  it("rejects plain text", () => {
    expect(is_bare_url("not a url")).toBe(false);
  });

  it("rejects multiline URLs", () => {
    expect(is_bare_url("https://a.com\nhttps://b.com")).toBe(false);
  });
});

describe("pick_paste_mode", () => {
  it("returns markdown when text/markdown present", () => {
    expect(
      pick_paste_mode(
        { text_markdown: "# Hello", text_plain: "", text_html: "" },
        "plaintext",
      ),
    ).toBe("markdown");
  });

  it("returns url for bare URL in text/plain (BUG-004)", () => {
    expect(
      pick_paste_mode(
        {
          text_markdown: "",
          text_plain: "https://example.com",
          text_html: '<a href="https://example.com">https://example.com</a>',
        },
        "plaintext",
      ),
    ).toBe("url");
  });

  it("returns markdown for markdown-like text/plain", () => {
    expect(
      pick_paste_mode(
        { text_markdown: "", text_plain: "- item 1\n- item 2", text_html: "" },
        "plaintext",
      ),
    ).toBe("markdown");
  });

  it("returns html when only html present", () => {
    expect(
      pick_paste_mode(
        {
          text_markdown: "",
          text_plain: "plain text",
          text_html: "<b>bold</b>",
        },
        "generic",
      ),
    ).toBe("html");
  });

  it("returns none when nothing useful", () => {
    expect(
      pick_paste_mode(
        { text_markdown: "", text_plain: "plain text", text_html: "" },
        "plaintext",
      ),
    ).toBe("none");
  });

  it("prefers url over html for bare URLs", () => {
    expect(
      pick_paste_mode(
        {
          text_markdown: "",
          text_plain: "https://example.com/path",
          text_html: "<a>link</a>",
        },
        "generic",
      ),
    ).toBe("url");
  });

  it("treats vscode source as markdown even without text/markdown", () => {
    expect(
      pick_paste_mode(
        { text_markdown: "", text_plain: "const x = 1", text_html: "" },
        "vscode",
      ),
    ).toBe("markdown");
  });

  it("treats gfm source as markdown", () => {
    expect(
      pick_paste_mode(
        { text_markdown: "", text_plain: "plain", text_html: "<p>plain</p>" },
        "gfm",
      ),
    ).toBe("markdown");
  });

  it("lets pm-origin paste fall through to native handling", () => {
    expect(
      pick_paste_mode(
        {
          text_markdown: "",
          text_plain: "copied",
          text_html: '<div data-pm-slice="1 1 []">copied</div>',
        },
        "pm-origin",
      ),
    ).toBe("native");
  });
});
