import type { Node as ProseNode } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import type { StepMap } from "prosemirror-transform";
import type { Decoration, DecorationSet } from "prosemirror-view";

/** A region of the new document a transaction left stale. */
export type ScanRange = { from: number; to: number };

/** A document node together with its position, as `nodesBetween` reports it. */
export type PositionedNode = { pos: number; node: ProseNode };

function map_forward(
  maps: readonly (StepMap | undefined)[],
  start: number,
  from: number,
  to: number,
): ScanRange {
  let mapped_from = from;
  let mapped_to = to;
  for (let i = start; i < maps.length; i++) {
    const next = maps[i];
    if (!next) continue;
    mapped_from = next.map(mapped_from, 1);
    mapped_to = next.map(mapped_to, -1);
  }
  return { from: mapped_from, to: mapped_to };
}

/**
 * The span a step rewrote even though its map is empty. Most non-replacement
 * steps (`AddMarkStep`, `RemoveMarkStep`, `AttrStep` from `setNodeMarkup`)
 * report `StepMap.empty`, so they would otherwise look like no-ops.
 */
function step_range(step: Transaction["steps"][number]): ScanRange | null {
  const candidate = step as { from?: number; to?: number; pos?: number };
  if (typeof candidate.from === "number") {
    return {
      from: candidate.from,
      to: typeof candidate.to === "number" ? candidate.to : candidate.from + 1,
    };
  }
  if (typeof candidate.pos === "number") {
    return { from: candidate.pos, to: candidate.pos + 1 };
  }
  return null;
}

/**
 * Union of the regions a transaction rewrote, in the new document's
 * coordinates. `null` when nothing was touched at a position.
 */
export function changed_range(tr: Transaction): ScanRange | null {
  let from = Infinity;
  let to = -Infinity;
  const maps = tr.mapping.maps;

  for (let i = 0; i < tr.steps.length; i++) {
    const map = maps[i];
    let touched = false;

    map?.forEach((_old_from, _old_to, new_from, new_to) => {
      touched = true;
      const range = map_forward(maps, i + 1, new_from, new_to);
      if (range.from < from) from = range.from;
      if (range.to > to) to = range.to;
    });

    if (touched) continue;
    const step = tr.steps[i];
    const step_span = step ? step_range(step) : null;
    if (!step_span) continue;
    const range = map_forward(maps, i + 1, step_span.from, step_span.to);
    if (range.from < from) from = range.from;
    if (range.to > to) to = range.to;
  }

  if (from > to) return null;
  return { from, to };
}

function merge_regions(nodes: readonly PositionedNode[]): ScanRange[] {
  const regions = nodes
    .map(({ pos, node }) => ({ from: pos, to: pos + node.nodeSize }))
    .sort((a, b) => a.from - b.from);
  const merged: ScanRange[] = [];
  for (const region of regions) {
    const last = merged[merged.length - 1];
    if (last && region.from <= last.to) {
      last.to = Math.max(last.to, region.to);
    } else {
      merged.push({ ...region });
    }
  }
  return merged;
}

/**
 * The seeds plus every matching node nested inside one of them, so the walk
 * stays within the seeds' own subtrees instead of re-entering the document.
 */
function with_nested_matches(
  seeds: readonly PositionedNode[],
  matches: (node: ProseNode, pos: number) => boolean,
): PositionedNode[] {
  const found = new Map<number, PositionedNode>();
  for (const seed of seeds) {
    found.set(seed.pos, seed);
    if (seed.node.isLeaf) continue;
    seed.node.descendants((node, offset) => {
      const pos = seed.pos + 1 + offset;
      if (!found.has(pos) && matches(node, pos)) found.set(pos, { pos, node });
      return true;
    });
  }
  return [...found.values()];
}

/**
 * Rebuilds the decorations of every `matches` node the given regions reach.
 * Each range is widened by one character: a pure deletion leaves an empty
 * range, and a point on a block boundary has to reach the block on both sides.
 *
 * The nodes found that way seed the regions to rewrite; every matching node
 * inside those regions is then rebuilt, not only the seeds, so nested nodes
 * (a task inside a task) whose decorations the region removal dropped come
 * back. Removal is by region, not per node, so coincident spans and
 * decorations a mapping recovered across a node boundary (a split inside a
 * text node) settle in one pass, and a sibling's node decoration that merely
 * touches the region survives.
 */
export function rescan_decorations(
  decorations: DecorationSet,
  doc: ProseNode,
  ranges: readonly ScanRange[],
  matches: (node: ProseNode, pos: number) => boolean,
  build: (node: ProseNode, pos: number) => Decoration[],
): DecorationSet {
  const seeds: PositionedNode[] = [];
  const seen = new Set<number>();
  for (const range of ranges) {
    const from = Math.max(0, Math.min(range.from - 1, doc.content.size - 1));
    const to = Math.min(range.to + 1, doc.content.size);
    doc.nodesBetween(from, to, (node, pos) => {
      if (seen.has(pos) || !matches(node, pos)) return true;
      seen.add(pos);
      seeds.push({ pos, node });
      return true;
    });
  }
  if (seeds.length === 0) return decorations;

  const regions = merge_regions(seeds);
  const stale = new Set<Decoration>();
  for (const region of regions) {
    for (const decoration of decorations.find(region.from, region.to)) {
      if (decoration.from < region.to && decoration.to > region.from) {
        stale.add(decoration);
      }
    }
  }

  let next = decorations.remove([...stale]);
  for (const { pos, node } of with_nested_matches(seeds, matches)) {
    next = next.add(doc, build(node, pos));
  }
  return next;
}
