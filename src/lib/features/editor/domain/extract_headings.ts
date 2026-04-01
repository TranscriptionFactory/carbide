import type { OutlineHeading } from "$lib/features/outline";

export function extract_headings_from_markdown(
  markdown: string,
): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const occurrence_counts = new Map<string, number>();
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(/^(#{1,6})\s+(.+)$/);
    if (match && match[1] && match[2]) {
      const level = match[1].length;
      const text = match[2].replace(/\s*#+\s*$/, "");
      const slug = `h-${String(level)}-${text
        .toLowerCase()
        .replace(/[^\w]+/g, "-")
        .replace(/^-|-$/g, "")}`;
      const count = occurrence_counts.get(slug) ?? 0;
      occurrence_counts.set(slug, count + 1);

      headings.push({
        id: `${slug}-${String(count)}`,
        level,
        text,
        pos: i,
      });
    }
  }
  return headings;
}
