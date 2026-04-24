import type { Theme, ColorSchemePreference } from "$lib/shared/types/theme";
import {
  apply_auto_palette,
  generate_ui_tokens,
} from "$lib/shared/utils/palette_generator";
import { resolve_font_stack } from "$lib/shared/utils/theme_helpers";

const SPACING_MAP: Record<string, string> = {
  extra_compact: "0.75rem",
  compact: "1rem",
  normal: "1.5rem",
  spacious: "2rem",
  extra_spacious: "2.5rem",
};

const HEADING_COLOR_MAP: Record<string, string> = {
  inherit: "var(--foreground)",
  primary: "var(--primary)",
  accent: "var(--accent-foreground)",
};

const BOLD_WEIGHT_MAP: Record<string, string> = {
  default: "600",
  heavier: "700",
  "color-accent": "600",
};

const THEME_CACHE_KEY = "carbide_active_theme_cache";

function apply_optional(
  entries: [string, string][],
  key: string,
  value: string | null,
): void {
  if (value) entries.push([key, value]);
}

function build_token_entries(theme: Theme): [string, string][] {
  const entries: [string, string][] = [
    ["--accent-hue", String(theme.accent_hue)],
    ["--accent-chroma", String(theme.accent_chroma)],
    ["--font-family-sans", resolve_font_stack(theme.font_family_sans, "sans")],
    ["--font-family-mono", resolve_font_stack(theme.font_family_mono, "mono")],
    ["--font-sans", resolve_font_stack(theme.font_family_sans, "sans")],
    ["--font-mono", resolve_font_stack(theme.font_family_mono, "mono")],
    ["--editor-font-size", `${String(theme.font_size)}rem`],
    ["--editor-line-height", String(theme.line_height)],
    ["--editor-spacing", SPACING_MAP[theme.spacing] ?? "1.5rem"],
    [
      "--editor-heading-color",
      HEADING_COLOR_MAP[theme.heading_color] ?? "var(--foreground)",
    ],
    ["--editor-heading-weight", String(theme.heading_font_weight)],
    ["--editor-bold-weight", BOLD_WEIGHT_MAP[theme.bold_style] ?? "600"],
  ];

  if (theme.bold_style === "color-accent") {
    entries.push(["--editor-bold-color", "var(--primary)"]);
  } else {
    apply_optional(entries, "--editor-bold-color", theme.bold_color);
  }

  if (theme.blockquote_style === "minimal") {
    entries.push(["--editor-blockquote-bg", "transparent"]);
  } else if (theme.blockquote_style === "accent-bar") {
    entries.push(["--editor-blockquote-border", "var(--primary)"]);
  }

  if (theme.code_block_style === "borderless") {
    entries.push(["--editor-code-border", "transparent"]);
  } else if (theme.code_block_style === "filled") {
    entries.push([
      "--editor-code-bg",
      "color-mix(in oklch, var(--muted) 80%, transparent)",
    ]);
  }

  apply_optional(entries, "--editor-text", theme.editor_text_color);
  apply_optional(entries, "--editor-italic-color", theme.italic_color);
  apply_optional(entries, "--editor-link", theme.link_color);
  apply_optional(
    entries,
    "--editor-blockquote-border",
    theme.blockquote_border_color,
  );
  apply_optional(
    entries,
    "--editor-blockquote-text",
    theme.blockquote_text_color,
  );
  apply_optional(entries, "--editor-code-bg", theme.code_block_bg);
  apply_optional(
    entries,
    "--editor-code-block-text",
    theme.code_block_text_color,
  );
  apply_optional(entries, "--editor-code-inline-bg", theme.inline_code_bg);
  apply_optional(
    entries,
    "--editor-code-inline-text",
    theme.inline_code_text_color,
  );
  apply_optional(entries, "--editor-mark-bg", theme.highlight_bg);
  apply_optional(entries, "--editor-mark-text", theme.highlight_text_color);

  apply_optional(entries, "--graph-node", theme.graph_node_color);
  apply_optional(
    entries,
    "--graph-node-primary",
    theme.graph_node_primary_color,
  );
  apply_optional(entries, "--graph-edge", theme.graph_edge_color);
  apply_optional(
    entries,
    "--graph-edge-semantic",
    theme.graph_edge_semantic_color,
  );
  apply_optional(entries, "--graph-label", theme.graph_label_color);

  const generated = generate_ui_tokens({
    surface_hue: theme.surface_hue,
    surface_chroma: theme.surface_chroma,
    accent_hue: theme.accent_hue,
    accent_chroma: theme.accent_chroma,
    scheme: theme.color_scheme,
    style: theme.surface_style,
  });
  for (const [key, value] of Object.entries(generated)) {
    entries.push([key, value]);
  }

  for (const [key, value] of Object.entries(theme.token_overrides)) {
    entries.push([key.startsWith("--") ? key : `--${key}`, value]);
  }

  return entries;
}

let applied_property_keys: string[] = [];

export function apply_theme(
  theme: Theme,
  options: {
    persist_to_cache?: boolean;
    color_scheme_preference?: ColorSchemePreference;
  } = {},
): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  for (const key of applied_property_keys) {
    root.style.removeProperty(key);
  }

  root.setAttribute("data-color-scheme", theme.color_scheme);
  root.setAttribute("data-layout-variant", theme.layout_variant);
  root.style.setProperty("color-scheme", theme.color_scheme);

  const shiki_theme =
    theme.color_scheme === "dark"
      ? theme.shiki_theme_dark
      : theme.shiki_theme_light;
  root.setAttribute("data-shiki-theme", shiki_theme);

  const resolved = apply_auto_palette(theme);
  const entries = build_token_entries(resolved);
  applied_property_keys = entries.map(([k]) => k);

  for (const [key, value] of entries) {
    root.style.setProperty(key, value);
  }

  if (options.persist_to_cache !== false) {
    cache_theme_for_fouc(theme, entries, options.color_scheme_preference);
  }
}

export function resolve_effective_source_shiki_theme(theme: Theme): string {
  return theme.color_scheme === "dark"
    ? theme.source_shiki_theme_dark || theme.shiki_theme_dark
    : theme.source_shiki_theme_light || theme.shiki_theme_light;
}

function cache_theme_for_fouc(
  theme: Theme,
  entries: [string, string][],
  color_scheme_preference?: ColorSchemePreference,
): void {
  try {
    const cache: Record<string, unknown> = {
      color_scheme: theme.color_scheme,
      tokens: Object.fromEntries(entries),
    };
    if (color_scheme_preference) {
      cache.color_scheme_preference = color_scheme_preference;
    }
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage may be unavailable
  }
}
