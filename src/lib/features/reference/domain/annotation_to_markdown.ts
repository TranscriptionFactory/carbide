import type { PdfAnnotation } from "../types";

const COLOR_LABELS: Record<string, string> = {
  "#ffd400": "Yellow",
  "#ff6666": "Red",
  "#5fb236": "Green",
  "#2ea8e5": "Blue",
  "#a28ae5": "Purple",
  "#e56eee": "Magenta",
  "#f19837": "Orange",
  "#aaaaaa": "Gray",
};

function color_label(color?: string): string {
  if (!color) return "";
  const label = COLOR_LABELS[color.toLowerCase()];
  return label ?? color;
}

function annotation_key(a: PdfAnnotation): string {
  return `${a.page}:${a.text}`;
}

function format_annotation(a: PdfAnnotation): string {
  const parts: string[] = [];
  const type_label = a.type.charAt(0).toUpperCase() + a.type.slice(1);
  const color = color_label(a.color);
  const tag = color ? `${type_label} (${color})` : type_label;

  parts.push(`- **${tag}**, p. ${a.page}`);
  if (a.text) parts.push(`  > ${a.text}`);
  if (a.comment) parts.push(`  ${a.comment}`);
  return parts.join("\n");
}

export function annotations_to_markdown(
  annotations: PdfAnnotation[],
  citekey: string,
): string {
  if (annotations.length === 0) return "";

  const by_page = new Map<number, PdfAnnotation[]>();
  for (const a of annotations) {
    const group = by_page.get(a.page) ?? [];
    group.push(a);
    by_page.set(a.page, group);
  }

  const pages = [...by_page.keys()].sort((a, b) => a - b);

  const sections: string[] = [`# Annotations: ${citekey}`, ""];
  for (const page of pages) {
    sections.push(`## Page ${page}`, "");
    const items = by_page.get(page)!;
    for (const item of items) {
      sections.push(format_annotation(item), "");
    }
  }

  return sections.join("\n").trimEnd() + "\n";
}

export function merge_annotations(
  existing: PdfAnnotation[],
  incoming: PdfAnnotation[],
): PdfAnnotation[] {
  const seen = new Set(existing.map(annotation_key));
  const merged = [...existing];
  for (const a of incoming) {
    const key = annotation_key(a);
    if (!seen.has(key)) {
      merged.push(a);
      seen.add(key);
    }
  }
  return merged;
}
