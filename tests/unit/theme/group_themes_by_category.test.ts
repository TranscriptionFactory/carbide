import { describe, it, expect } from "vitest";
import {
  BUILTIN_NORDIC_DARK,
  group_themes_by_category,
  type Theme,
  type ThemeCategory,
} from "$lib/shared/types/theme";

function make_theme(category: ThemeCategory, name: string): Theme {
  return { ...BUILTIN_NORDIC_DARK, id: name, name, category };
}

describe("group_themes_by_category", () => {
  it("groups themes by category in order: core, stylized, layout, specialty", () => {
    const themes = [
      make_theme("layout", "Monolith"),
      make_theme("core", "Nordic"),
      make_theme("specialty", "Terminal"),
      make_theme("stylized", "Neon"),
      make_theme("core", "Dense"),
    ];
    const groups = group_themes_by_category(themes);
    expect(groups.map((g) => g.category)).toEqual([
      "core",
      "stylized",
      "layout",
      "specialty",
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "Core",
      "Stylized",
      "Layout",
      "Specialty",
    ]);
  });

  it("preserves theme order within each group", () => {
    const themes = [
      make_theme("core", "A"),
      make_theme("core", "B"),
      make_theme("core", "C"),
    ];
    const groups = group_themes_by_category(themes);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.themes.map((t) => t.name)).toEqual(["A", "B", "C"]);
  });

  it("omits categories with no themes", () => {
    const themes = [make_theme("core", "Nordic")];
    const groups = group_themes_by_category(themes);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.category).toBe("core");
  });

  it("returns empty array for empty input", () => {
    expect(group_themes_by_category([])).toEqual([]);
  });
});
