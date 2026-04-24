import { describe, it, expect } from "vitest";
import {
  generate_palette,
  apply_auto_palette,
  generate_ui_tokens,
  type UiTokenParams,
} from "$lib/shared/utils/palette_generator";
import type { Theme } from "$lib/shared/types/theme";
import { BUILTIN_NORDIC_DARK } from "$lib/shared/types/theme";

const OKLCH_RE = /^oklch\(\d+\.\d+ \d+\.\d+ \d+(\.\d+)?\)$/;

describe("generate_palette", () => {
  it("produces valid OKLch strings for all roles", () => {
    const palette = generate_palette(155, 0.11, "light");
    for (const [key, value] of Object.entries(palette)) {
      expect(value, `${key} should be valid OKLch`).toMatch(OKLCH_RE);
    }
  });

  it("generates all 12 semantic color roles", () => {
    const palette = generate_palette(200, 0.15, "dark");
    const keys = Object.keys(palette);
    expect(keys).toHaveLength(12);
    expect(keys).toContain("editor_text_color");
    expect(keys).toContain("link_color");
    expect(keys).toContain("highlight_bg");
    expect(keys).toContain("highlight_text_color");
  });

  it("light scheme has lower lightness for text roles than dark scheme", () => {
    const light = generate_palette(155, 0.11, "light");
    const dark = generate_palette(155, 0.11, "dark");

    const extract_lightness = (s: string) => {
      const m = s.match(/oklch\((\d+\.\d+)/);
      return parseFloat(m?.[1] ?? "0");
    };

    expect(extract_lightness(light.link_color)).toBeLessThan(
      extract_lightness(dark.link_color),
    );
    expect(extract_lightness(light.editor_text_color)).toBeLessThan(
      extract_lightness(dark.editor_text_color),
    );
  });

  it("uses hue offset for highlights", () => {
    const palette = generate_palette(100, 0.15, "light");
    expect(palette.highlight_bg).toContain("130.0");
    expect(palette.link_color).toContain("100.0");
  });
});

describe("apply_auto_palette", () => {
  function make_theme(overrides: Partial<Theme> = {}): Theme {
    return { ...BUILTIN_NORDIC_DARK, is_builtin: false, ...overrides };
  }

  it("fills null color fields when auto_palette is true", () => {
    const theme = make_theme({ auto_palette: true, link_color: null });
    const result = apply_auto_palette(theme);
    expect(result.link_color).not.toBeNull();
    expect(result.link_color).toMatch(OKLCH_RE);
  });

  it("preserves non-null overrides", () => {
    const custom_link = "oklch(0.6 0.2 300)";
    const theme = make_theme({
      auto_palette: true,
      link_color: custom_link,
    });
    const result = apply_auto_palette(theme);
    expect(result.link_color).toBe(custom_link);
  });

  it("returns theme unchanged when auto_palette is false", () => {
    const theme = make_theme({ auto_palette: false, link_color: null });
    const result = apply_auto_palette(theme);
    expect(result.link_color).toBeNull();
  });

  it("does not mutate the original theme object", () => {
    const theme = make_theme({ auto_palette: true });
    const result = apply_auto_palette(theme);
    expect(result).not.toBe(theme);
    expect(theme.link_color).toBeNull();
  });
});

const NORDIC_DARK_PARAMS: UiTokenParams = {
  surface_hue: 68,
  surface_chroma: 0.008,
  accent_hue: 155,
  accent_chroma: 0.11,
  scheme: "dark",
  style: "solid",
};

describe("generate_ui_tokens", () => {
  it("produces expected tokens for Nordic dark defaults", () => {
    const tokens = generate_ui_tokens(NORDIC_DARK_PARAMS);
    expect(tokens["--background"]).toBe("oklch(0.180 0.0080 68.0)");
    expect(tokens["--foreground"]).toBe("oklch(0.920 0.0080 68.0)");
    expect(tokens["--card"]).toBe("oklch(0.220 0.0080 68.0)");
    expect(tokens["--primary"]).toBe("oklch(0.680 0.1100 155.0)");
    expect(tokens["--interactive"]).toBe("oklch(0.680 0.1100 155.0)");
    expect(tokens["--interactive-hover"]).toBe("oklch(0.730 0.1100 155.0)");
  });

  it("produces light-scheme tokens with higher surface lightness", () => {
    const tokens = generate_ui_tokens({
      ...NORDIC_DARK_PARAMS,
      scheme: "light",
    });
    expect(tokens["--background"]).toBe("oklch(0.985 0.0080 68.0)");
    expect(tokens["--foreground"]).toBe("oklch(0.250 0.0080 68.0)");
    expect(tokens["--primary"]).toBe("oklch(0.480 0.1100 155.0)");
  });

  it("adds alpha channels for glass style", () => {
    const tokens = generate_ui_tokens({
      ...NORDIC_DARK_PARAMS,
      style: "glass",
    });
    expect(tokens["--card"]).toContain("/ 0.55)");
    expect(tokens["--sidebar"]).toContain("/ 0.55)");
    expect(tokens["--secondary"]).toContain("/ 0.55)");
    expect(tokens["--muted"]).toContain("/ 0.55)");
    expect(tokens["--background-surface-2"]).toContain("/ 0.55)");
    expect(tokens["--background"]).not.toContain("/");
    expect(tokens["--foreground"]).not.toContain("/");
  });

  it("uses accent params for accent-sourced tokens", () => {
    const tokens = generate_ui_tokens({
      surface_hue: 200,
      surface_chroma: 0.02,
      accent_hue: 300,
      accent_chroma: 0.25,
      scheme: "dark",
      style: "solid",
    });
    expect(tokens["--primary"]).toContain("300.0");
    expect(tokens["--primary"]).toContain("0.2500");
    expect(tokens["--background"]).toContain("200.0");
  });

  it("uses neutral (0 chroma) for primary-foreground", () => {
    const tokens = generate_ui_tokens(NORDIC_DARK_PARAMS);
    expect(tokens["--primary-foreground"]).toBe("oklch(0.100 0.0000 0.0)");
  });

  it("generates ring, accent, and scrollbar tokens", () => {
    const tokens = generate_ui_tokens(NORDIC_DARK_PARAMS);
    expect(tokens["--ring"]).toContain("155.0");
    expect(tokens["--accent"]).toContain("155.0");
    expect(tokens["--accent-foreground"]).toContain("155.0");
    expect(tokens["--scrollbar-thumb"]).toBeDefined();
    expect(tokens["--scrollbar-thumb-hover"]).toBeDefined();
  });
});
