export type ThemeColorScheme = "dark" | "light";

export type ThemeSpacing = "compact" | "normal" | "spacious";

export type ThemeHeadingColor = "inherit" | "primary" | "accent";

export type ThemeBoldStyle = "default" | "heavier" | "color-accent";

export type ThemeBlockquoteStyle = "default" | "minimal" | "accent-bar";

export type ThemeCodeBlockStyle = "default" | "borderless" | "filled";

export type Theme = {
  id: string;
  name: string;
  color_scheme: ThemeColorScheme;
  is_builtin: boolean;

  accent_hue: number;
  accent_chroma: number;
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

  token_overrides: Record<string, string>;
};

const SHARED_DEFAULTS: Omit<
  Theme,
  "id" | "name" | "color_scheme" | "is_builtin"
> = {
  accent_hue: 155,
  accent_chroma: 0.11,
  font_family_sans: "Inter",
  font_family_mono: "JetBrains Mono",
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
  token_overrides: {},
};

export const BUILTIN_NORDIC_LIGHT: Theme = {
  id: "nordic-light",
  name: "Nordic Light",
  color_scheme: "light",
  is_builtin: true,
  ...SHARED_DEFAULTS,
};

export const BUILTIN_NORDIC_DARK: Theme = {
  id: "nordic-dark",
  name: "Nordic Dark",
  color_scheme: "dark",
  is_builtin: true,
  ...SHARED_DEFAULTS,
};

export const BUILTIN_BRUTALIST_LIGHT: Theme = {
  id: "brutalist-light",
  name: "Brutalist Light",
  color_scheme: "light",
  is_builtin: true,
  ...SHARED_DEFAULTS,
  accent_hue: 30,
  accent_chroma: 0.18,
  font_family_sans: "SF Mono",
  heading_font_weight: 800,
  bold_style: "heavier",
  blockquote_style: "minimal",
  code_block_style: "borderless",
  spacing: "compact",
  token_overrides: {
    "--radius": "0",
    "--background": "oklch(0.97 0 0)",
    "--foreground": "oklch(0.1 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.1 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.1 0 0)",
    "--primary": "oklch(0.1 0 0)",
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.93 0 0)",
    "--secondary-foreground": "oklch(0.1 0 0)",
    "--muted": "oklch(0.93 0 0)",
    "--muted-foreground": "oklch(0.45 0 0)",
    "--accent": "oklch(0.85 0.18 30)",
    "--accent-foreground": "oklch(0.1 0 0)",
    "--border": "oklch(0.1 0 0)",
    "--input": "oklch(0.1 0 0)",
    "--ring": "oklch(0.1 0 0)",
    "--sidebar": "oklch(0.97 0 0)",
    "--sidebar-foreground": "oklch(0.1 0 0)",
    "--sidebar-border": "oklch(0.1 0 0)",
    "--background-surface-2": "oklch(0.95 0 0)",
    "--background-surface-3": "oklch(0.93 0 0)",
    "--border-strong": "oklch(0.1 0 0)",
    "--border-subtle": "oklch(0.7 0 0)",
    "--accent-hover": "oklch(0.9 0 0)",
    "--interactive": "oklch(0.1 0 0)",
    "--interactive-hover": "oklch(0.85 0.18 30)",
    "--interactive-bg": "oklch(0.93 0 0)",
    "--interactive-bg-hover": "oklch(0.88 0 0)",
    "--focus-ring": "oklch(0.85 0.18 30)",
    "--selection-bg": "oklch(0.88 0.1 30)",
    "--shadow-xs": "none",
    "--shadow-sm": "none",
    "--shadow-md": "none",
    "--shadow-lg": "none",
    "--border-width-default": "2px",
    "--scrollbar-width": "8px",
    "--scrollbar-thumb": "oklch(0.1 0 0)",
    "--scrollbar-thumb-hover": "oklch(0.85 0.18 30)",
  },
};

export const BUILTIN_BRUTALIST_DARK: Theme = {
  id: "brutalist-dark",
  name: "Brutalist Dark",
  color_scheme: "dark",
  is_builtin: true,
  ...SHARED_DEFAULTS,
  accent_hue: 30,
  accent_chroma: 0.2,
  font_family_sans: "SF Mono",
  heading_font_weight: 800,
  bold_style: "heavier",
  blockquote_style: "minimal",
  code_block_style: "borderless",
  spacing: "compact",
  token_overrides: {
    "--radius": "0",
    "--background": "oklch(0.08 0 0)",
    "--foreground": "oklch(0.95 0 0)",
    "--card": "oklch(0.12 0 0)",
    "--card-foreground": "oklch(0.95 0 0)",
    "--popover": "oklch(0.12 0 0)",
    "--popover-foreground": "oklch(0.95 0 0)",
    "--primary": "oklch(0.95 0 0)",
    "--primary-foreground": "oklch(0.08 0 0)",
    "--secondary": "oklch(0.16 0 0)",
    "--secondary-foreground": "oklch(0.95 0 0)",
    "--muted": "oklch(0.16 0 0)",
    "--muted-foreground": "oklch(0.6 0 0)",
    "--accent": "oklch(0.7 0.2 30)",
    "--accent-foreground": "oklch(0.95 0 0)",
    "--border": "oklch(0.95 0 0)",
    "--input": "oklch(0.95 0 0)",
    "--ring": "oklch(0.95 0 0)",
    "--sidebar": "oklch(0.08 0 0)",
    "--sidebar-foreground": "oklch(0.95 0 0)",
    "--sidebar-border": "oklch(0.95 0 0)",
    "--background-surface-2": "oklch(0.1 0 0)",
    "--background-surface-3": "oklch(0.14 0 0)",
    "--border-strong": "oklch(0.95 0 0)",
    "--border-subtle": "oklch(0.3 0 0)",
    "--accent-hover": "oklch(0.18 0 0)",
    "--interactive": "oklch(0.95 0 0)",
    "--interactive-hover": "oklch(0.7 0.2 30)",
    "--interactive-bg": "oklch(0.16 0 0)",
    "--interactive-bg-hover": "oklch(0.2 0 0)",
    "--focus-ring": "oklch(0.7 0.2 30)",
    "--selection-bg": "oklch(0.25 0.08 30)",
    "--shadow-xs": "none",
    "--shadow-sm": "none",
    "--shadow-md": "none",
    "--shadow-lg": "none",
    "--border-width-default": "2px",
    "--scrollbar-thumb": "oklch(0.95 0 0)",
    "--scrollbar-thumb-hover": "oklch(0.7 0.2 30)",
  },
};

export const BUILTIN_NEON_LIGHT: Theme = {
  id: "neon-light",
  name: "Neon Light",
  color_scheme: "light",
  is_builtin: true,
  ...SHARED_DEFAULTS,
  accent_hue: 300,
  accent_chroma: 0.25,
  heading_color: "primary",
  bold_style: "color-accent",
  code_block_style: "filled",
  token_overrides: {
    "--radius": "0.375rem",
    "--background": "oklch(0.99 0 0)",
    "--foreground": "oklch(0.15 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.15 0 0)",
    "--popover": "oklch(1 0 0)",
    "--popover-foreground": "oklch(0.15 0 0)",
    "--primary": "oklch(0.55 0.25 300)",
    "--primary-foreground": "oklch(1 0 0)",
    "--secondary": "oklch(0.96 0.02 300)",
    "--secondary-foreground": "oklch(0.2 0 0)",
    "--muted": "oklch(0.96 0.01 300)",
    "--muted-foreground": "oklch(0.5 0 0)",
    "--accent": "oklch(0.7 0.2 195)",
    "--accent-foreground": "oklch(0.15 0 0)",
    "--border": "oklch(0.92 0.015 300)",
    "--input": "oklch(0.92 0.015 300)",
    "--ring": "oklch(0.55 0.25 300)",
    "--sidebar": "oklch(0.98 0.01 300)",
    "--sidebar-foreground": "oklch(0.15 0 0)",
    "--sidebar-border": "oklch(0.92 0.015 300)",
    "--background-surface-2": "oklch(0.97 0.01 300)",
    "--background-surface-3": "oklch(0.95 0.015 300)",
    "--border-strong": "oklch(0.85 0.02 300)",
    "--border-subtle": "oklch(0.95 0.01 300)",
    "--accent-hover": "oklch(0.94 0.02 300)",
    "--interactive": "oklch(0.55 0.25 300)",
    "--interactive-hover": "oklch(0.48 0.25 300)",
    "--interactive-bg": "oklch(0.96 0.03 300)",
    "--interactive-bg-hover": "oklch(0.93 0.04 300)",
    "--focus-ring": "oklch(0.7 0.2 195)",
    "--selection-bg": "oklch(0.92 0.05 300)",
    "--shadow-sm": "0 2px 8px oklch(0.55 0.15 300 / 10%)",
    "--shadow-md": "0 4px 16px oklch(0.55 0.15 300 / 12%)",
    "--shadow-lg": "0 8px 32px oklch(0.55 0.15 300 / 15%)",
  },
};

export const BUILTIN_NEON_DARK: Theme = {
  id: "neon-dark",
  name: "Neon Dark",
  color_scheme: "dark",
  is_builtin: true,
  ...SHARED_DEFAULTS,
  accent_hue: 300,
  accent_chroma: 0.25,
  heading_color: "primary",
  bold_style: "color-accent",
  code_block_style: "filled",
  token_overrides: {
    "--radius": "0.375rem",
    "--background": "oklch(0.06 0.015 280)",
    "--foreground": "oklch(0.92 0.01 280)",
    "--card": "oklch(0.1 0.02 280)",
    "--card-foreground": "oklch(0.92 0.01 280)",
    "--popover": "oklch(0.1 0.02 280)",
    "--popover-foreground": "oklch(0.92 0.01 280)",
    "--primary": "oklch(0.72 0.25 300)",
    "--primary-foreground": "oklch(0.06 0 0)",
    "--secondary": "oklch(0.14 0.02 280)",
    "--secondary-foreground": "oklch(0.92 0.01 280)",
    "--muted": "oklch(0.14 0.02 280)",
    "--muted-foreground": "oklch(0.55 0.01 280)",
    "--accent": "oklch(0.75 0.18 195)",
    "--accent-foreground": "oklch(0.06 0 0)",
    "--border": "oklch(0.72 0.25 300 / 20%)",
    "--input": "oklch(0.72 0.25 300 / 25%)",
    "--ring": "oklch(0.72 0.25 300)",
    "--sidebar": "oklch(0.07 0.015 280)",
    "--sidebar-foreground": "oklch(0.92 0.01 280)",
    "--sidebar-border": "oklch(0.72 0.25 300 / 15%)",
    "--background-surface-2": "oklch(0.09 0.02 280)",
    "--background-surface-3": "oklch(0.12 0.02 280)",
    "--border-strong": "oklch(0.72 0.25 300 / 35%)",
    "--border-subtle": "oklch(0.72 0.25 300 / 10%)",
    "--accent-hover": "oklch(0.14 0.03 280)",
    "--interactive": "oklch(0.72 0.25 300)",
    "--interactive-hover": "oklch(0.78 0.22 300)",
    "--interactive-bg": "oklch(0.14 0.04 300)",
    "--interactive-bg-hover": "oklch(0.18 0.05 300)",
    "--focus-ring": "oklch(0.75 0.18 195)",
    "--selection-bg": "oklch(0.18 0.08 300)",
    "--shadow-sm": "0 2px 10px oklch(0.72 0.2 300 / 15%)",
    "--shadow-md": "0 4px 20px oklch(0.72 0.2 300 / 20%)",
    "--shadow-lg": "0 8px 40px oklch(0.72 0.2 300 / 25%)",
    "--scrollbar-thumb": "oklch(0.72 0.25 300 / 30%)",
    "--scrollbar-thumb-hover": "oklch(0.72 0.25 300 / 50%)",
  },
};

export const BUILTIN_PAPER_LIGHT: Theme = {
  id: "paper-light",
  name: "Paper Light",
  color_scheme: "light",
  is_builtin: true,
  ...SHARED_DEFAULTS,
  accent_hue: 45,
  accent_chroma: 0.08,
  font_size: 1.0625,
  line_height: 1.85,
  spacing: "spacious",
  heading_color: "primary",
  heading_font_weight: 600,
  blockquote_style: "accent-bar",
  link_color: "hsl(25, 60%, 35%)",
  token_overrides: {
    "--radius": "0.25rem",
    "--background": "oklch(0.96 0.015 75)",
    "--foreground": "oklch(0.22 0.02 55)",
    "--card": "oklch(0.98 0.012 78)",
    "--card-foreground": "oklch(0.22 0.02 55)",
    "--popover": "oklch(0.98 0.012 78)",
    "--popover-foreground": "oklch(0.22 0.02 55)",
    "--primary": "oklch(0.42 0.08 45)",
    "--primary-foreground": "oklch(0.97 0.01 75)",
    "--secondary": "oklch(0.93 0.018 75)",
    "--secondary-foreground": "oklch(0.22 0.02 55)",
    "--muted": "oklch(0.93 0.015 75)",
    "--muted-foreground": "oklch(0.52 0.02 60)",
    "--accent": "oklch(0.88 0.04 75)",
    "--accent-foreground": "oklch(0.3 0.03 55)",
    "--border": "oklch(0.88 0.02 72)",
    "--input": "oklch(0.88 0.02 72)",
    "--ring": "oklch(0.42 0.08 45)",
    "--sidebar": "oklch(0.94 0.018 74)",
    "--sidebar-foreground": "oklch(0.22 0.02 55)",
    "--sidebar-border": "oklch(0.88 0.02 72)",
    "--background-surface-2": "oklch(0.94 0.016 76)",
    "--background-surface-3": "oklch(0.91 0.02 73)",
    "--border-strong": "oklch(0.82 0.025 70)",
    "--border-subtle": "oklch(0.92 0.012 76)",
    "--accent-hover": "oklch(0.91 0.02 74)",
    "--interactive": "oklch(0.42 0.08 45)",
    "--interactive-hover": "oklch(0.36 0.08 45)",
    "--interactive-bg": "oklch(0.94 0.025 60)",
    "--interactive-bg-hover": "oklch(0.91 0.03 58)",
    "--focus-ring": "oklch(0.55 0.1 45)",
    "--selection-bg": "oklch(0.9 0.04 60)",
    "--scrollbar-thumb": "oklch(0.82 0.025 70)",
    "--scrollbar-thumb-hover": "oklch(0.75 0.03 65)",
  },
};

export const BUILTIN_PAPER_DARK: Theme = {
  id: "paper-dark",
  name: "Paper Dark",
  color_scheme: "dark",
  is_builtin: true,
  ...SHARED_DEFAULTS,
  accent_hue: 45,
  accent_chroma: 0.1,
  font_size: 1.0625,
  line_height: 1.85,
  spacing: "spacious",
  heading_color: "primary",
  heading_font_weight: 600,
  blockquote_style: "accent-bar",
  link_color: "hsl(25, 60%, 55%)",
  token_overrides: {
    "--radius": "0.25rem",
    "--background": "oklch(0.16 0.015 55)",
    "--foreground": "oklch(0.9 0.015 75)",
    "--card": "oklch(0.2 0.015 55)",
    "--card-foreground": "oklch(0.9 0.015 75)",
    "--popover": "oklch(0.2 0.015 55)",
    "--popover-foreground": "oklch(0.9 0.015 75)",
    "--primary": "oklch(0.68 0.1 45)",
    "--primary-foreground": "oklch(0.12 0.01 55)",
    "--secondary": "oklch(0.22 0.015 55)",
    "--secondary-foreground": "oklch(0.9 0.015 75)",
    "--muted": "oklch(0.22 0.015 55)",
    "--muted-foreground": "oklch(0.58 0.015 65)",
    "--accent": "oklch(0.3 0.025 55)",
    "--accent-foreground": "oklch(0.9 0.015 75)",
    "--border": "oklch(0.3 0.02 55)",
    "--input": "oklch(0.3 0.02 55)",
    "--ring": "oklch(0.68 0.1 45)",
    "--sidebar": "oklch(0.17 0.015 55)",
    "--sidebar-foreground": "oklch(0.9 0.015 75)",
    "--sidebar-border": "oklch(0.28 0.015 55)",
    "--background-surface-2": "oklch(0.19 0.015 55)",
    "--background-surface-3": "oklch(0.23 0.015 55)",
    "--border-strong": "oklch(0.36 0.02 55)",
    "--border-subtle": "oklch(0.22 0.01 55)",
    "--accent-hover": "oklch(0.25 0.02 55)",
    "--interactive": "oklch(0.68 0.1 45)",
    "--interactive-hover": "oklch(0.74 0.1 45)",
    "--interactive-bg": "oklch(0.22 0.03 50)",
    "--interactive-bg-hover": "oklch(0.26 0.035 48)",
    "--focus-ring": "oklch(0.68 0.1 45)",
    "--selection-bg": "oklch(0.26 0.04 50)",
    "--scrollbar-thumb": "oklch(0.3 0.015 55)",
    "--scrollbar-thumb-hover": "oklch(0.38 0.02 55)",
  },
};

export const BUILTIN_THEMES: readonly Theme[] = [
  BUILTIN_NORDIC_LIGHT,
  BUILTIN_NORDIC_DARK,
  BUILTIN_BRUTALIST_LIGHT,
  BUILTIN_BRUTALIST_DARK,
  BUILTIN_NEON_LIGHT,
  BUILTIN_NEON_DARK,
  BUILTIN_PAPER_LIGHT,
  BUILTIN_PAPER_DARK,
];

export const DEFAULT_THEME_ID = "nordic-dark";

export function get_all_themes(user_themes: Theme[]): Theme[] {
  return [...BUILTIN_THEMES, ...user_themes];
}

export function resolve_theme(all_themes: Theme[], active_id: string): Theme {
  return all_themes.find((t) => t.id === active_id) ?? BUILTIN_NORDIC_DARK;
}

export function create_user_theme(name: string, base: Theme): Theme {
  return {
    ...base,
    id: crypto.randomUUID(),
    name,
    is_builtin: false,
  };
}
