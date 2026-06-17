import { describe, expect, it } from "vitest";
import { build_book_css } from "$lib/features/document/domain/epub_book_css";
import { BUILTIN_THEMES } from "$lib/shared/types/theme";

const THEME = BUILTIN_THEMES[0];
if (!THEME) throw new Error("expected at least one builtin theme");

describe("build_book_css", () => {
  it("applies the font scale as a root percentage", () => {
    const css = build_book_css(THEME, { font_scale: 130, line_height: 1.6 });
    expect(css).toContain("font-size: 130%;");
  });

  it("applies the configured line height to text blocks", () => {
    const css = build_book_css(THEME, { font_scale: 100, line_height: 1.9 });
    expect(css).toContain("line-height: 1.9;");
  });

  it("leaves rendering unchanged at default typography", () => {
    const css = build_book_css(THEME, { font_scale: 100, line_height: 1.6 });
    expect(css).toContain("font-size: 100%;");
    expect(css).toContain("line-height: 1.6;");
  });
});
