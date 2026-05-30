import { describe, expect, it } from "vitest";
import {
  sanitize_note_color,
  sanitize_note_icon,
} from "$lib/features/folder/domain/note_visuals";

describe("sanitize_note_color", () => {
  it("accepts 3, 6, and 8-digit hex", () => {
    expect(sanitize_note_color("#f00")).toBe("#f00");
    expect(sanitize_note_color("#ff0000")).toBe("#ff0000");
    expect(sanitize_note_color("#ff0000ff")).toBe("#ff0000ff");
  });

  it("accepts known named colors case-insensitively", () => {
    expect(sanitize_note_color("Red")).toBe("red");
    expect(sanitize_note_color("PURPLE")).toBe("purple");
  });

  it("rejects unknown names and malformed hex", () => {
    expect(sanitize_note_color("crimson")).toBeNull();
    expect(sanitize_note_color("#zzz")).toBeNull();
    expect(sanitize_note_color("rgb(1,2,3)")).toBeNull();
    expect(sanitize_note_color("expression(alert(1))")).toBeNull();
  });

  it("returns null for empty/whitespace/undefined", () => {
    expect(sanitize_note_color(undefined)).toBeNull();
    expect(sanitize_note_color("")).toBeNull();
    expect(sanitize_note_color("   ")).toBeNull();
  });
});

describe("sanitize_note_icon", () => {
  it("returns the trimmed glyph", () => {
    expect(sanitize_note_icon("📐")).toBe("📐");
    expect(sanitize_note_icon("  📐  ")).toBe("📐");
  });

  it("caps at 8 codepoints", () => {
    expect(sanitize_note_icon("abcdefghijk")).toBe("abcdefgh");
  });

  it("handles multi-codepoint emoji without splitting surrogates", () => {
    const result = sanitize_note_icon("🚀🌈");
    expect(result).toBe("🚀🌈");
  });

  it("returns null for empty/undefined/whitespace-only", () => {
    expect(sanitize_note_icon(undefined)).toBeNull();
    expect(sanitize_note_icon("")).toBeNull();
    expect(sanitize_note_icon("   ")).toBeNull();
  });
});
