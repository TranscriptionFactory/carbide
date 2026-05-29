import { sanitize_html } from "$lib/shared/html";

const SAFE_EMBED_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data: blob: carbide-asset:",
  "font-src data: carbide-asset:",
  "media-src data: blob: carbide-asset:",
  "connect-src 'none'",
].join("; ");

const SAFE_EMBED_STYLES = `
body { margin: 0; padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.55; color: var(--carbide-fg, #18181b); background: var(--carbide-bg, transparent); word-wrap: break-word; }
img, video, audio, canvas, svg { max-width: 100%; height: auto; }
a { color: var(--carbide-link, #2563eb); }
pre { background: var(--carbide-code-bg, #f4f4f5); color: var(--carbide-code-fg, inherit); padding: 8px 12px; border-radius: 4px; overflow-x: auto; }
code { background: var(--carbide-code-bg, #f4f4f5); padding: 1px 4px; border-radius: 2px; font-size: 0.92em; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; }
th, td { border: 1px solid var(--carbide-border, #e4e4e7); padding: 4px 8px; }
`;

const ABSOLUTE_URL_RE =
  /^(?:[a-z][a-z0-9+\-.]*:|\/\/|#|mailto:|tel:|data:|blob:)/i;
const ATTR_REWRITE_RE = /\b(src|href|poster)\s*=\s*("([^"]*)"|'([^']*)')/gi;

function get_base_dir(file_path: string): string {
  const idx = file_path.lastIndexOf("/");
  return idx >= 0 ? file_path.slice(0, idx + 1) : "";
}

function normalize_relative(base_dir: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const combined = base_dir + target;
  const parts = combined.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

export type EmbedAssetResolver = (
  vault_path: string,
) => string | Promise<string>;

export async function rewrite_embed_assets(
  html: string,
  host_file_path: string,
  resolve_asset_url: EmbedAssetResolver | undefined,
): Promise<string> {
  if (!resolve_asset_url) return html;
  const base_dir = get_base_dir(host_file_path);
  const matches: Array<{
    start: number;
    end: number;
    attr: string;
    quote: string;
    raw: string;
  }> = [];

  ATTR_REWRITE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_REWRITE_RE.exec(html)) !== null) {
    const raw = (match[3] ?? match[4] ?? "").trim();
    if (!raw || ABSOLUTE_URL_RE.test(raw)) continue;
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      attr: match[1]!.toLowerCase(),
      quote: match[2]!.startsWith('"') ? '"' : "'",
      raw,
    });
  }

  if (matches.length === 0) return html;

  const unique_paths = new Set(
    matches.map((m) => normalize_relative(base_dir, m.raw)),
  );
  const resolved = new Map<string, string>();
  await Promise.all(
    [...unique_paths].map(async (path) => {
      try {
        const url = await resolve_asset_url(path);
        if (typeof url === "string" && url) resolved.set(path, url);
      } catch {
        // leave unresolved — original href stays in the document
      }
    }),
  );

  let cursor = 0;
  const out: string[] = [];
  for (const m of matches) {
    const path = normalize_relative(base_dir, m.raw);
    const url = resolved.get(path);
    if (!url) continue;
    out.push(html.slice(cursor, m.start));
    out.push(`${m.attr}=${m.quote}${url}${m.quote}`);
    cursor = m.end;
  }
  out.push(html.slice(cursor));
  return out.join("");
}

export type SafeEmbedOptions = {
  content: string;
  host_file_path: string;
  resolve_asset_url?: EmbedAssetResolver | undefined;
};

export async function build_safe_embed_srcdoc(
  options: SafeEmbedOptions,
): Promise<string> {
  const rewritten = await rewrite_embed_assets(
    options.content,
    options.host_file_path,
    options.resolve_asset_url,
  );
  const sanitized = sanitize_html(rewritten);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SAFE_EMBED_CSP}"><style>${SAFE_EMBED_STYLES}</style></head><body>${sanitized}</body></html>`;
}

export const SAFE_EMBED_SANDBOX = "allow-same-origin";
