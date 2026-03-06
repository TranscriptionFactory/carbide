import { describe, it, expect } from "vitest";
import { extract_emoji_shortcode } from "$lib/features/editor/adapters/emoji_plugin";

describe("extract_emoji_shortcode", () => {
  it("extracts a valid shortcode ending with colon", () => {
    const result = extract_emoji_shortcode(":smile:", 7);
    expect(result).toEqual({ shortcode: "smile", from: 0 });
  });

  it("extracts shortcode from middle of text", () => {
    const result = extract_emoji_shortcode("hello :wave:", 12);
    expect(result).toEqual({ shortcode: "wave", from: 6 });
  });

  it("returns null when no opening colon", () => {
    const result = extract_emoji_shortcode("smile:", 6);
    expect(result).toBeNull();
  });

  it("returns null for empty shortcode between colons", () => {
    const result = extract_emoji_shortcode("::", 2);
    expect(result).toBeNull();
  });

  it("returns null for invalid characters in shortcode", () => {
    const result = extract_emoji_shortcode(":hello world:", 13);
    expect(result).toBeNull();
  });

  it("handles shortcodes with hyphens and underscores", () => {
    const result = extract_emoji_shortcode(":thumbs-up:", 11);
    expect(result).toEqual({ shortcode: "thumbs-up", from: 0 });
  });

  it("handles shortcodes with plus signs", () => {
    const result = extract_emoji_shortcode(":+1:", 4);
    expect(result).toEqual({ shortcode: "+1", from: 0 });
  });

  it("handles shortcodes with numbers", () => {
    const result = extract_emoji_shortcode(":100:", 5);
    expect(result).toEqual({ shortcode: "100", from: 0 });
  });
});
