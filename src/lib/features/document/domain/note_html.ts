import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";
import katex from "katex";
import { parse_frontmatter } from "$lib/shared/domain/frontmatter_parser";
import {
  init_highlighter,
  get_highlighter_sync,
  resolve_language,
  DEFAULT_LIGHT_THEME,
} from "$lib/features/editor";
import { get_inlined_katex_css } from "$lib/features/document/domain/katex_inline_css";

type RenderEnv = { mermaid_svgs?: Map<string, string> };

export function create_md(): MarkdownIt {
  return new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
  }).enable(["table", "strikethrough"]);
}

function render_math(source: string, display: boolean): string {
  const trimmed = source.trim();
  try {
    return katex.renderToString(trimmed, {
      displayMode: display,
      throwOnError: false,
    });
  } catch {
    const escaped = MarkdownIt().utils.escapeHtml(trimmed);
    return display ? `<pre class="math-error">${escaped}</pre>` : escaped;
  }
}

function delimiter_state(
  state: StateInline,
  pos: number,
): { can_open: boolean; can_close: boolean } {
  const prev = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
  const next = pos + 1 <= state.posMax ? state.src.charCodeAt(pos + 1) : -1;
  const next_is_digit = next >= 0x30 && next <= 0x39;
  return {
    can_open: next !== 0x20 && next !== 0x09,
    can_close: prev !== 0x20 && prev !== 0x09 && !next_is_digit,
  };
}

function math_inline_rule(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "$") return false;

  const open = delimiter_state(state, state.pos);
  if (!open.can_open) {
    if (!silent) state.pending += "$";
    state.pos += 1;
    return true;
  }

  const start = state.pos + 1;
  let match = start;
  for (;;) {
    match = state.src.indexOf("$", match);
    if (match === -1) break;
    let back = match - 1;
    while (state.src[back] === "\\") back -= 1;
    if ((match - back) % 2 === 1) break;
    match += 1;
  }

  if (match === -1) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }
  if (match - start === 0) {
    if (!silent) state.pending += "$$";
    state.pos = start + 1;
    return true;
  }
  if (!delimiter_state(state, match).can_close) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return true;
  }

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.markup = "$";
    token.content = state.src.slice(start, match);
  }
  state.pos = match + 1;
  return true;
}

function math_block_rule(
  state: StateBlock,
  start_line: number,
  end_line: number,
  silent: boolean,
): boolean {
  let pos = (state.bMarks[start_line] ?? 0) + (state.tShift[start_line] ?? 0);
  let max = state.eMarks[start_line] ?? 0;
  if (pos + 2 > max || state.src.slice(pos, pos + 2) !== "$$") return false;

  pos += 2;
  let first_line = state.src.slice(pos, max);
  if (silent) return true;

  let found = false;
  let last_line = "";
  if (first_line.trim().endsWith("$$")) {
    first_line = first_line.trim().slice(0, -2);
    found = true;
  }

  let next = start_line;
  while (!found) {
    next += 1;
    if (next >= end_line) break;
    pos = (state.bMarks[next] ?? 0) + (state.tShift[next] ?? 0);
    max = state.eMarks[next] ?? 0;
    if (pos < max && (state.tShift[next] ?? 0) < state.blkIndent) break;
    const line = state.src.slice(pos, max).trim();
    if (line.endsWith("$$")) {
      const last_pos = state.src.slice(0, max).lastIndexOf("$$");
      last_line = state.src.slice(pos, last_pos);
      found = true;
    }
  }

  state.line = next + 1;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content =
    (first_line.trim() ? `${first_line}\n` : "") +
    state.getLines(start_line + 1, next, state.tShift[start_line] ?? 0, true) +
    (last_line.trim() ? last_line : "");
  token.markup = "$$";
  token.map = [start_line, state.line];
  return true;
}

function register_math(md: MarkdownIt): void {
  md.inline.ruler.after("escape", "math_inline", math_inline_rule);
  md.block.ruler.after("blockquote", "math_block", math_block_rule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.renderer.rules.math_inline = (tokens, idx) =>
    render_math(tokens[idx]?.content ?? "", false);
  md.renderer.rules.math_block = (tokens, idx) =>
    `${render_math(tokens[idx]?.content ?? "", true)}\n`;
}

function render_fence(
  tokens: Token[],
  idx: number,
  _options: unknown,
  env: RenderEnv,
  _self: Renderer,
): string {
  const token = tokens[idx];
  if (!token) return "";
  const info = token.info.trim();
  const code = token.content;

  if (info === "mermaid") {
    const svg = env.mermaid_svgs?.get(code.trim());
    if (svg) return `<figure class="mermaid-figure">${svg}</figure>\n`;
  }

  if (info === "math") {
    return `${render_math(code, true)}\n`;
  }

  const lang = resolve_language(info);
  const highlighter = get_highlighter_sync();
  if (lang && highlighter) {
    try {
      return `${highlighter.codeToHtml(code, {
        lang,
        theme: DEFAULT_LIGHT_THEME,
      })}\n`;
    } catch {
      // fall through to plain code block
    }
  }

  const escaped = MarkdownIt().utils.escapeHtml(code);
  return `<pre class="code-block"><code>${escaped}</code></pre>\n`;
}

function collect_mermaid_codes(tokens: Token[]): string[] {
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.type === "fence" && token.info.trim() === "mermaid") {
      const code = token.content.trim();
      if (code) seen.add(code);
    }
  }
  return [...seen];
}

async function prerender_mermaid(
  tokens: Token[],
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const codes = collect_mermaid_codes(tokens);
  if (codes.length === 0) return cache;

  try {
    const mermaid = await import("mermaid");
    mermaid.default.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "strict",
    });
    for (const code of codes) {
      try {
        await mermaid.default.parse(code);
        const id = `pdf-mermaid-${String(cache.size)}`;
        const { svg } = await mermaid.default.render(id, code);
        cache.set(code, svg);
      } catch {
        // invalid diagram — falls back to a code block
      }
    }
  } catch {
    // mermaid unavailable — all diagrams fall back to code blocks
  }

  return cache;
}

function document_styles(katex_css: string): string {
  return `${katex_css}
@page { size: A4; margin: 20mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  color: #24292f;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.6;
  word-wrap: break-word;
}
.note-document { max-width: 100%; }
.doc-title {
  margin: 0 0 0.4em;
  padding-bottom: 0.3em;
  font-size: 24pt;
  font-weight: 700;
  border-bottom: 1px solid #d0d7de;
}
h1, h2, h3, h4, h5, h6 {
  margin: 1.2em 0 0.6em;
  font-weight: 700;
  line-height: 1.25;
  page-break-after: avoid;
}
h1 { font-size: 20pt; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
h2 { font-size: 16pt; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
h3 { font-size: 13pt; }
h4 { font-size: 11pt; }
p { margin: 0 0 0.8em; }
a { color: #0969da; text-decoration: none; }
ul, ol { margin: 0 0 0.8em; padding-left: 2em; }
li { margin: 0.15em 0; }
blockquote {
  margin: 0 0 0.8em;
  padding: 0 1em;
  color: #57606a;
  border-left: 0.25em solid #d0d7de;
}
hr {
  height: 1px;
  margin: 1.5em 0;
  border: 0;
  background: #d0d7de;
}
code {
  padding: 0.2em 0.4em;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 85%;
  background: #f6f8fa;
  border-radius: 6px;
}
pre {
  margin: 0 0 0.8em;
  padding: 12px 16px;
  overflow: auto;
  font-size: 9.5pt;
  line-height: 1.45;
  background: #f6f8fa;
  border-radius: 6px;
  page-break-inside: avoid;
}
pre code { padding: 0; font-size: inherit; background: none; }
table {
  margin: 0 0 0.8em;
  border-collapse: collapse;
  page-break-inside: avoid;
}
th, td { padding: 6px 13px; border: 1px solid #d0d7de; }
th { background: #f6f8fa; font-weight: 600; }
img { max-width: 100%; }
.image-missing {
  display: inline-block;
  padding: 0.4em 0.8em;
  color: #57606a;
  font-size: 90%;
  font-style: italic;
  background: #f6f8fa;
  border: 1px dashed #d0d7de;
  border-radius: 4px;
}
figure { margin: 1em 0; text-align: center; page-break-inside: avoid; }
.mermaid-figure svg { max-width: 100%; height: auto; }
.katex-display { page-break-inside: avoid; overflow-x: auto; overflow-y: hidden; }
.math-error { color: #cf222e; }`;
}

export type ImageSourceKind = "canonical" | "wiki";
export type ImageResolver = (
  src: string,
  kind: ImageSourceKind,
) => Promise<string | null>;

export type RenderNoteOptions = {
  image_resolver?: ImageResolver;
};

const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i;
const WIKI_EMBED_REGEX = /!\[\[([^\]\n]+?)(?:#[^\]]*)?\]\]/g;
const WIKI_IMAGE_SRC_PREFIX = "carbide-wiki:";

function rewrite_wiki_image_embeds(body: string): string {
  return body.replace(WIKI_EMBED_REGEX, (match, target: string) => {
    if (!IMAGE_EXT_REGEX.test(target)) return match;
    const alt =
      target
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "") ?? "";
    const escaped_alt = alt.replace(/[\\\[\]]/g, "\\$&");
    return `![${escaped_alt}](${WIKI_IMAGE_SRC_PREFIX}${target})`;
  });
}

function collect_image_sources(tokens: Token[]): Set<string> {
  const out = new Set<string>();
  const walk = (list: Token[]) => {
    for (const tok of list) {
      if (tok.type === "image") {
        const src = tok.attrGet("src");
        if (src) out.add(src);
      }
      if (tok.children) walk(tok.children);
    }
  };
  walk(tokens);
  return out;
}

function escape_attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function resolve_image_sources(
  sources: Set<string>,
  resolver: ImageResolver | undefined,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  if (!resolver || sources.size === 0) return resolved;
  await Promise.all(
    [...sources].map(async (src) => {
      const is_wiki = src.startsWith(WIKI_IMAGE_SRC_PREFIX);
      const raw = is_wiki ? src.slice(WIKI_IMAGE_SRC_PREFIX.length) : src;
      try {
        const data_uri = await resolver(raw, is_wiki ? "wiki" : "canonical");
        if (data_uri) resolved.set(src, data_uri);
      } catch {
        // leave unresolved — placeholder will render
      }
    }),
  );
  return resolved;
}

function install_image_renderer(
  md: MarkdownIt,
  resolved: Map<string, string>,
): void {
  md.renderer.rules.image = (tokens, idx) => {
    const tok = tokens[idx];
    if (!tok) return "";
    const src = tok.attrGet("src") ?? "";
    const alt = tok.content || "";
    const title = tok.attrGet("title");
    const data_uri = resolved.get(src);
    if (data_uri) {
      const title_attr = title ? ` title="${escape_attr(title)}"` : "";
      return `<img src="${escape_attr(data_uri)}" alt="${escape_attr(alt)}"${title_attr} />`;
    }
    const label = alt || src.replace(WIKI_IMAGE_SRC_PREFIX, "");
    return `<span class="image-missing" title="Failed to load image: ${escape_attr(src.replace(WIKI_IMAGE_SRC_PREFIX, ""))}">${escape_attr(label)}</span>`;
  };
}

export async function render_note_to_html(
  title: string,
  markdown: string,
  options?: RenderNoteOptions,
): Promise<string> {
  init_highlighter();

  const body = rewrite_wiki_image_embeds(parse_frontmatter(markdown).body);
  const md = create_md();
  register_math(md);
  md.renderer.rules.fence = render_fence;

  const tokens = md.parse(body, {});
  const image_sources = collect_image_sources(tokens);
  const resolved_images = await resolve_image_sources(
    image_sources,
    options?.image_resolver,
  );
  install_image_renderer(md, resolved_images);

  const mermaid_svgs = await prerender_mermaid(tokens);
  const env: RenderEnv = { mermaid_svgs };
  const body_html = md.renderer.render(tokens, md.options, env);

  const katex_css = await get_inlined_katex_css();
  const safe_title = md.utils.escapeHtml(title);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safe_title}</title>
<style>
${document_styles(katex_css)}
</style>
</head>
<body>
<main class="note-document">
<h1 class="doc-title">${safe_title}</h1>
${body_html}
</main>
</body>
</html>`;
}
