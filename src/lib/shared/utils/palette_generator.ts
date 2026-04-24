import type {
  Theme,
  ThemeColorScheme,
  SurfaceStyle,
} from "$lib/shared/types/theme";

export type GeneratedPalette = {
  editor_text_color: string;
  link_color: string;
  bold_color: string;
  italic_color: string;
  blockquote_border_color: string;
  blockquote_text_color: string;
  code_block_bg: string;
  code_block_text_color: string;
  inline_code_bg: string;
  inline_code_text_color: string;
  highlight_bg: string;
  highlight_text_color: string;
};

function oklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(4)} ${(h % 360).toFixed(1)})`;
}

type PaletteSpec = {
  [K in keyof GeneratedPalette]: {
    light: [l: number, c_factor: number, h_offset: number];
    dark: [l: number, c_factor: number, h_offset: number];
  };
};

const SPEC: PaletteSpec = {
  editor_text_color: {
    light: [0.25, 0.02 / 0.11, 0],
    dark: [0.88, 0.02 / 0.11, 0],
  },
  link_color: {
    light: [0.5, 1, 0],
    dark: [0.72, 1, 0],
  },
  bold_color: {
    light: [0.42, 0.6, 0],
    dark: [0.75, 0.6, 0],
  },
  italic_color: {
    light: [0.48, 0.4, 0],
    dark: [0.7, 0.4, 0],
  },
  blockquote_border_color: {
    light: [0.6, 0.5, 0],
    dark: [0.55, 0.5, 0],
  },
  blockquote_text_color: {
    light: [0.45, 0.2, 0],
    dark: [0.7, 0.2, 0],
  },
  code_block_bg: {
    light: [0.95, 0.08, 0],
    dark: [0.18, 0.08, 0],
  },
  code_block_text_color: {
    light: [0.35, 0.3, 0],
    dark: [0.8, 0.3, 0],
  },
  inline_code_bg: {
    light: [0.93, 0.12, 0],
    dark: [0.2, 0.12, 0],
  },
  inline_code_text_color: {
    light: [0.4, 0.4, 0],
    dark: [0.78, 0.4, 0],
  },
  highlight_bg: {
    light: [0.88, 0.3, 30],
    dark: [0.3, 0.3, 30],
  },
  highlight_text_color: {
    light: [0.25, 0.1, 30],
    dark: [0.9, 0.1, 30],
  },
};

export function generate_palette(
  hue: number,
  chroma: number,
  scheme: ThemeColorScheme,
): GeneratedPalette {
  const result = {} as GeneratedPalette;
  for (const [key, spec] of Object.entries(SPEC) as [
    keyof GeneratedPalette,
    PaletteSpec[keyof GeneratedPalette],
  ][]) {
    const [l, c_factor, h_offset] = spec[scheme];
    result[key] = oklch(l, chroma * c_factor, hue + h_offset);
  }
  return result;
}

const PALETTE_KEYS: (keyof GeneratedPalette)[] = [
  "editor_text_color",
  "link_color",
  "bold_color",
  "italic_color",
  "blockquote_border_color",
  "blockquote_text_color",
  "code_block_bg",
  "code_block_text_color",
  "inline_code_bg",
  "inline_code_text_color",
  "highlight_bg",
  "highlight_text_color",
];

export type UiTokenParams = {
  surface_hue: number;
  surface_chroma: number;
  accent_hue: number;
  accent_chroma: number;
  scheme: ThemeColorScheme;
  style: SurfaceStyle;
};

type TokenSpec = {
  light_l: number;
  dark_l: number;
  source: "surface" | "accent" | "neutral";
  alpha?: number;
  glass_alpha?: number;
};

const UI_TOKEN_SPECS: Record<string, TokenSpec> = {
  "--background": { light_l: 0.985, dark_l: 0.18, source: "surface" },
  "--foreground": { light_l: 0.25, dark_l: 0.92, source: "surface" },
  "--card": {
    light_l: 0.985,
    dark_l: 0.22,
    source: "surface",
    glass_alpha: 0.55,
  },
  "--card-foreground": { light_l: 0.25, dark_l: 0.92, source: "surface" },
  "--popover": {
    light_l: 0.99,
    dark_l: 0.22,
    source: "surface",
    glass_alpha: 0.55,
  },
  "--popover-foreground": { light_l: 0.25, dark_l: 0.92, source: "surface" },
  "--secondary": {
    light_l: 0.965,
    dark_l: 0.265,
    source: "surface",
    glass_alpha: 0.55,
  },
  "--secondary-foreground": {
    light_l: 0.25,
    dark_l: 0.92,
    source: "surface",
  },
  "--muted": {
    light_l: 0.965,
    dark_l: 0.265,
    source: "surface",
    glass_alpha: 0.55,
  },
  "--muted-foreground": { light_l: 0.55, dark_l: 0.58, source: "surface" },
  "--border": { light_l: 0.92, dark_l: 0.31, source: "surface" },
  "--input": { light_l: 0.92, dark_l: 0.33, source: "surface" },
  "--sidebar": {
    light_l: 0.985,
    dark_l: 0.19,
    source: "surface",
    glass_alpha: 0.55,
  },
  "--sidebar-foreground": { light_l: 0.25, dark_l: 0.92, source: "surface" },
  "--sidebar-border": { light_l: 0.94, dark_l: 0.28, source: "surface" },
  "--background-surface-2": {
    light_l: 0.965,
    dark_l: 0.225,
    source: "surface",
    glass_alpha: 0.55,
  },
  "--background-surface-3": {
    light_l: 0.94,
    dark_l: 0.255,
    source: "surface",
  },
  "--foreground-tertiary": {
    light_l: 0.62,
    dark_l: 0.55,
    source: "surface",
  },
  "--border-strong": { light_l: 0.86, dark_l: 0.38, source: "surface" },
  "--border-subtle": { light_l: 0.95, dark_l: 0.225, source: "surface" },
  "--accent-hover": { light_l: 0.94, dark_l: 0.3, source: "surface" },
  "--primary": { light_l: 0.48, dark_l: 0.68, source: "accent" },
  "--primary-foreground": { light_l: 1.0, dark_l: 0.1, source: "neutral" },
  "--interactive": { light_l: 0.48, dark_l: 0.68, source: "accent" },
  "--interactive-hover": { light_l: 0.43, dark_l: 0.73, source: "accent" },
  "--scrollbar-thumb": { light_l: 0.89, dark_l: 0.33, source: "surface" },
  "--scrollbar-thumb-hover": {
    light_l: 0.83,
    dark_l: 0.4,
    source: "surface",
  },
};

function resolve_hc(
  spec: TokenSpec,
  params: UiTokenParams,
): { h: number; c: number } {
  switch (spec.source) {
    case "surface":
      return { h: params.surface_hue, c: params.surface_chroma };
    case "accent":
      return { h: params.accent_hue, c: params.accent_chroma };
    case "neutral":
      return { h: 0, c: 0 };
  }
}

export function generate_ui_tokens(
  params: UiTokenParams,
): Record<string, string> {
  const is_dark = params.scheme === "dark";
  const is_glass = params.style === "glass";
  const tokens: Record<string, string> = {};

  for (const [key, spec] of Object.entries(UI_TOKEN_SPECS)) {
    const l = is_dark ? spec.dark_l : spec.light_l;
    const { h, c } = resolve_hc(spec, params);
    const alpha = is_glass ? spec.glass_alpha : undefined;

    if (alpha !== undefined) {
      tokens[key] =
        `oklch(${l.toFixed(3)} ${c.toFixed(4)} ${(h % 360).toFixed(1)} / ${String(alpha)})`;
    } else {
      tokens[key] = oklch(l, c, h);
    }
  }

  // --ring aliases --focus-ring which derives from accent
  tokens["--ring"] = oklch(
    is_dark ? 0.68 : 0.6,
    is_dark ? 0.11 : 0.1,
    params.accent_hue,
  );

  // --accent (shadcn) and --accent-foreground from accent scale
  if (is_dark) {
    tokens["--accent"] = oklch(0.32, 0.06, params.accent_hue);
    tokens["--accent-foreground"] = oklch(0.88, 0.06, params.accent_hue);
  } else {
    tokens["--accent"] = oklch(0.94, 0.03, params.accent_hue);
    tokens["--accent-foreground"] = oklch(0.37, 0.09, params.accent_hue);
  }

  return tokens;
}

export function apply_auto_palette(theme: Theme): Theme {
  if (!theme.auto_palette) return theme;

  const palette = generate_palette(
    theme.accent_hue,
    theme.accent_chroma,
    theme.color_scheme,
  );

  const patched = { ...theme };
  for (const key of PALETTE_KEYS) {
    if (patched[key] === null) {
      (patched as unknown as Record<string, string | null>)[key] = palette[key];
    }
  }
  return patched;
}
