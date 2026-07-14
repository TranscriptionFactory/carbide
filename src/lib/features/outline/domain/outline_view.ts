import type { OutlineHeading } from "../types/outline";

export function compute_visible_headings(
  headings: OutlineHeading[],
  collapsed_ids: ReadonlySet<string>,
): OutlineHeading[] {
  const result: OutlineHeading[] = [];
  const skip_below_level: number[] = [];

  for (const heading of headings) {
    while (
      skip_below_level.length > 0 &&
      heading.level <= (skip_below_level[skip_below_level.length - 1] ?? 0)
    ) {
      skip_below_level.pop();
    }

    if (skip_below_level.length > 0) continue;

    result.push(heading);

    if (collapsed_ids.has(heading.id)) {
      skip_below_level.push(heading.level);
    }
  }

  return result;
}

export function compute_active_heading_id(
  headings: OutlineHeading[],
  heading_tops: number[],
  scroll_top: number,
  max_scroll: number,
): string | null {
  if (headings.length === 0 || heading_tops.length === 0) return null;

  const threshold = scroll_top + 80;
  let last_id: string | null = null;

  for (let i = 0; i < headings.length && i < heading_tops.length; i++) {
    const top = heading_tops[i];
    const h = headings[i];
    if (top === undefined || !h) break;
    if (top <= threshold) {
      last_id = h.id;
    } else {
      break;
    }
  }

  if (max_scroll > 0 && scroll_top >= max_scroll - 2) {
    const last_heading = headings[headings.length - 1];
    if (last_heading) {
      last_id = last_heading.id;
    }
  }

  return last_id ?? headings[0]?.id ?? null;
}
