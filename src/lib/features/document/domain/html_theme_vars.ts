import type { Theme } from "$lib/shared/types/theme";

export type CarbideHtmlVars = {
  "--carbide-bg": string;
  "--carbide-fg": string;
  "--carbide-muted-fg": string;
  "--carbide-border": string;
  "--carbide-accent": string;
  "--carbide-accent-fg": string;
  "--carbide-link": string;
  "--carbide-code-bg": string;
  "--carbide-code-fg": string;
  "--carbide-font-sans": string;
  "--carbide-font-mono": string;
  "--carbide-scheme": "light" | "dark";
};

const DARK_PALETTE: Omit<
  CarbideHtmlVars,
  "--carbide-font-sans" | "--carbide-font-mono" | "--carbide-scheme"
> = {
  "--carbide-bg": "#18181b",
  "--carbide-fg": "#e4e4e7",
  "--carbide-muted-fg": "#a1a1aa",
  "--carbide-border": "#3f3f46",
  "--carbide-accent": "#60a5fa",
  "--carbide-accent-fg": "#0b0b0c",
  "--carbide-link": "#60a5fa",
  "--carbide-code-bg": "#27272a",
  "--carbide-code-fg": "#e4e4e7",
};

const LIGHT_PALETTE: Omit<
  CarbideHtmlVars,
  "--carbide-font-sans" | "--carbide-font-mono" | "--carbide-scheme"
> = {
  "--carbide-bg": "#ffffff",
  "--carbide-fg": "#18181b",
  "--carbide-muted-fg": "#71717a",
  "--carbide-border": "#e4e4e7",
  "--carbide-accent": "#2563eb",
  "--carbide-accent-fg": "#ffffff",
  "--carbide-link": "#2563eb",
  "--carbide-code-bg": "#f4f4f5",
  "--carbide-code-fg": "#18181b",
};

export function build_theme_vars(theme: Theme): CarbideHtmlVars {
  const palette = theme.color_scheme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  return {
    ...palette,
    "--carbide-font-sans": theme.font_family_sans,
    "--carbide-font-mono": theme.font_family_mono,
    "--carbide-scheme": theme.color_scheme,
  };
}

export function build_theme_style_block(theme: Theme): string {
  const vars = build_theme_vars(theme);
  const decls = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `<style>:root {\n${decls}\n  color-scheme: ${vars["--carbide-scheme"]};\n}</style>`;
}
