import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { HighlighterCore } from "shiki/core";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("shiki_highlighter");

import langBash from "shiki/dist/langs/bash.mjs";
import langC from "shiki/dist/langs/c.mjs";
import langCpp from "shiki/dist/langs/cpp.mjs";
import langCsharp from "shiki/dist/langs/csharp.mjs";
import langCss from "shiki/dist/langs/css.mjs";
import langDiff from "shiki/dist/langs/diff.mjs";
import langDocker from "shiki/dist/langs/docker.mjs";
import langGo from "shiki/dist/langs/go.mjs";
import langGraphql from "shiki/dist/langs/graphql.mjs";
import langHtml from "shiki/dist/langs/html.mjs";
import langJava from "shiki/dist/langs/java.mjs";
import langJavascript from "shiki/dist/langs/javascript.mjs";
import langJson from "shiki/dist/langs/json.mjs";
import langJsx from "shiki/dist/langs/jsx.mjs";
import langKotlin from "shiki/dist/langs/kotlin.mjs";
import langLua from "shiki/dist/langs/lua.mjs";
import langMarkdown from "shiki/dist/langs/markdown.mjs";
import langPhp from "shiki/dist/langs/php.mjs";
import langPython from "shiki/dist/langs/python.mjs";
import langRuby from "shiki/dist/langs/ruby.mjs";
import langRust from "shiki/dist/langs/rust.mjs";
import langScss from "shiki/dist/langs/scss.mjs";
import langSql from "shiki/dist/langs/sql.mjs";
import langSvelte from "shiki/dist/langs/svelte.mjs";
import langSwift from "shiki/dist/langs/swift.mjs";
import langToml from "shiki/dist/langs/toml.mjs";
import langTsx from "shiki/dist/langs/tsx.mjs";
import langTypescript from "shiki/dist/langs/typescript.mjs";
import langMermaid from "shiki/dist/langs/mermaid.mjs";
import langXml from "shiki/dist/langs/xml.mjs";
import langYaml from "shiki/dist/langs/yaml.mjs";

import themeGithubLight from "shiki/dist/themes/github-light.mjs";
import themeGithubDark from "shiki/dist/themes/github-dark.mjs";

const BUNDLED_LANGS = [
  langBash,
  langC,
  langCpp,
  langCsharp,
  langCss,
  langDiff,
  langDocker,
  langGo,
  langGraphql,
  langHtml,
  langJava,
  langJavascript,
  langJson,
  langJsx,
  langKotlin,
  langLua,
  langMarkdown,
  langMermaid,
  langPhp,
  langPython,
  langRuby,
  langRust,
  langScss,
  langSql,
  langSvelte,
  langSwift,
  langToml,
  langTsx,
  langTypescript,
  langXml,
  langYaml,
];

export const DEFAULT_LIGHT_THEME = "github-light";
export const DEFAULT_DARK_THEME = "github-dark";

const THEME_IMPORTS: Record<string, () => Promise<{ default: unknown }>> = {
  "one-light": () => import("shiki/dist/themes/one-light.mjs"),
  "catppuccin-latte": () => import("shiki/dist/themes/catppuccin-latte.mjs"),
  "rose-pine-dawn": () => import("shiki/dist/themes/rose-pine-dawn.mjs"),
  "min-light": () => import("shiki/dist/themes/min-light.mjs"),
  "slack-ochin": () => import("shiki/dist/themes/slack-ochin.mjs"),
  "one-dark-pro": () => import("shiki/dist/themes/one-dark-pro.mjs"),
  "catppuccin-mocha": () => import("shiki/dist/themes/catppuccin-mocha.mjs"),
  dracula: () => import("shiki/dist/themes/dracula.mjs"),
  nord: () => import("shiki/dist/themes/nord.mjs"),
  "rose-pine": () => import("shiki/dist/themes/rose-pine.mjs"),
  "tokyo-night": () => import("shiki/dist/themes/tokyo-night.mjs"),
  "slack-dark": () => import("shiki/dist/themes/slack-dark.mjs"),
};

const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
  md: "markdown",
  htm: "html",
  "c++": "cpp",
  "c#": "csharp",
  yml: "yaml",
  "objective-c": "objectivec",
};

let _highlighter: HighlighterCore | null = null;
let _supported_langs: Set<string> | null = null;

function get_highlighter(): HighlighterCore {
  if (!_highlighter) {
    _highlighter = createHighlighterCoreSync({
      engine: createJavaScriptRegexEngine(),
      themes: [themeGithubLight, themeGithubDark],
      langs: BUNDLED_LANGS,
    });
    _supported_langs = new Set(_highlighter.getLoadedLanguages());
  }
  return _highlighter;
}

export function init_highlighter(): void {
  try {
    get_highlighter();
  } catch (error) {
    log.from_error("Failed to initialize Shiki highlighter:", error);
  }
}

export function get_highlighter_sync(): HighlighterCore | null {
  return _highlighter;
}

export function resolve_language(
  lang: string | null | undefined,
): string | null {
  if (!lang) return null;
  const lower = lang.toLowerCase().trim();
  const resolved = LANG_ALIASES[lower] ?? lower;
  if (!_supported_langs) return null;
  return _supported_langs.has(resolved) ? resolved : null;
}

export function resolve_theme(): string {
  const root = document.documentElement;
  const explicit = root.getAttribute("data-shiki-theme");
  if (explicit) return explicit;
  const scheme = root.getAttribute("data-color-scheme");
  return scheme === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
}

const _loaded_themes = new Set<string>(["github-light", "github-dark"]);

export async function load_shiki_theme(name: string): Promise<boolean> {
  if (_loaded_themes.has(name)) return true;
  const loader = THEME_IMPORTS[name];
  if (!loader) return false;
  const highlighter = get_highlighter();
  if (!highlighter) return false;
  try {
    const mod = await loader();
    await highlighter.loadTheme(
      mod.default as Parameters<typeof highlighter.loadTheme>[0],
    );
    _loaded_themes.add(name);
    return true;
  } catch {
    return false;
  }
}
