import type { OutlineHeading } from "$lib/features/outline";

type HeadingEntry = Omit<OutlineHeading, "id">;

function heading_slug(level: number, text: string): string {
  return `h-${String(level)}-${text
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

/** Ids shared by the rich and source outlines, numbered in document order. */
export function assign_heading_ids(entries: HeadingEntry[]): OutlineHeading[] {
  const occurrence_counts = new Map<string, number>();
  return entries.map((entry) => {
    const slug = heading_slug(entry.level, entry.text);
    const count = occurrence_counts.get(slug) ?? 0;
    occurrence_counts.set(slug, count + 1);
    return { ...entry, id: `${slug}-${String(count)}` };
  });
}

export function extract_headings_from_markdown(
  markdown: string,
): OutlineHeading[] {
  const entries: HeadingEntry[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(/^(#{1,6})\s+(.+)$/);
    if (match && match[1] && match[2]) {
      entries.push({
        level: match[1].length,
        text: match[2].replace(/\s*#+\s*$/, ""),
        pos: i,
      });
    }
  }
  return assign_heading_ids(entries);
}
