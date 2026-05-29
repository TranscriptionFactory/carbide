import { prerender_mermaid_codes } from "$lib/features/document/domain/mermaid_prerender";

const PRE_BLOCK_RE = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi;
const CLASS_ATTR_RE = /class\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

function attrs_have_class(attrs: string, name: string): boolean {
  const m = CLASS_ATTR_RE.exec(attrs);
  if (!m) return false;
  return (m[1] ?? m[2] ?? "").split(/\s+/).includes(name);
}

function decode_entities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function extract_mermaid_sources(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(PRE_BLOCK_RE)) {
    if (!attrs_have_class(m[1] ?? "", "mermaid")) continue;
    const source = decode_entities((m[2] ?? "").trim());
    if (source) out.push(source);
  }
  return out;
}

export function inject_mermaid_svgs(
  html: string,
  svgs: Map<string, string>,
): string {
  if (svgs.size === 0) return html;
  return html.replace(PRE_BLOCK_RE, (raw, attrs: string, body: string) => {
    if (!attrs_have_class(attrs ?? "", "mermaid")) return raw;
    const source = decode_entities((body ?? "").trim());
    const svg = svgs.get(source);
    return svg ? `<figure class="mermaid-figure">${svg}</figure>` : raw;
  });
}

export async function prerender_html_mermaid(html: string): Promise<string> {
  const sources = extract_mermaid_sources(html);
  if (sources.length === 0) return html;
  const svgs = await prerender_mermaid_codes(sources, {
    id_prefix: "live-mermaid",
  });
  return inject_mermaid_svgs(html, svgs);
}
