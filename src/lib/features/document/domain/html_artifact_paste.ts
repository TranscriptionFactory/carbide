import type { ArtifactProvenance } from "$lib/features/document/types/document";

export const PROVENANCE_SIDECAR_SUFFIX = ".meta.json";

const COMBINING_MARKS_RE = /[̀-ͯ]/g;

export type { ArtifactProvenance };

export function extract_html_title(html: string): string | null {
  const title_match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title_match && title_match[1] !== undefined) {
    const text = decode_html_entities(strip_inner_tags(title_match[1])).trim();
    if (text) return text;
  }
  const h1_match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1_match && h1_match[1] !== undefined) {
    const text = decode_html_entities(strip_inner_tags(h1_match[1])).trim();
    if (text) return text;
  }
  return null;
}

function strip_inner_tags(text: string): string {
  return text.replace(/<[^>]+>/g, " ");
}

function decode_html_entities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function slugify_for_filename(text: string): string {
  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function format_timestamp_for_filename(now: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${now.getFullYear()}` +
    `${pad(now.getMonth() + 1)}` +
    `${pad(now.getDate())}` +
    `-` +
    `${pad(now.getHours())}` +
    `${pad(now.getMinutes())}` +
    `${pad(now.getSeconds())}`
  );
}

export function derive_artifact_filename(
  html: string,
  now: Date,
  fallback_stem = "pasted-html",
): { stem: string; html_filename: string; meta_filename: string } {
  const title = extract_html_title(html);
  const slug = title ? slugify_for_filename(title) : "";
  const base_stem = slug || fallback_stem;
  const stem = `${base_stem}-${format_timestamp_for_filename(now)}`;
  return {
    stem,
    html_filename: `${stem}.html`,
    meta_filename: `${stem}.html${PROVENANCE_SIDECAR_SUFFIX}`,
  };
}

export function join_vault_path(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

export function provenance_sidecar_path(html_path: string): string {
  return `${html_path}${PROVENANCE_SIDECAR_SUFFIX}`;
}

export function build_clipboard_provenance(now: Date): ArtifactProvenance {
  return {
    source: "clipboard",
    pasted_at: now.toISOString(),
  };
}

export function serialize_provenance(meta: ArtifactProvenance): string {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

export function parse_provenance(json: string): ArtifactProvenance | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.source !== "string") return null;
    const pasted_at =
      typeof record.pasted_at === "string" ? record.pasted_at : "";
    return {
      ...record,
      source: record.source,
      pasted_at,
    } as ArtifactProvenance;
  } catch {
    return null;
  }
}

export function format_provenance_banner(meta: ArtifactProvenance): string {
  const when = format_pasted_at(meta.pasted_at);
  if (meta.source === "clipboard") {
    return when ? `Pasted from clipboard on ${when}` : "Pasted from clipboard";
  }
  return when ? `Source: ${meta.source} · ${when}` : `Source: ${meta.source}`;
}

function format_pasted_at(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
