import type { OutlineHeading } from "$lib/features/outline";

export function extract_html_headings(html: string): OutlineHeading[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(
    (heading, pos) => ({
      id: heading.id || `carbide-heading-${String(pos)}`,
      level: Number(heading.tagName.slice(1)),
      text: (heading.textContent ?? "").trim(),
      pos,
    }),
  );
}
