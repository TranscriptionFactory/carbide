import { describe, expect, it } from "vitest";
import {
  find_paired_theme_id,
  BUILTIN_THEMES,
  BUILTIN_NORDIC_DARK,
  type Theme,
} from "$lib/shared/types/theme";

function create_user_theme(
  id: string,
  name: string,
  color_scheme: "light" | "dark",
): Theme {
  return {
    ...BUILTIN_NORDIC_DARK,
    id,
    name,
    color_scheme,
    is_builtin: false,
    token_overrides: {},
  };
}

describe("find_paired_theme_id", () => {
  it("finds the light pair of a builtin dark theme", () => {
    const result = find_paired_theme_id("nordic-dark", [...BUILTIN_THEMES]);
    expect(result).toBe("nordic-light");
  });

  it("finds the dark pair of a builtin light theme", () => {
    const result = find_paired_theme_id("nordic-light", [...BUILTIN_THEMES]);
    expect(result).toBe("nordic-dark");
  });

  it("pairs paper themes correctly", () => {
    expect(find_paired_theme_id("paper-dark", [...BUILTIN_THEMES])).toBe(
      "paper-light",
    );
    expect(find_paired_theme_id("paper-light", [...BUILTIN_THEMES])).toBe(
      "paper-dark",
    );
  });

  it("pairs user themes by name convention", () => {
    const custom_light = create_user_theme("cl", "My Theme Light", "light");
    const custom_dark = create_user_theme("cd", "My Theme Dark", "dark");
    const all = [...BUILTIN_THEMES, custom_light, custom_dark];

    expect(find_paired_theme_id("cl", all)).toBe("cd");
    expect(find_paired_theme_id("cd", all)).toBe("cl");
  });

  it("falls back to any theme of opposite scheme when no name match", () => {
    const lone_dark = create_user_theme("lone", "Unique Theme", "dark");
    const all = [...BUILTIN_THEMES, lone_dark];
    const result = find_paired_theme_id("lone", all);
    expect(result).not.toBeNull();
    const paired = all.find((t) => t.id === result);
    expect(paired?.color_scheme).toBe("light");
  });

  it("returns null for a nonexistent theme ID", () => {
    expect(
      find_paired_theme_id("does-not-exist", [...BUILTIN_THEMES]),
    ).toBeNull();
  });
});
