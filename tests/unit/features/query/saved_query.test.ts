import { describe, expect, it } from "vitest";
import {
  query_path_from_name,
  query_name_from_path,
  validate_query_name,
} from "$lib/features/query/domain/saved_query";

describe("saved_query domain", () => {
  describe("query_path_from_name", () => {
    it("appends .query extension", () => {
      expect(query_path_from_name("my query")).toBe("my query.query");
    });

    it("handles names with spaces", () => {
      expect(query_path_from_name("project notes")).toBe("project notes.query");
    });
  });

  describe("query_name_from_path", () => {
    it("strips .query extension", () => {
      expect(query_name_from_path("my query.query")).toBe("my query");
    });

    it("handles paths with directories", () => {
      expect(query_name_from_path("queries/my query.query")).toBe("my query");
    });

    it("returns filename as-is if no .query extension", () => {
      expect(query_name_from_path("something.txt")).toBe("something.txt");
    });
  });

  describe("validate_query_name", () => {
    it("accepts valid names", () => {
      expect(validate_query_name("my query")).toEqual({ valid: true });
    });

    it("rejects empty names", () => {
      const result = validate_query_name("");
      expect(result.valid).toBe(false);
    });

    it("rejects whitespace-only names", () => {
      const result = validate_query_name("   ");
      expect(result.valid).toBe(false);
    });

    it("rejects names with invalid characters", () => {
      for (const c of ["<", ">", ":", '"', "|", "?", "*", "\\"]) {
        const result = validate_query_name(`test${c}name`);
        expect(result.valid).toBe(false);
      }
    });

    it("rejects names starting with dot", () => {
      const result = validate_query_name(".hidden");
      expect(result.valid).toBe(false);
    });

    it("rejects names exceeding 200 characters", () => {
      const result = validate_query_name("a".repeat(201));
      expect(result.valid).toBe(false);
    });

    it("accepts names at exactly 200 characters", () => {
      expect(validate_query_name("a".repeat(200))).toEqual({ valid: true });
    });
  });
});
