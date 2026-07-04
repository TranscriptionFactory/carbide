import { describe, expect, it } from "vitest";
import {
  is_valid_tag_name,
  normalize_tag_name,
  sanitize_tag_colors,
  tag_color_for,
  with_tag_color,
  without_tag_color,
} from "$lib/features/tags/domain/tag_colors";

describe("normalize_tag_name", () => {
  it("strips a leading hash, trims, and lowercases", () => {
    expect(normalize_tag_name(" #Project/Sub ")).toBe("project/sub");
  });
});

describe("is_valid_tag_name", () => {
  it("accepts word characters, slashes, and dashes", () => {
    expect(is_valid_tag_name("proj/sub-task_1")).toBe(true);
  });

  it("rejects names starting with a separator", () => {
    expect(is_valid_tag_name("/nope")).toBe(false);
    expect(is_valid_tag_name("-nope")).toBe(false);
  });

  it("rejects empty names and names with spaces", () => {
    expect(is_valid_tag_name("")).toBe(false);
    expect(is_valid_tag_name("two words")).toBe(false);
  });
});

describe("sanitize_tag_colors", () => {
  it("returns an empty map for non-object values", () => {
    expect(sanitize_tag_colors(null)).toEqual({});
    expect(sanitize_tag_colors("red")).toEqual({});
    expect(sanitize_tag_colors([["a", "red"]])).toEqual({});
  });

  it("keeps valid named and hex colors and normalizes tag keys", () => {
    expect(sanitize_tag_colors({ "#Rust": "red", svelte: "#00ff00" })).toEqual({
      rust: "red",
      svelte: "#00ff00",
    });
  });

  it("drops invalid colors, invalid tags, and non-string values", () => {
    expect(
      sanitize_tag_colors({
        ok: "teal",
        bad_color: "not-a-color",
        "bad tag": "red",
        numeric: 7,
      }),
    ).toEqual({ ok: "teal" });
  });
});

describe("with_tag_color", () => {
  it("adds a color under the normalized tag name", () => {
    expect(with_tag_color({}, "#Rust", "red")).toEqual({ rust: "red" });
  });

  it("returns null for an invalid color", () => {
    expect(with_tag_color({}, "rust", "not-a-color")).toBeNull();
  });

  it("returns null for an invalid tag name", () => {
    expect(with_tag_color({}, "bad tag", "red")).toBeNull();
  });

  it("returns the same reference when the color is unchanged", () => {
    const colors = { rust: "red" };
    expect(with_tag_color(colors, "Rust", "red")).toBe(colors);
  });
});

describe("without_tag_color", () => {
  it("removes the normalized tag entry", () => {
    expect(without_tag_color({ rust: "red", svelte: "teal" }, "#Rust")).toEqual(
      { svelte: "teal" },
    );
  });

  it("returns the same reference when the tag is absent", () => {
    const colors = { rust: "red" };
    expect(without_tag_color(colors, "missing")).toBe(colors);
  });
});

describe("tag_color_for", () => {
  it("looks up colors case-insensitively via normalization", () => {
    expect(tag_color_for({ rust: "red" }, "#Rust")).toBe("red");
  });

  it("returns null for unknown tags", () => {
    expect(tag_color_for({ rust: "red" }, "unknown")).toBeNull();
  });
});
