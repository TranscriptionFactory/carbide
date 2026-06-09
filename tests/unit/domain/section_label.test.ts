import { describe, expect, it } from "vitest";
import {
  leaf_of_section,
  full_section_path,
} from "$lib/features/task/domain/section_label";

describe("leaf_of_section", () => {
  it("returns the last segment of a slash-separated path", () => {
    expect(leaf_of_section("A/B/C")).toBe("C");
  });

  it("returns the value unchanged when there is no slash", () => {
    expect(leaf_of_section("Top")).toBe("Top");
  });

  it("returns the last segment for a two-level path", () => {
    expect(leaf_of_section("Project A/Subproject B")).toBe("Subproject B");
  });

  it("returns empty string for an empty string", () => {
    expect(leaf_of_section("")).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(leaf_of_section(undefined)).toBe("");
  });

  it("returns empty string for null", () => {
    expect(leaf_of_section(null)).toBe("");
  });
});

describe("full_section_path", () => {
  it("returns the full path unchanged", () => {
    expect(full_section_path("A/B/C")).toBe("A/B/C");
  });

  it("returns empty string for undefined", () => {
    expect(full_section_path(undefined)).toBe("");
  });

  it("returns empty string for null", () => {
    expect(full_section_path(null)).toBe("");
  });
});
