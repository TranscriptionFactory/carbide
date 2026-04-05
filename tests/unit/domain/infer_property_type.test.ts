import { describe, expect, it } from "vitest";
import { infer_property_type } from "$lib/features/metadata/domain/infer_property_type";

describe("infer_property_type", () => {
  describe("booleans", () => {
    it("detects native boolean true", () => {
      expect(infer_property_type(true)).toBe("boolean");
    });

    it("detects native boolean false", () => {
      expect(infer_property_type(false)).toBe("boolean");
    });

    it('detects string "true"', () => {
      expect(infer_property_type("true")).toBe("boolean");
    });

    it('detects string "false"', () => {
      expect(infer_property_type("false")).toBe("boolean");
    });

    it('detects string "yes" (case-insensitive)', () => {
      expect(infer_property_type("Yes")).toBe("boolean");
    });

    it('detects string "no" (case-insensitive)', () => {
      expect(infer_property_type("NO")).toBe("boolean");
    });

    it('detects string "TRUE"', () => {
      expect(infer_property_type("TRUE")).toBe("boolean");
    });
  });

  describe("numbers", () => {
    it("detects native number", () => {
      expect(infer_property_type(42)).toBe("number");
    });

    it("detects native float", () => {
      expect(infer_property_type(3.14)).toBe("number");
    });

    it("detects negative number", () => {
      expect(infer_property_type(-7)).toBe("number");
    });

    it("detects zero", () => {
      expect(infer_property_type(0)).toBe("number");
    });

    it('detects string integer "42"', () => {
      expect(infer_property_type("42")).toBe("number");
    });

    it('detects string float "3.14"', () => {
      expect(infer_property_type("3.14")).toBe("number");
    });

    it('detects string negative "-7"', () => {
      expect(infer_property_type("-7")).toBe("number");
    });

    it('detects string "0"', () => {
      expect(infer_property_type("0")).toBe("number");
    });
  });

  describe("dates", () => {
    it("detects Date object", () => {
      expect(infer_property_type(new Date("2026-01-01"))).toBe("date");
    });

    it("detects ISO date string YYYY-MM-DD", () => {
      expect(infer_property_type("2026-01-15")).toBe("date");
    });

    it("detects ISO datetime string", () => {
      expect(infer_property_type("2026-01-15T10:30:00")).toBe("date");
    });

    it("detects date with time zone", () => {
      expect(infer_property_type("2026-01-15T10:30:00Z")).toBe("date");
    });

    it("does not treat partial date-like strings as dates", () => {
      expect(infer_property_type("2026")).toBe("number");
    });

    it("does not treat non-ISO date formats as dates", () => {
      expect(infer_property_type("01/15/2026")).toBe("string");
    });
  });

  describe("strings", () => {
    it("detects plain string", () => {
      expect(infer_property_type("hello world")).toBe("string");
    });

    it("detects empty string", () => {
      expect(infer_property_type("")).toBe("string");
    });

    it("detects whitespace-only string", () => {
      expect(infer_property_type("   ")).toBe("string");
    });

    it("does not treat string with leading/trailing spaces as number", () => {
      expect(infer_property_type("  42  ")).toBe("number");
    });

    it("treats strings starting with # as string (not tag)", () => {
      expect(infer_property_type("#hashtag")).toBe("string");
    });
  });

  describe("arrays", () => {
    it("detects short string array as tags", () => {
      expect(infer_property_type(["alpha", "beta", "gamma"])).toBe("tags");
    });

    it("detects single-element string array as tags", () => {
      expect(infer_property_type(["solo"])).toBe("tags");
    });

    it("detects empty array as tags", () => {
      expect(infer_property_type([])).toBe("tags");
    });

    it("detects array with long strings as array", () => {
      const longStr = "a".repeat(50);
      expect(infer_property_type(["short", longStr])).toBe("array");
    });

    it("detects mixed-type array as array", () => {
      expect(infer_property_type(["text", 42])).toBe("array");
    });

    it("detects array of objects as array", () => {
      expect(infer_property_type([{ a: 1 }, { b: 2 }])).toBe("array");
    });

    it("detects nested arrays as array", () => {
      expect(infer_property_type([[1, 2], [3]])).toBe("array");
    });
  });

  describe("edge cases", () => {
    it("returns string for null", () => {
      expect(infer_property_type(null)).toBe("string");
    });

    it("returns string for undefined", () => {
      expect(infer_property_type(undefined)).toBe("string");
    });

    it("returns string for plain object", () => {
      expect(infer_property_type({ key: "val" })).toBe("string");
    });

    it("NaN stays string (not number)", () => {
      expect(infer_property_type("NaN")).toBe("string");
    });

    it("Infinity string stays string", () => {
      expect(infer_property_type("Infinity")).toBe("string");
    });
  });
});
