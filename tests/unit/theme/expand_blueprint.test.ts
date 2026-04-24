import { describe, it, expect } from "vitest";
import { expand_blueprint, type ThemeBlueprint } from "$lib/shared/types/theme";

const MINIMAL_BP: ThemeBlueprint = {
  base_name: "Test Theme",
  surface_hue: 200,
  surface_chroma: 0.02,
  accent_hue: 300,
  accent_chroma: 0.15,
};

describe("expand_blueprint", () => {
  it("produces light and dark themes by default (schemes undefined)", () => {
    const themes = expand_blueprint(MINIMAL_BP);
    expect(themes).toHaveLength(2);
    expect(themes[0]?.color_scheme).toBe("light");
    expect(themes[1]?.color_scheme).toBe("dark");
  });

  it("produces light and dark themes for schemes='both'", () => {
    const themes = expand_blueprint({ ...MINIMAL_BP, schemes: "both" });
    expect(themes).toHaveLength(2);
    expect(themes[0]?.color_scheme).toBe("light");
    expect(themes[1]?.color_scheme).toBe("dark");
  });

  it("produces only dark theme for schemes='dark_only'", () => {
    const themes = expand_blueprint({
      ...MINIMAL_BP,
      schemes: "dark_only",
    });
    expect(themes).toHaveLength(1);
    expect(themes[0]?.color_scheme).toBe("dark");
  });

  it("formats id as kebab-case with scheme suffix", () => {
    const themes = expand_blueprint(MINIMAL_BP);
    expect(themes).toHaveLength(2);
    expect(themes[0]?.id).toBe("test-theme-light");
    expect(themes[1]?.id).toBe("test-theme-dark");
  });

  it("formats name with scheme suffix", () => {
    const themes = expand_blueprint(MINIMAL_BP);
    expect(themes).toHaveLength(2);
    expect(themes[0]?.name).toBe("Test Theme Light");
    expect(themes[1]?.name).toBe("Test Theme Dark");
  });

  it("marks all expanded themes as builtin", () => {
    const themes = expand_blueprint(MINIMAL_BP);
    for (const t of themes) {
      expect(t.is_builtin).toBe(true);
    }
  });

  it("propagates surface and accent params", () => {
    const themes = expand_blueprint(MINIMAL_BP);
    for (const t of themes) {
      expect(t.surface_hue).toBe(200);
      expect(t.surface_chroma).toBe(0.02);
      expect(t.accent_hue).toBe(300);
      expect(t.accent_chroma).toBe(0.15);
    }
  });

  it("merges structural_overrides into token_overrides for both schemes", () => {
    const bp: ThemeBlueprint = {
      ...MINIMAL_BP,
      structural_overrides: { "--radius": "0.5rem" },
    };
    const themes = expand_blueprint(bp);
    for (const t of themes) {
      expect(t.token_overrides["--radius"]).toBe("0.5rem");
    }
  });

  it("applies color_overrides_light only to light theme", () => {
    const bp: ThemeBlueprint = {
      ...MINIMAL_BP,
      color_overrides_light: { "--background": "oklch(0.99 0 0)" },
      color_overrides_dark: { "--background": "oklch(0.1 0 0)" },
    };
    const themes = expand_blueprint(bp);
    const light = themes.find((t) => t.color_scheme === "light");
    const dark = themes.find((t) => t.color_scheme === "dark");
    expect(light).toBeDefined();
    expect(dark).toBeDefined();
    expect(light?.token_overrides["--background"]).toBe("oklch(0.99 0 0)");
    expect(dark?.token_overrides["--background"]).toBe("oklch(0.1 0 0)");
  });

  it("color_overrides take precedence over structural_overrides", () => {
    const bp: ThemeBlueprint = {
      ...MINIMAL_BP,
      structural_overrides: { "--border": "structural" },
      color_overrides_light: { "--border": "color-light" },
      color_overrides_dark: { "--border": "color-dark" },
    };
    const themes = expand_blueprint(bp);
    const light = themes.find((t) => t.color_scheme === "light");
    const dark = themes.find((t) => t.color_scheme === "dark");
    expect(light).toBeDefined();
    expect(dark).toBeDefined();
    expect(light?.token_overrides["--border"]).toBe("color-light");
    expect(dark?.token_overrides["--border"]).toBe("color-dark");
  });

  it("propagates optional fields when set", () => {
    const bp: ThemeBlueprint = {
      ...MINIMAL_BP,
      layout_variant: "cockpit",
      font_family_sans: "Roboto",
      font_family_mono: "Fira Code",
      font_size: 1.125,
      line_height: 1.6,
      spacing: "compact",
      heading_color: "primary",
      heading_font_weight: 700,
      bold_style: "color-accent",
      blockquote_style: "accent-bar",
      code_block_style: "borderless",
      shiki_theme_dark: "vitesse-dark",
    };
    const themes = expand_blueprint(bp);
    for (const t of themes) {
      expect(t.layout_variant).toBe("cockpit");
      expect(t.font_family_sans).toBe("Roboto");
      expect(t.font_family_mono).toBe("Fira Code");
      expect(t.font_size).toBe(1.125);
      expect(t.line_height).toBe(1.6);
      expect(t.spacing).toBe("compact");
      expect(t.heading_color).toBe("primary");
      expect(t.heading_font_weight).toBe(700);
      expect(t.bold_style).toBe("color-accent");
      expect(t.blockquote_style).toBe("accent-bar");
      expect(t.code_block_style).toBe("borderless");
      expect(t.shiki_theme_dark).toBe("vitesse-dark");
    }
  });

  it("uses SHARED_DEFAULTS for omitted optional fields", () => {
    const themes = expand_blueprint(MINIMAL_BP);
    for (const t of themes) {
      expect(t.layout_variant).toBe("default");
      expect(t.font_family_sans).toBe("Inter");
      expect(t.font_size).toBe(1.0);
      expect(t.spacing).toBe("normal");
    }
  });

  it("defaults surface_style to 'solid' when omitted", () => {
    const themes = expand_blueprint(MINIMAL_BP);
    for (const t of themes) {
      expect(t.surface_style).toBe("solid");
    }
  });
});
