import { describe, it, expect } from "vitest";
import {
  filter_descriptors,
  group_filtered,
  ordered_categories,
} from "$lib/features/theme/domain/theme_style_filter";
import {
  STYLE_DESCRIPTORS,
  STYLE_CATEGORY_ORDER,
} from "$lib/features/theme/domain/theme_style_descriptors";

describe("filter_descriptors", () => {
  it("returns all descriptors for empty query", () => {
    const result = filter_descriptors(STYLE_DESCRIPTORS, "");
    expect(result.length).toBe(STYLE_DESCRIPTORS.length);
  });

  it("returns all descriptors for whitespace query", () => {
    const result = filter_descriptors(STYLE_DESCRIPTORS, "   ");
    expect(result.length).toBe(STYLE_DESCRIPTORS.length);
  });

  it("filters by label", () => {
    const result = filter_descriptors(STYLE_DESCRIPTORS, "Font Size");
    expect(result.some((d) => d.id === "font_size")).toBe(true);
  });

  it("filters by tag", () => {
    const result = filter_descriptors(STYLE_DESCRIPTORS, "blockquote");
    expect(result.length).toBeGreaterThan(0);
    for (const desc of result) {
      const haystack = [
        desc.label,
        desc.description,
        desc.category,
        ...desc.tags,
      ]
        .join(" ")
        .toLowerCase();
      expect(haystack).toContain("blockquote");
    }
  });

  it("filters by description", () => {
    const result = filter_descriptors(STYLE_DESCRIPTORS, "fenced");
    expect(result.some((d) => d.category === "code_blocks")).toBe(true);
  });

  it("is case-insensitive", () => {
    const lower = filter_descriptors(STYLE_DESCRIPTORS, "heading");
    const upper = filter_descriptors(STYLE_DESCRIPTORS, "HEADING");
    expect(lower.length).toBe(upper.length);
  });

  it("supports multi-token search", () => {
    const result = filter_descriptors(STYLE_DESCRIPTORS, "code background");
    expect(result.length).toBeGreaterThan(0);
    for (const desc of result) {
      const haystack = [
        desc.label,
        desc.description,
        desc.category,
        ...desc.tags,
      ]
        .join(" ")
        .toLowerCase();
      expect(haystack).toContain("code");
      expect(haystack).toContain("background");
    }
  });

  it("returns empty array for non-matching query", () => {
    const result = filter_descriptors(STYLE_DESCRIPTORS, "zzzznotfound");
    expect(result.length).toBe(0);
  });

  it("matches category name", () => {
    const result = filter_descriptors(STYLE_DESCRIPTORS, "tables");
    expect(result.some((d) => d.category === "tables")).toBe(true);
  });
});

describe("group_filtered", () => {
  it("groups descriptors by category", () => {
    const grouped = group_filtered(STYLE_DESCRIPTORS);
    for (const [cat, descs] of grouped) {
      for (const d of descs) {
        expect(d.category).toBe(cat);
      }
    }
  });

  it("preserves all descriptors", () => {
    const grouped = group_filtered(STYLE_DESCRIPTORS);
    let total = 0;
    for (const descs of grouped.values()) {
      total += descs.length;
    }
    expect(total).toBe(STYLE_DESCRIPTORS.length);
  });

  it("groups filtered subset correctly", () => {
    const filtered = filter_descriptors(STYLE_DESCRIPTORS, "heading");
    const grouped = group_filtered(filtered);
    for (const descs of grouped.values()) {
      for (const d of descs) {
        expect(
          d.id.includes("heading") ||
            d.tags.includes("heading") ||
            d.label.toLowerCase().includes("heading") ||
            d.description.toLowerCase().includes("heading") ||
            d.category.includes("heading"),
        ).toBe(true);
      }
    }
  });
});

describe("ordered_categories", () => {
  it("returns categories in the defined order", () => {
    const grouped = group_filtered(STYLE_DESCRIPTORS);
    const cats = ordered_categories(grouped);
    for (let i = 1; i < cats.length; i++) {
      const prev = cats[i - 1];
      const curr = cats[i];
      if (!prev || !curr) continue;
      const prev_idx = STYLE_CATEGORY_ORDER.indexOf(prev);
      const curr_idx = STYLE_CATEGORY_ORDER.indexOf(curr);
      expect(curr_idx).toBeGreaterThan(prev_idx);
    }
  });

  it("only includes categories with descriptors", () => {
    const filtered = filter_descriptors(STYLE_DESCRIPTORS, "table");
    const grouped = group_filtered(filtered);
    const cats = ordered_categories(grouped);
    for (const cat of cats) {
      expect(grouped.has(cat)).toBe(true);
      const descs = grouped.get(cat);
      expect(descs?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("returns empty for empty grouping", () => {
    const cats = ordered_categories(new Map());
    expect(cats.length).toBe(0);
  });
});
