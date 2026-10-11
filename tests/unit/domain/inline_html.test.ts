// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  is_inline_html_break,
  parse_inline_html_tag,
  sanitize_inline_html_open_tag,
} from "$lib/shared/html";

describe("parse_inline_html_tag", () => {
  it.each([
    ["<u>", { name: "u", kind: "open" }],
    ["</U>", { name: "u", kind: "close" }],
    ['<span style="color:red">', { name: "span", kind: "open" }],
    ['<span title="a/">', { name: "span", kind: "open" }],
    ["<br>", { name: "br", kind: "void" }],
    ["<br />", { name: "br", kind: "void" }],
    ["<span/>", { name: "span", kind: "void" }],
  ])("parses %s", (value, expected) => {
    expect(parse_inline_html_tag(value)).toEqual(expected);
  });

  it.each(["<b>", "</script>", "<div>", "<!-- c -->", "plain"])(
    "rejects %s, which is not a whitelisted tag",
    (value) => {
      expect(parse_inline_html_tag(value)).toBeNull();
    },
  );
});

describe("is_inline_html_break", () => {
  it.each(["<br>", "<br/>", "<br />", "<BR>"])("accepts %s", (value) => {
    expect(is_inline_html_break(value)).toBe(true);
  });

  it.each(["</br>", "<b>", "<br"])("rejects %s", (value) => {
    expect(is_inline_html_break(value)).toBe(false);
  });
});

describe("sanitize_inline_html_open_tag", () => {
  it("keeps the allowed style properties and drops the rest", () => {
    expect(
      sanitize_inline_html_open_tag(
        '<span style="color: red; position: fixed; font-size: 2em" onclick="x">',
      ),
    ).toEqual({
      name: "span",
      attrs: { style: "color: red; font-size: 2em" },
    });
  });

  it("keeps font presentation attributes", () => {
    expect(
      sanitize_inline_html_open_tag('<font color="red" face="serif">'),
    ).toEqual({ name: "font", attrs: { color: "red", face: "serif" } });
  });
});
