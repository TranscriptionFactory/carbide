/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { to_xhtml_document } from "$lib/shared/html";

describe("to_xhtml_document", () => {
  it("produces well-formed XHTML from messy HTML content", () => {
    const xhtml = to_xhtml_document(
      "Tricky & <Title>",
      '<p>Fish & chips <img src="a.png" alt="a"><input disabled></p>',
    );
    const reparsed = new DOMParser().parseFromString(
      xhtml,
      "application/xhtml+xml",
    );
    expect(reparsed.querySelector("parsererror")).toBeNull();
    expect(reparsed.getElementsByTagName("title")[0]?.textContent).toBe(
      "Tricky & <Title>",
    );
    expect(reparsed.getElementsByTagName("img")).toHaveLength(1);
  });

  it("omits the stylesheet link by default", () => {
    const xhtml = to_xhtml_document("Note", "<p>Body</p>");
    expect(xhtml).not.toContain("<link");
  });

  it("links a stylesheet when a href is given", () => {
    const xhtml = to_xhtml_document("Note", "<p>Body</p>", {
      stylesheet_href: "style.css",
    });
    const reparsed = new DOMParser().parseFromString(
      xhtml,
      "application/xhtml+xml",
    );
    expect(reparsed.querySelector("parsererror")).toBeNull();
    const link = reparsed.getElementsByTagName("link")[0];
    expect(link?.getAttribute("href")).toBe("style.css");
    expect(link?.getAttribute("rel")).toBe("stylesheet");
  });
});
