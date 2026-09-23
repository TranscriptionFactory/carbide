import { Plugin, PluginKey } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { OutlineHeading } from "$lib/features/outline";
import { changed_range, type ScanRange } from "./incremental_scan";

type HeadingEntry = Omit<OutlineHeading, "id">;

type OutlinePluginState = {
  headings: OutlineHeading[];
  /** Bumped only when ids, levels or texts change, not on position shifts. */
  structure_revision: number;
};

export const outline_plugin_key = new PluginKey<OutlinePluginState>("outline");

function heading_slug(level: number, text: string): string {
  return `h-${String(level)}-${text
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function assign_ids(entries: HeadingEntry[]): OutlineHeading[] {
  const occurrence_counts = new Map<string, number>();
  return entries.map((entry) => {
    const slug = heading_slug(entry.level, entry.text);
    const count = occurrence_counts.get(slug) ?? 0;
    occurrence_counts.set(slug, count + 1);
    return { ...entry, id: `${slug}-${String(count)}` };
  });
}

function collect_heading_entries(
  doc: ProseNode,
  from: number,
  to: number,
): HeadingEntry[] {
  const entries: HeadingEntry[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "heading" && node.attrs.level) {
      entries.push({
        level: node.attrs.level as number,
        text: node.textContent,
        pos,
      });
    }
  });
  return entries;
}

export function extract_headings(doc: ProseNode): OutlineHeading[] {
  return assign_ids(collect_heading_entries(doc, 0, doc.content.size));
}

/** Index of the first heading whose position is at or after `pos`. */
function first_heading_from(
  headings: readonly { pos: number }[],
  pos: number,
): number {
  let lo = 0;
  let hi = headings.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((headings[mid]?.pos ?? Infinity) < pos) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function active_heading_at(
  headings: OutlineHeading[],
  pos: number,
): string | null {
  return headings[first_heading_from(headings, pos + 1) - 1]?.id ?? null;
}

function same_structure(
  a: readonly HeadingEntry[],
  b: readonly HeadingEntry[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, i) => {
    const other = b[i];
    return other?.level === entry.level && other.text === entry.text;
  });
}

// Every top-level block the change reached, so a heading nested in a
// container is re-read along with the block that holds it.
function top_level_span(doc: ProseNode, range: ScanRange): ScanRange {
  const to = Math.min(range.to, doc.content.size);
  const $from = doc.resolve(Math.min(range.from, to));
  const $to = doc.resolve(to);
  return {
    from: $from.depth > 0 ? $from.before(1) : $from.pos,
    to: $to.depth > 0 ? $to.after(1) : $to.pos,
  };
}

/**
 * The outline after `tr`, re-reading only the top-level blocks it changed:
 * headings before the change are kept, headings after it only shift, and ids
 * are renumbered only when the heading structure changed.
 */
export function update_headings(
  tr: Transaction,
  prev: OutlinePluginState,
): OutlinePluginState {
  const range = changed_range(tr);
  if (!range) return prev;
  const span = top_level_span(tr.doc, range);
  const delta = tr.doc.content.size - tr.before.content.size;

  const head_end = first_heading_from(prev.headings, span.from);
  const tail_start = Math.max(
    head_end,
    first_heading_from(prev.headings, span.to - delta),
  );
  const old_middle = prev.headings.slice(head_end, tail_start);
  const new_middle = collect_heading_entries(tr.doc, span.from, span.to);
  const same = same_structure(old_middle, new_middle);
  const unmoved = old_middle.every((h, i) => h.pos === new_middle[i]?.pos);
  if (same && unmoved && delta === 0) return prev;

  const head = prev.headings.slice(0, head_end);
  const tail = prev.headings
    .slice(tail_start)
    .map((h) => ({ ...h, pos: h.pos + delta }));
  if (!same) {
    return {
      headings: assign_ids([...head, ...new_middle, ...tail]),
      structure_revision: prev.structure_revision + 1,
    };
  }
  const middle = new_middle.map((entry, i) => ({
    ...entry,
    id: old_middle[i]?.id ?? "",
  }));
  return {
    headings: [...head, ...middle, ...tail],
    structure_revision: prev.structure_revision,
  };
}

export function create_outline_prose_plugin(): Plugin<OutlinePluginState> {
  return new Plugin<OutlinePluginState>({
    key: outline_plugin_key,
    state: {
      init(_config, state) {
        return { headings: extract_headings(state.doc), structure_revision: 0 };
      },
      apply(tr, plugin_state) {
        if (!tr.docChanged) return plugin_state;
        return update_headings(tr, plugin_state);
      },
    },
  });
}
