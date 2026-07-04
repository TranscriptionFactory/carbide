import { sanitize_note_color } from "$lib/features/folder";

export const TAG_COLORS_SETTING_KEY = "tag_colors";

const TAG_NAME_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_/-]*$/u;

export function normalize_tag_name(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

export function is_valid_tag_name(tag: string): boolean {
  return TAG_NAME_RE.test(tag);
}

export function sanitize_tag_colors(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [raw_tag, raw_color] of Object.entries(value)) {
    if (typeof raw_color !== "string") continue;
    const tag = normalize_tag_name(raw_tag);
    if (!is_valid_tag_name(tag)) continue;
    const color = sanitize_note_color(raw_color);
    if (!color) continue;
    result[tag] = color;
  }
  return result;
}

export function with_tag_color(
  colors: Record<string, string>,
  tag: string,
  color: string,
): Record<string, string> | null {
  const normalized = normalize_tag_name(tag);
  if (!is_valid_tag_name(normalized)) return null;
  const sanitized = sanitize_note_color(color);
  if (!sanitized) return null;
  if (colors[normalized] === sanitized) return colors;
  return { ...colors, [normalized]: sanitized };
}

export function without_tag_color(
  colors: Record<string, string>,
  tag: string,
): Record<string, string> {
  const normalized = normalize_tag_name(tag);
  if (!(normalized in colors)) return colors;
  const next = { ...colors };
  delete next[normalized];
  return next;
}

export function tag_color_for(
  colors: Record<string, string>,
  tag: string,
): string | null {
  return colors[normalize_tag_name(tag)] ?? null;
}
