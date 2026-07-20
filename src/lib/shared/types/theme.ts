export type ThemeColorScheme = "dark" | "light";

export type ColorSchemePreference = "light" | "dark" | "system";

export type ThemeSpacing =
  | "extra_compact"
  | "compact"
  | "normal"
  | "spacious"
  | "extra_spacious";

export type ThemeDensity = "compact" | "regular" | "airy";

export type ThemeCssTheme =
  | "carbide"
  | "glass"
  | "spotlight"
  | "theater"
  | "obsidian";

export type ThemeHeadingColor = "inherit" | "primary" | "accent";

export type ThemeBoldStyle = "default" | "heavier" | "color-accent";

export type ThemeBlockquoteStyle = "default" | "minimal" | "accent-bar";

export type ThemeCodeBlockStyle = "default" | "borderless" | "filled";

export type SurfaceStyle = "solid" | "glass" | "transparent";

export type ThemeCategory = "core" | "stylized" | "layout" | "specialty";

export const THEME_CATEGORY_LABELS: Record<ThemeCategory, string> = {
  core: "Core",
  stylized: "Stylized",
  layout: "Layout",
  specialty: "Specialty",
};

export type ThemeLayoutVariant = "default" | "spotlight" | "theater";

export type Theme = {
  id: string;
  name: string;
  color_scheme: ThemeColorScheme;
  is_builtin: boolean;
  category: ThemeCategory;

  layout_variant: ThemeLayoutVariant;
  css_theme: ThemeCssTheme | null;
  density: ThemeDensity;

  accent_hue: number;
  accent_chroma: number;
  surface_hue: number;
  surface_chroma: number;
  surface_style: SurfaceStyle;
  font_family_sans: string;
  font_family_mono: string;

  font_size: number;
  line_height: number;
  spacing: ThemeSpacing;
  heading_color: ThemeHeadingColor;
  heading_font_weight: number;

  bold_style: ThemeBoldStyle;
  blockquote_style: ThemeBlockquoteStyle;
  code_block_style: ThemeCodeBlockStyle;

  editor_text_color: string | null;
  bold_color: string | null;
  italic_color: string | null;
  link_color: string | null;
  blockquote_border_color: string | null;
  blockquote_text_color: string | null;
  code_block_bg: string | null;
  code_block_text_color: string | null;
  inline_code_bg: string | null;
  inline_code_text_color: string | null;
  highlight_bg: string | null;
  highlight_text_color: string | null;

  shiki_theme_light: string;
  shiki_theme_dark: string;

  source_shiki_theme_light: string;
  source_shiki_theme_dark: string;

  graph_node_color: string | null;
  graph_node_primary_color: string | null;
  graph_edge_color: string | null;
  graph_edge_semantic_color: string | null;
  graph_label_color: string | null;

  token_overrides: Record<string, string>;
  auto_palette: boolean;
};

const SHARED_DEFAULTS: Omit<
  Theme,
  "id" | "name" | "color_scheme" | "is_builtin" | "category"
> = {
  layout_variant: "default",
  css_theme: null,
  density: "regular",
  accent_hue: 293.24,
  accent_chroma: 0.2808,
  surface_hue: 68,
  surface_chroma: 0.008,
  surface_style: "solid",
  font_family_sans: "Inter",
  font_family_mono: "IBM Plex Mono",
  font_size: 1.0,
  line_height: 1.75,
  spacing: "normal",
  heading_color: "inherit",
  heading_font_weight: 500,
  bold_style: "default",
  blockquote_style: "default",
  code_block_style: "default",
  editor_text_color: null,
  bold_color: null,
  italic_color: null,
  link_color: null,
  blockquote_border_color: null,
  blockquote_text_color: null,
  code_block_bg: null,
  code_block_text_color: null,
  inline_code_bg: null,
  inline_code_text_color: null,
  highlight_bg: null,
  highlight_text_color: null,
  shiki_theme_light: "github-light",
  shiki_theme_dark: "github-dark",
  source_shiki_theme_light: "",
  source_shiki_theme_dark: "",
  graph_node_color: null,
  graph_node_primary_color: null,
  graph_edge_color: null,
  graph_edge_semantic_color: null,
  graph_label_color: null,
  token_overrides: {},
  auto_palette: true,
};

export type ThemeBlueprint = {
  base_name: string;
  category: ThemeCategory;
  surface_hue: number;
  surface_chroma: number;
  accent_hue: number;
  accent_chroma: number;
  surface_style?: SurfaceStyle;
  layout_variant?: ThemeLayoutVariant;
  css_theme?: ThemeCssTheme | null;
  density?: ThemeDensity;
  schemes?: "both" | "dark_only";
  font_family_sans?: string;
  font_family_mono?: string;
  font_size?: number;
  line_height?: number;
  spacing?: ThemeSpacing;
  heading_color?: ThemeHeadingColor;
  heading_font_weight?: number;
  bold_style?: ThemeBoldStyle;
  blockquote_style?: ThemeBlockquoteStyle;
  code_block_style?: ThemeCodeBlockStyle;
  shiki_theme_dark?: string;
  structural_overrides?: Record<string, string>;
  color_overrides_light?: Record<string, string>;
  color_overrides_dark?: Record<string, string>;
};

function to_kebab(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export function expand_blueprint(bp: ThemeBlueprint): Theme[] {
  const schemes: ThemeColorScheme[] =
    bp.schemes === "dark_only" ? ["dark"] : ["light", "dark"];
  return schemes.map((scheme) => {
    const token_overrides: Record<string, string> = {};
    if (bp.structural_overrides)
      Object.assign(token_overrides, bp.structural_overrides);
    const color_ovr =
      scheme === "dark" ? bp.color_overrides_dark : bp.color_overrides_light;
    if (color_ovr) Object.assign(token_overrides, color_ovr);

    return {
      ...SHARED_DEFAULTS,
      id: `${to_kebab(bp.base_name)}-${scheme}`,
      name: `${bp.base_name} ${scheme === "dark" ? "Dark" : "Light"}`,
      color_scheme: scheme,
      is_builtin: true,
      category: bp.category,
      surface_hue: bp.surface_hue,
      surface_chroma: bp.surface_chroma,
      surface_style: bp.surface_style ?? "solid",
      accent_hue: bp.accent_hue,
      accent_chroma: bp.accent_chroma,
      ...(bp.layout_variant !== undefined && {
        layout_variant: bp.layout_variant,
      }),
      ...(bp.css_theme !== undefined && { css_theme: bp.css_theme }),
      ...(bp.density !== undefined && { density: bp.density }),
      ...(bp.font_family_sans !== undefined && {
        font_family_sans: bp.font_family_sans,
      }),
      ...(bp.font_family_mono !== undefined && {
        font_family_mono: bp.font_family_mono,
      }),
      ...(bp.font_size !== undefined && { font_size: bp.font_size }),
      ...(bp.line_height !== undefined && { line_height: bp.line_height }),
      ...(bp.spacing !== undefined && { spacing: bp.spacing }),
      ...(bp.heading_color !== undefined && {
        heading_color: bp.heading_color,
      }),
      ...(bp.heading_font_weight !== undefined && {
        heading_font_weight: bp.heading_font_weight,
      }),
      ...(bp.bold_style !== undefined && { bold_style: bp.bold_style }),
      ...(bp.blockquote_style !== undefined && {
        blockquote_style: bp.blockquote_style,
      }),
      ...(bp.code_block_style !== undefined && {
        code_block_style: bp.code_block_style,
      }),
      ...(bp.shiki_theme_dark !== undefined && {
        shiki_theme_dark: bp.shiki_theme_dark,
      }),
      token_overrides,
    };
  });
}

/* Accent identity: purple #7e1dfb = oklch(0.5337 0.2808 293.24), rendered
   exactly at the L0.5337 light anchor (ADR 0001 §4). Dark schemes lift L and
   rely on CSS gamut mapping (chroma-reducing, hue-preserving). */
const BP_CARBIDE: ThemeBlueprint = {
  base_name: "Carbide",
  category: "core",
  surface_hue: 68,
  surface_chroma: 0.008,
  accent_hue: 293.24,
  accent_chroma: 0.2808,
  css_theme: "carbide",
};

const BP_GLASS: ThemeBlueprint = {
  base_name: "Glass",
  category: "stylized",
  surface_hue: 0,
  surface_chroma: 0,
  accent_hue: 250,
  accent_chroma: 0.1,
  css_theme: "glass",
  surface_style: "glass",
  structural_overrides: {
    "--radius": "0.75rem",
    "--size-activity-bar": "3rem",
    "--size-activity-icon": "1.25rem",
  },
  color_overrides_light: {
    "--background": "oklch(0.97 0 0)",
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0 / 80%)",
    "--popover": "oklch(1 0 0)",
    "--primary": "oklch(0.4 0.1 250)",
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.95 0 0 / 70%)",
    "--secondary-foreground": "oklch(0.2 0 0)",
    "--muted": "oklch(0.95 0 0 / 60%)",
    "--muted-foreground": "oklch(0.45 0 0)",
    "--accent": "oklch(0.95 0 0 / 50%)",
    "--accent-foreground": "oklch(0.2 0 0)",
    "--border": "oklch(0 0 0 / 10%)",
    "--input": "oklch(0 0 0 / 10%)",
    "--ring": "oklch(0.4 0.1 250)",
    "--sidebar": "oklch(0.98 0 0 / 60%)",
    "--sidebar-border": "oklch(0 0 0 / 6%)",
    "--background-surface-2": "oklch(0.98 0 0 / 50%)",
    "--background-surface-3": "oklch(1 0 0 / 40%)",
    "--border-strong": "oklch(0 0 0 / 15%)",
    "--border-subtle": "oklch(0 0 0 / 5%)",
    "--interactive": "oklch(0.4 0.1 250)",
    "--interactive-hover": "oklch(0.35 0.1 250)",
    "--interactive-bg": "oklch(0.96 0 0 / 50%)",
    "--interactive-bg-hover": "oklch(0.93 0 0 / 60%)",
    "--focus-ring": "oklch(0.55 0.12 250)",
    "--selection-bg": "oklch(0.85 0.05 250 / 40%)",
    "--shadow-3": "0 10px 30px -5px oklch(0 0 0 / 10%)",
  },
  color_overrides_dark: {
    "--background": "oklch(0.13 0 0)",
    "--foreground": "oklch(0.985 0 0)",
    "--card": "oklch(0.15 0 0 / 80%)",
    "--popover": "oklch(0.18 0 0)",
    "--primary": "oklch(0.7 0.1 250)",
    "--primary-foreground": "oklch(0.1 0 0)",
    "--secondary": "oklch(0.21 0 0 / 70%)",
    "--secondary-foreground": "oklch(0.95 0 0)",
    "--muted": "oklch(0.21 0 0 / 60%)",
    "--muted-foreground": "oklch(0.6 0 0)",
    "--accent": "oklch(0.23 0 0 / 50%)",
    "--accent-foreground": "oklch(0.95 0 0)",
    "--border": "oklch(1 0 0 / 15%)",
    "--input": "oklch(1 0 0 / 15%)",
    "--ring": "oklch(0.7 0.1 250)",
    "--sidebar": "oklch(0.15 0 0 / 60%)",
    "--sidebar-border": "oklch(1 0 0 / 6%)",
    "--background-surface-2": "oklch(0.17 0 0 / 50%)",
    "--background-surface-3": "oklch(1 0 0 / 10%)",
    "--border-strong": "oklch(1 0 0 / 25%)",
    "--border-subtle": "oklch(1 0 0 / 5%)",
    "--interactive": "oklch(0.7 0.1 250)",
    "--interactive-hover": "oklch(0.76 0.1 250)",
    "--interactive-bg": "oklch(0.21 0 0 / 50%)",
    "--interactive-bg-hover": "oklch(0.25 0 0 / 60%)",
    "--focus-ring": "oklch(0.7 0.1 250)",
    "--selection-bg": "oklch(0.33 0.06 250 / 40%)",
    "--shadow-3": "0 10px 30px -5px oklch(0 0 0 / 25%)",
  },
};

const BP_SPOTLIGHT: ThemeBlueprint = {
  base_name: "Spotlight",
  category: "layout",
  surface_hue: 0,
  surface_chroma: 0,
  accent_hue: 210,
  accent_chroma: 0.06,
  layout_variant: "spotlight",
  css_theme: "spotlight",
  structural_overrides: {
    "--radius": "1rem",
  },
  color_overrides_light: {
    "--background": "oklch(0.98 0 0)",
    "--card": "oklch(1 0 0)",
    "--border": "oklch(0 0 0 / 8%)",
    "--primary": "oklch(0.45 0.06 210)",
    "--shadow-2":
      "0 8px 24px -4px oklch(0 0 0 / 8%), 0 2px 8px -2px oklch(0 0 0 / 4%)",
  },
  color_overrides_dark: {
    "--background": "oklch(0.09 0 0)",
    "--card": "oklch(0.15 0 0)",
    "--border": "oklch(1 0 0 / 8%)",
    "--primary": "oklch(0.7 0.06 210)",
    "--shadow-2":
      "0 8px 24px -4px oklch(0 0 0 / 30%), 0 2px 8px -2px oklch(0 0 0 / 20%)",
  },
};

const BP_THEATER: ThemeBlueprint = {
  base_name: "Theater",
  category: "layout",
  surface_hue: 0,
  surface_chroma: 0,
  accent_hue: 293.24,
  accent_chroma: 0.1,
  layout_variant: "theater",
  css_theme: "theater",
  structural_overrides: {
    "--radius": "0.75rem",
  },
  color_overrides_light: {
    "--background": "oklch(0.99 0 0)",
    "--card": "oklch(1 0 0)",
    "--border": "oklch(0 0 0 / 6%)",
    "--primary": "oklch(0.5 0.1 293.24)",
    "--interactive": "oklch(0.5 0.12 293.24)",
  },
  color_overrides_dark: {
    "--background": "oklch(0.08 0 0)",
    "--card": "oklch(0.13 0 0)",
    "--border": "oklch(1 0 0 / 6%)",
    "--primary": "oklch(0.7 0.1 293.24)",
    "--interactive": "oklch(0.7 0.12 293.24)",
  },
};

const OBSIDIAN_DARK_COLORS: Record<string, string> = {
  "--background": "oklch(0.13 0.018 275)",
  "--foreground": "oklch(0.96 0.008 280)",
  "--card": "oklch(0.24 0.022 275 / 0.7)",
  "--popover": "oklch(0.24 0.022 275 / 0.7)",
  "--primary": "oklch(0.78 0.19 285)",
  "--primary-foreground": "oklch(0.12 0.02 275)",
  "--secondary": "oklch(0.22 0.02 275 / 0.55)",
  "--muted": "oklch(0.22 0.02 275 / 0.55)",
  "--muted-foreground": "oklch(0.56 0.015 280)",
  "--accent": "oklch(0.78 0.2 325)",
  "--accent-foreground": "oklch(0.96 0.008 280)",
  "--border": "oklch(1 0 0 / 0.08)",
  "--border-strong": "oklch(1 0 0 / 0.16)",
  "--border-subtle": "oklch(1 0 0 / 0.08)",
  "--input": "oklch(1 0 0 / 0.08)",
  "--ring": "oklch(0.78 0.19 285)",
  "--sidebar": "oklch(0.22 0.02 275 / 0.55)",
  "--sidebar-border": "oklch(1 0 0 / 0.08)",
  "--background-surface-2": "oklch(0.22 0.02 275 / 0.55)",
  "--background-surface-3": "oklch(0.17 0.018 275 / 0.7)",
  "--interactive": "oklch(0.78 0.19 285)",
  "--interactive-bg":
    "color-mix(in oklch, oklch(0.78 0.19 285) 20%, transparent)",
  "--selection-bg":
    "color-mix(in oklch, oklch(0.78 0.19 285) 30%, transparent)",
  "--scrollbar-thumb": "oklch(1 0 0 / 0.12)",
};

const OBSIDIAN_LIGHT_COLORS: Record<string, string> = {
  "--background": "oklch(0.965 0.01 275)",
  "--card": "oklch(0.99 0.008 275 / 0.7)",
  "--popover": "oklch(0.99 0.008 275)",
  "--sidebar": "oklch(0.99 0.008 275 / 0.7)",
  "--border": "oklch(0 0 0 / 0.1)",
  "--border-strong": "oklch(0 0 0 / 0.18)",
  "--sidebar-border": "oklch(0 0 0 / 0.1)",
};

const BP_OBSIDIAN: ThemeBlueprint = {
  base_name: "Obsidian",
  category: "specialty",
  surface_hue: 275,
  surface_chroma: 0.018,
  accent_hue: 285,
  accent_chroma: 0.19,
  surface_style: "glass",
  layout_variant: "default",
  css_theme: "obsidian",
  schemes: "both",
  structural_overrides: {
    "--radius": "0.875rem",
    "--shadow-2": "0 4px 12px -2px oklch(0 0 0 / 0.4)",
    "--shadow-3": "0 20px 40px -10px oklch(0 0 0 / 0.6)",
  },
  color_overrides_light: OBSIDIAN_LIGHT_COLORS,
  color_overrides_dark: OBSIDIAN_DARK_COLORS,
};

const BLUEPRINTS: ThemeBlueprint[] = [
  BP_CARBIDE,
  BP_GLASS,
  BP_SPOTLIGHT,
  BP_THEATER,
  BP_OBSIDIAN,
];

export const BUILTIN_THEMES: readonly Theme[] =
  BLUEPRINTS.flatMap(expand_blueprint);

function find_builtin(id: string): Theme {
  const found = BUILTIN_THEMES.find((t) => t.id === id);
  if (!found) throw new Error(`Missing builtin theme: ${id}`);
  return found;
}

export const BUILTIN_CARBIDE_LIGHT: Theme = find_builtin("carbide-light");
export const BUILTIN_CARBIDE_DARK: Theme = find_builtin("carbide-dark");

export const AVAILABLE_SHIKI_THEMES = {
  light: [
    "github-light",
    "one-light",
    "catppuccin-latte",
    "rose-pine-dawn",
    "min-light",
    "slack-ochin",
  ],
  dark: [
    "github-dark",
    "one-dark-pro",
    "catppuccin-mocha",
    "dracula",
    "nord",
    "rose-pine",
    "tokyo-night",
    "slack-dark",
  ],
} as const;

export const DEFAULT_THEME_ID = "carbide-dark";
export const DEFAULT_LIGHT_THEME_ID = "carbide-light";
export const DEFAULT_DARK_THEME_ID = "carbide-dark";

export function get_all_themes(user_themes: Theme[]): Theme[] {
  return [...BUILTIN_THEMES, ...user_themes];
}

export function resolve_theme(all_themes: Theme[], active_id: string): Theme {
  return all_themes.find((t) => t.id === active_id) ?? BUILTIN_CARBIDE_DARK;
}

export function create_user_theme(name: string, base: Theme): Theme {
  return {
    ...base,
    id: crypto.randomUUID(),
    name,
    is_builtin: false,
  };
}

export function find_paired_theme_id(
  theme_id: string,
  all_themes: Theme[],
): string | null {
  const theme = all_themes.find((t) => t.id === theme_id);
  if (!theme) return null;
  const target_scheme = theme.color_scheme === "dark" ? "light" : "dark";
  const base_name = theme.name.replace(/ (Light|Dark)$/i, "");
  const paired = all_themes.find(
    (t) =>
      t.color_scheme === target_scheme &&
      t.name.replace(/ (Light|Dark)$/i, "") === base_name,
  );
  if (paired) return paired.id;
  return all_themes.find((t) => t.color_scheme === target_scheme)?.id ?? null;
}

export type ThemeCategoryGroup = {
  category: ThemeCategory;
  label: string;
  themes: Theme[];
};

const CATEGORY_ORDER: ThemeCategory[] = [
  "core",
  "stylized",
  "layout",
  "specialty",
];

export function group_themes_by_category(
  themes: Theme[],
): ThemeCategoryGroup[] {
  const by_cat = new Map<ThemeCategory, Theme[]>();
  for (const t of themes) {
    const cat = t.category;
    const arr = by_cat.get(cat);
    if (arr) arr.push(t);
    else by_cat.set(cat, [t]);
  }
  return CATEGORY_ORDER.filter((c) => by_cat.has(c)).map((c) => ({
    category: c,
    label: THEME_CATEGORY_LABELS[c],
    themes: by_cat.get(c)!,
  }));
}
