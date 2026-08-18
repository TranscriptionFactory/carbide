import { describe, expect, it } from "vitest";
import {
  build_html_frame_bridge_script,
  parse_html_frame_message,
} from "$lib/features/document/domain/html_frame_bridge";

describe("html frame bridge", () => {
  it("accepts bounded bridge messages", () => {
    expect(
      parse_html_frame_message({
        source: "carbide-html",
        type: "link_click",
        href: "https://example.com",
      }),
    ).toEqual({
      source: "carbide-html",
      type: "link_click",
      href: "https://example.com",
    });
  });

  it("rejects malformed and oversized messages", () => {
    expect(parse_html_frame_message({ type: "scroll", scroll_top: 1 })).toBeNull();
    expect(
      parse_html_frame_message({
        source: "carbide-html",
        type: "link_click",
        href: "x".repeat(4097),
      }),
    ).toBeNull();
  });

  it("only intercepts trusted anchor clicks", () => {
    const script = build_html_frame_bridge_script(120);
    expect(script).toContain("event.isTrusted");
    expect(script).toContain("scrollTo(0, 120)");
    expect(script).toContain('type: "headings"');
  });
});
