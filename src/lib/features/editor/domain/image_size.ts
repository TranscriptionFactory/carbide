const IMAGE_ALT_WIDTH_RE = /^(.*)\|([1-9]\d*)$/s;

export function split_image_alt_width(raw_alt: string): {
  alt: string;
  width: string;
} {
  const match = IMAGE_ALT_WIDTH_RE.exec(raw_alt);
  if (!match) return { alt: raw_alt, width: "" };
  return { alt: match[1] ?? "", width: `${match[2] ?? ""}px` };
}

const PIXEL_WIDTH_RE = /^([1-9]\d*)(?:px)?$/;

// Obsidian image width: `![alt|300](src)`. Percent widths have no markdown form.
export function join_image_alt_width(alt: string, width: unknown): string {
  const match = typeof width === "string" ? PIXEL_WIDTH_RE.exec(width) : null;
  return match ? `${alt}|${match[1] ?? ""}` : alt;
}
