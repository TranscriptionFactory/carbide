import type { ArtifactProvenance } from "$lib/features/document";
import { slugify_for_filename } from "$lib/features/document";

export type ClipFormats = {
  markdown: boolean;
  html: boolean;
  epub: boolean;
};

export function is_valid_clip_url(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function build_clip_frontmatter(
  title: string,
  source_url: string,
  clipped_at: Date,
): string {
  const safe_title = title.replace(/"/g, '\\"');
  const date = clipped_at.toISOString().slice(0, 10);
  return `---\ntitle: "${safe_title}"\ndate_created: ${date}\nsource: ${source_url}\nclipped_at: ${clipped_at.toISOString()}\n---\n\n`;
}

export function build_clip_provenance(
  url: string,
  now: Date,
): ArtifactProvenance {
  return {
    source: url,
    pasted_at: now.toISOString(),
    clipped_at: now.toISOString(),
  };
}

export function clip_stem(title: string | null, final_url: string): string {
  const slug = title ? slugify_for_filename(title) : "";
  if (slug) return slug;
  try {
    const host = new URL(final_url).hostname;
    return slugify_for_filename(host) || "clipped-page";
  } catch {
    return "clipped-page";
  }
}
