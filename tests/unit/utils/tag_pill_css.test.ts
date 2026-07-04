import { describe, expect, it } from "vitest";
import { build_tag_pill_css } from "$lib/shared/utils/apply_tag_pill_colors";

describe("build_tag_pill_css", () => {
  it("returns an empty string for an empty map", () => {
    expect(build_tag_pill_css({})).toBe("");
  });

  it("emits one case-insensitive attribute rule per tag", () => {
    expect(build_tag_pill_css({ rust: "red" })).toBe(
      '.tag-pill[data-tag="rust" i] { --tag-pill-color: red; }',
    );
  });

  it("sorts rules by tag name for deterministic output", () => {
    const css = build_tag_pill_css({ zeta: "teal", alpha: "#ff0000" });
    expect(css).toBe(
      [
        '.tag-pill[data-tag="alpha" i] { --tag-pill-color: #ff0000; }',
        '.tag-pill[data-tag="zeta" i] { --tag-pill-color: teal; }',
      ].join("\n"),
    );
  });

  it("escapes quotes and backslashes in tag names", () => {
    expect(build_tag_pill_css({ 'a"b\\c': "red" })).toBe(
      '.tag-pill[data-tag="a\\"b\\\\c" i] { --tag-pill-color: red; }',
    );
  });
});
