import type {
  ThemeStyleDescriptor,
  ThemeStyleCategory,
} from "./theme_style_descriptors";
import { STYLE_CATEGORY_ORDER } from "./theme_style_descriptors";

export function filter_descriptors(
  descriptors: ThemeStyleDescriptor[],
  query: string,
): ThemeStyleDescriptor[] {
  const q = query.toLowerCase().trim();
  if (!q) return descriptors;

  const tokens = q.split(/\s+/);
  return descriptors.filter((desc) => {
    const haystack = build_haystack(desc);
    return tokens.every((token) => haystack.includes(token));
  });
}

function build_haystack(desc: ThemeStyleDescriptor): string {
  return [desc.label, desc.description, desc.category, ...desc.tags]
    .join(" ")
    .toLowerCase();
}

export function group_filtered(
  descriptors: ThemeStyleDescriptor[],
): Map<ThemeStyleCategory, ThemeStyleDescriptor[]> {
  const grouped = new Map<ThemeStyleCategory, ThemeStyleDescriptor[]>();
  for (const desc of descriptors) {
    const list = grouped.get(desc.category) ?? [];
    list.push(desc);
    grouped.set(desc.category, list);
  }
  return grouped;
}

export function ordered_categories(
  grouped: Map<ThemeStyleCategory, ThemeStyleDescriptor[]>,
): ThemeStyleCategory[] {
  return STYLE_CATEGORY_ORDER.filter((cat) => grouped.has(cat));
}
