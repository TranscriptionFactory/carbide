import { describe, it, expect } from "vitest";
import {
  validate_list_name,
  slugify_list_name,
} from "$lib/features/task_list/domain/validate_list_name";

describe("validate_list_name", () => {
  it("accepts a valid name", () => {
    expect(validate_list_name("Sprint 1")).toEqual({ valid: true });
  });

  it("rejects empty name", () => {
    const result = validate_list_name("   ");
    expect(result.valid).toBe(false);
  });

  it("rejects names starting with dot", () => {
    const result = validate_list_name(".hidden");
    expect(result.valid).toBe(false);
  });

  it("rejects names with invalid characters", () => {
    const result = validate_list_name("test<file>");
    expect(result.valid).toBe(false);
  });

  it("rejects names exceeding max length", () => {
    const result = validate_list_name("a".repeat(201));
    expect(result.valid).toBe(false);
  });

  it("accepts name at max length", () => {
    expect(validate_list_name("a".repeat(200))).toEqual({ valid: true });
  });
});

describe("slugify_list_name", () => {
  it("converts to lowercase and replaces spaces with hyphens", () => {
    expect(slugify_list_name("Sprint 1")).toBe("sprint-1");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify_list_name("  test  ")).toBe("test");
  });

  it("limits length to 64 characters", () => {
    const long_name = "a".repeat(100);
    expect(slugify_list_name(long_name).length).toBeLessThanOrEqual(64);
  });
});
