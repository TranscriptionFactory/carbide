// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  BOOK_CSP,
  inject_csp,
  is_html_type,
} from "$lib/features/document/domain/epub_csp";

function parse_xhtml(source: string): Document {
  return new DOMParser().parseFromString(source, "application/xhtml+xml");
}

const XHTML_SECTION = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Ch 1</title></head><body><p>Hi</p></body></html>`;

describe("is_html_type", () => {
  it("accepts xhtml and html documents", () => {
    expect(is_html_type("application/xhtml+xml")).toBe(true);
    expect(is_html_type("text/html; charset=utf-8")).toBe(true);
  });

  it("rejects non-document resources", () => {
    expect(is_html_type("text/css")).toBe(false);
    expect(is_html_type("image/png")).toBe(false);
  });
});

describe("inject_csp", () => {
  it("keeps re-serialized XHTML well-formed", () => {
    const doc = parse_xhtml(inject_csp(XHTML_SECTION));
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.body?.textContent).toBe("Hi");
  });

  it("injects the CSP meta into an existing head", () => {
    const doc = parse_xhtml(inject_csp(XHTML_SECTION));
    const meta = doc.querySelector(
      'meta[http-equiv="Content-Security-Policy"]',
    );
    expect(meta?.closest("head")).not.toBeNull();
    expect(meta?.getAttribute("content")).toBe(BOOK_CSP);
  });

  it("wraps a head when the document has none", () => {
    const doc = parse_xhtml(
      inject_csp(
        `<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hi</p></body></html>`,
      ),
    );
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(
      doc.querySelector('meta[http-equiv="Content-Security-Policy"]'),
    ).not.toBeNull();
  });
});
