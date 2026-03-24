import type { CslItem, CslName } from "../types";

export function format_authors(authors: CslName[] | undefined): string {
  if (!authors || authors.length === 0) return "";
  return authors
    .map((a) => {
      if (a.literal) return a.literal;
      const parts = [a.family, a.given].filter(Boolean);
      return parts.join(", ");
    })
    .join("; ");
}

export function extract_year(item: CslItem): number | null {
  const parts = item.issued?.["date-parts"];
  if (parts && parts.length > 0 && parts[0] && parts[0].length > 0) {
    return parts[0][0] ?? null;
  }
  if (item.issued?.literal) {
    const match = item.issued.literal.match(/\d{4}/);
    if (match) return parseInt(match[0], 10);
  }
  return null;
}

export function generate_citekey(item: CslItem): string {
  const first_author = item.author?.[0];
  const family = first_author?.family ?? first_author?.literal ?? "unknown";
  const year = extract_year(item) ?? "nd";
  const slug = family
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  return `${slug}${year}`;
}

export function match_query(item: CslItem, query: string): boolean {
  const q = query.toLowerCase();
  if (item.id.toLowerCase().includes(q)) return true;
  if (item.title?.toLowerCase().includes(q)) return true;
  if (item.author?.some((a) => format_authors([a]).toLowerCase().includes(q)))
    return true;
  const year = extract_year(item);
  if (year && String(year).includes(q)) return true;
  return false;
}
