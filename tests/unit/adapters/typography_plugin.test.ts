import { describe, it, expect } from "vitest";
import { find_typography_match } from "$lib/features/editor/adapters/typography_plugin";

describe("find_typography_match", () => {
  describe("arrows", () => {
    it("converts --> to →", () => {
      const result = find_typography_match("hello --", ">");
      expect(result).toEqual({ from_offset: 6, replacement: "\u2192" });
    });

    it("converts ==> to ⇒", () => {
      const result = find_typography_match("so ==", ">");
      expect(result).toEqual({ from_offset: 3, replacement: "\u21D2" });
    });

    it("converts <-- to ←", () => {
      const result = find_typography_match("go <-", "-");
      expect(result).toEqual({ from_offset: 3, replacement: "\u2190" });
    });

    it("converts <== to ⇐", () => {
      const result = find_typography_match("go <=", "=");
      expect(result).toEqual({ from_offset: 3, replacement: "\u21D0" });
    });

    it("converts <-> to ↔", () => {
      const result = find_typography_match("a <-", ">");
      expect(result).toEqual({ from_offset: 2, replacement: "\u2194" });
    });

    it("converts <=> to ⇔", () => {
      const result = find_typography_match("a <=", ">");
      expect(result).toEqual({ from_offset: 2, replacement: "\u21D4" });
    });

    it("converts --> at start of text", () => {
      const result = find_typography_match("--", ">");
      expect(result).toEqual({ from_offset: 0, replacement: "\u2192" });
    });
  });

  describe("no match", () => {
    it("returns null for unrecognized patterns", () => {
      expect(find_typography_match("hello", "x")).toBeNull();
    });

    it("returns null when trigger char does not match any rule", () => {
      expect(find_typography_match("hello", "a")).toBeNull();
    });

    it("returns null for partial arrow pattern", () => {
      expect(find_typography_match("hello -", ">")).toBeNull();
    });
  });

  describe("priority: longer patterns match first", () => {
    it("prefers --> over shorter patterns when typing >", () => {
      const result = find_typography_match("a --", ">");
      expect(result).toEqual({ from_offset: 2, replacement: "\u2192" });
    });

    it("prefers <-> over other patterns when applicable", () => {
      const result = find_typography_match("a <-", ">");
      expect(result?.replacement).toBe("\u2194");
    });
  });
});
