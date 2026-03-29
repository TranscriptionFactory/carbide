import type { HighlighterCore } from "shiki/core";
import { get_highlighter_sync, load_shiki_theme } from "./shiki_highlighter";

type TokenColor = {
  scope?: string | string[];
  settings: { foreground?: string; fontStyle?: string };
};

type ThemeData = {
  tokenColors?: TokenColor[];
  colors?: Record<string, string>;
  fg?: string;
};

const SCOPE_TO_VAR: [string, string[]][] = [
  ["--source-keyword", ["keyword", "storage", "storage.type"]],
  ["--source-string", ["string", "punctuation.definition.string"]],
  ["--source-comment", ["comment", "punctuation.definition.comment"]],
  [
    "--source-heading",
    ["markup.heading", "markup.heading entity.name", "entity.name.section"],
  ],
  ["--source-meta", ["meta.property-name", "entity.name"]],
  ["--source-link", ["markup.underline.link"]],
  ["--source-emphasis", ["markup.italic"]],
  ["--source-strong", ["markup.bold"]],
  [
    "--source-url",
    [
      "constant.other.reference.link",
      "string.other.link",
      "markup.underline.link",
    ],
  ],
  ["--source-tag", ["entity.name.tag"]],
  [
    "--source-bracket",
    [
      "punctuation",
      "brackethighlighter.tag",
      "brackethighlighter.round",
      "brackethighlighter.square",
    ],
  ],
  [
    "--source-atom",
    [
      "constant",
      "constant.language",
      "entity.name.constant",
      "variable.language",
    ],
  ],
  ["--source-number", ["constant.numeric", "constant"]],
  [
    "--source-property",
    [
      "variable.other.property",
      "support.function",
      "entity.name.function",
      "entity.name",
    ],
  ],
  ["--source-operator", ["keyword.operator", "keyword"]],
];

function find_color(
  token_colors: TokenColor[],
  target_scopes: string[],
): string | null {
  for (const target of target_scopes) {
    for (const tc of token_colors) {
      const scopes = Array.isArray(tc.scope)
        ? tc.scope
        : tc.scope
          ? [tc.scope]
          : [];
      if (scopes.some((s) => s === target || target.startsWith(s + "."))) {
        if (tc.settings.foreground) return tc.settings.foreground;
      }
    }
  }
  return null;
}

function extract_source_vars_from_theme_data(
  data: ThemeData,
): Record<string, string> {
  const token_colors = data.tokenColors ?? [];
  const vars: Record<string, string> = {};
  for (const [css_var, scopes] of SCOPE_TO_VAR) {
    const color = find_color(token_colors, scopes);
    if (color) vars[css_var] = color;
  }
  return vars;
}

export async function resolve_source_shiki_vars(
  theme_name: string,
): Promise<Record<string, string>> {
  await load_shiki_theme(theme_name);
  const highlighter: HighlighterCore | null = get_highlighter_sync();
  if (!highlighter) return {};

  const loaded = highlighter.getLoadedThemes();
  if (!loaded.includes(theme_name)) return {};

  const theme_data = highlighter.getTheme(theme_name) as unknown as ThemeData;
  if (!theme_data) return {};

  return extract_source_vars_from_theme_data(theme_data);
}
