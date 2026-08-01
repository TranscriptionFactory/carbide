const COMBINING_MARK_RE = /\p{M}+/gu;
const NON_LETTER_OR_NUMBER_RE = /[^\p{L}\p{N}]+/gu;
const EDGE_HYPHENS_RE = /^-+|-+$/g;

export function to_wiki_link_slug(text: string): string {
  return text
    .trim()
    .normalize("NFKD")
    .replace(COMBINING_MARK_RE, "")
    .toLowerCase()
    .replace(NON_LETTER_OR_NUMBER_RE, "-")
    .replace(EDGE_HYPHENS_RE, "");
}

export function disambiguate_slug(
  base_slug: string,
  slug_counts: Map<string, number>,
): string {
  const count = slug_counts.get(base_slug) ?? 0;
  slug_counts.set(base_slug, count + 1);
  return count === 0 ? base_slug : `${base_slug}-${count}`;
}

export function get_heading_slug(
  text: string,
  slug_counts: Map<string, number>,
): string {
  const base_slug = to_wiki_link_slug(text);
  return base_slug ? disambiguate_slug(base_slug, slug_counts) : "";
}
