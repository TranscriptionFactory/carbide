import { describe, it, expect } from "vitest";
import {
  BUILTIN_NORDIC_LIGHT,
  BUILTIN_NORDIC_DARK,
  AVAILABLE_SHIKI_THEMES,
  create_user_theme,
} from "$lib/shared/types/theme";

describe("theme shiki fields", () => {
  it("builtin themes have shiki_theme_light and shiki_theme_dark", () => {
    expect(BUILTIN_NORDIC_LIGHT.shiki_theme_light).toBe("github-light");
    expect(BUILTIN_NORDIC_LIGHT.shiki_theme_dark).toBe("github-dark");
    expect(BUILTIN_NORDIC_DARK.shiki_theme_light).toBe("github-light");
    expect(BUILTIN_NORDIC_DARK.shiki_theme_dark).toBe("github-dark");
  });

  it("AVAILABLE_SHIKI_THEMES contains expected entries", () => {
    expect(AVAILABLE_SHIKI_THEMES.light).toContain("github-light");
    expect(AVAILABLE_SHIKI_THEMES.dark).toContain("github-dark");
    expect(AVAILABLE_SHIKI_THEMES.dark).toContain("dracula");
  });

  it("user theme inherits shiki defaults from base", () => {
    const user = create_user_theme("Custom", BUILTIN_NORDIC_DARK);
    expect(user.shiki_theme_light).toBe("github-light");
    expect(user.shiki_theme_dark).toBe("github-dark");
  });
});
