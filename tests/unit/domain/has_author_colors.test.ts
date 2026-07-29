// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { has_author_colors } from "$lib/features/editor/domain/has_author_colors";
import { sanitize_html } from "$lib/shared/html";

describe("has_author_colors", () => {
  it("detects color and background declarations in style attributes", () => {
    expect(has_author_colors(`<div style="color:#111">x</div>`)).toBe(true);
    expect(has_author_colors(`<div style="background:#fff">x</div>`)).toBe(true);
    expect(
      has_author_colors(`<div style='padding:4px;background-color:#fff'>x</div>`),
    ).toBe(true);
    expect(
      has_author_colors(`<div style="background-image:url(a.png)">x</div>`),
    ).toBe(true);
  });

  it("detects declarations inside style blocks", () => {
    expect(has_author_colors(`<style>body { color: red; }</style>`)).toBe(true);
    expect(has_author_colors(`<style>.a{background:#fff}</style>`)).toBe(true);
    expect(has_author_colors(`<style>p { margin: 0; }</style>`)).toBe(false);
  });

  it("detects legacy color attributes", () => {
    expect(has_author_colors(`<td bgcolor="#eee">x</td>`)).toBe(true);
    expect(has_author_colors(`<table bordercolor="#eee"><tr></tr></table>`)).toBe(
      true,
    );
    expect(has_author_colors(`<font color="red">x</font>`)).toBe(true);
  });

  it("ignores unstyled content and non-color declarations", () => {
    expect(has_author_colors(`<p>hello <strong>world</strong></p>`)).toBe(false);
    expect(has_author_colors(`<div style="padding:4px;margin:0">x</div>`)).toBe(
      false,
    );
    expect(has_author_colors(`<div style="border-color:#fff">x</div>`)).toBe(
      false,
    );
    expect(has_author_colors(`<div data-background="x">y</div>`)).toBe(false);
  });

  it("stays true for inline styles that survive sanitization", () => {
    const sanitized = sanitize_html(`<div style="color:#111">x</div>`);
    expect(has_author_colors(sanitized)).toBe(true);
  });

  it("turns false once sanitization strips the styled element", () => {
    const sanitized = sanitize_html(
      `<section style="color:#111"><p>x</p></section>`,
    );
    expect(has_author_colors(sanitized)).toBe(false);
  });

  it("turns false once sanitization drops style blocks", () => {
    const sanitized = sanitize_html(
      `<style>body { color: red; }</style><p>x</p>`,
    );
    expect(has_author_colors(sanitized)).toBe(false);
  });
});
