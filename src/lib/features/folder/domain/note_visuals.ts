const HEX_COLOR =
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const NAMED_COLOR_OPTIONS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "gray",
  "black",
  "white",
];

const NAMED_COLORS = new Set([...NAMED_COLOR_OPTIONS, "grey"]);

export function sanitize_note_color(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (HEX_COLOR.test(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (NAMED_COLORS.has(lower)) return lower;
  return null;
}

const MAX_ICON_LENGTH = 8;

export function sanitize_note_icon(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const collapsed = trimmed.replace(/\s+/g, "");
  if (!collapsed) return null;
  return [...collapsed].slice(0, MAX_ICON_LENGTH).join("");
}
