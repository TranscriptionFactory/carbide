import { Fragment, Mark } from "prosemirror-model";
import type { Node as ProseNode } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";

// One document position's worth of inline content: a single text character
// (a UTF-16 code unit, as ProseMirror counts them) or a whole inline node.
type Unit = {
  char: string | null;
  node: ProseNode;
  offset: number;
  size: number;
};

export function inline_units(content: Fragment): Unit[] {
  const units: Unit[] = [];
  content.forEach((node, offset) => {
    if (!node.isText) {
      units.push({ char: null, node, offset, size: node.nodeSize });
      return;
    }
    const text = node.text ?? "";
    for (let i = 0; i < text.length; i++) {
      units.push({ char: text.charAt(i), node, offset: offset + i, size: 1 });
    }
  });
  return units;
}

function same_unit(a: Unit, b: Unit): boolean {
  if (a.char !== null || b.char !== null) return a.char === b.char;
  return a.node.hasMarkup(b.node.type, b.node.attrs, a.node.marks);
}

// Greedy left-to-right match of `short` inside `long`; returns, for each unit
// of `short`, the index of the `long` unit it matched, or null when `short`
// is not a subsequence of `long`.
export function match_subsequence(
  short: readonly Unit[],
  long: readonly Unit[],
): number[] | null {
  const matched: number[] = [];
  let j = 0;
  for (const unit of short) {
    let found = -1;
    while (found < 0 && j < long.length) {
      const candidate = long[j];
      if (candidate && same_unit(unit, candidate)) found = j;
      j++;
    }
    if (found < 0) return null;
    matched.push(found);
  }
  return matched;
}

function units_to_nodes(units: readonly Unit[]): ProseNode[] {
  const nodes: ProseNode[] = [];
  let run: { text: string; source: ProseNode } | null = null;
  const flush = () => {
    if (run)
      nodes.push(run.source.type.schema.text(run.text, run.source.marks));
    run = null;
  };
  for (const unit of units) {
    if (unit.char === null) {
      flush();
      nodes.push(unit.node);
    } else if (run && Mark.sameSet(run.source.marks, unit.node.marks)) {
      run.text += unit.char;
    } else {
      flush();
      run = { text: unit.char, source: unit.node };
    }
  }
  flush();
  return nodes;
}

function same_at(a: Unit[], i: number, b: Unit[], k: number): boolean {
  const x = a[i];
  const y = b[k];
  return x !== undefined && y !== undefined && same_unit(x, y);
}

function common_bounds(old_units: Unit[], new_units: Unit[]) {
  let start = 0;
  while (same_at(old_units, start, new_units, start)) start++;
  let old_end = old_units.length;
  let new_end = new_units.length;
  while (
    old_end > start &&
    new_end > start &&
    same_at(old_units, old_end - 1, new_units, new_end - 1)
  ) {
    old_end--;
    new_end--;
  }
  return { start, old_end, new_end };
}

function delete_unmatched(
  tr: Transaction,
  content_start: number,
  old_mid: Unit[],
  kept: number[],
): void {
  const keep = new Set(kept);
  const doomed = old_mid.filter((_unit, i) => !keep.has(i));
  for (const unit of doomed.reverse()) {
    const from = content_start + unit.offset;
    tr.delete(from, from + unit.size);
  }
}

// `matched[i]` is the new unit that old unit `i` survived as; the new units
// between two survivors are inserted before the later survivor. Groups are
// applied back to front so the old offsets stay valid.
function insert_unmatched(
  tr: Transaction,
  content_start: number,
  old_mid: Unit[],
  new_mid: Unit[],
  matched: number[],
  mid_end_offset: number,
): void {
  const groups: Array<{ at: number; units: Unit[] }> = [];
  let next_new = 0;
  old_mid.forEach((unit, old_index) => {
    const new_index = matched[old_index] ?? next_new;
    if (new_index > next_new) {
      groups.push({
        at: unit.offset,
        units: new_mid.slice(next_new, new_index),
      });
    }
    next_new = new_index + 1;
  });
  if (next_new < new_mid.length) {
    groups.push({ at: mid_end_offset, units: new_mid.slice(next_new) });
  }
  for (const group of groups.reverse()) {
    tr.insert(content_start + group.at, units_to_nodes(group.units));
  }
}

function sync_marks(
  tr: Transaction,
  content_start: number,
  target: Fragment,
): void {
  target.forEach((wanted, offset) => {
    const from = content_start + offset;
    const to = from + wanted.nodeSize;
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isInline) return true;
      const a = Math.max(pos, from);
      const b = Math.min(pos + node.nodeSize, to);
      for (const mark of node.marks) {
        if (!mark.isInSet(wanted.marks)) tr.removeMark(a, b, mark);
      }
      for (const mark of wanted.marks) {
        if (!mark.isInSet(node.marks)) tr.addMark(a, b, mark);
      }
      return false;
    });
  });
}

// Rewrites the inline content of the textblock at `block_pos` to `target`
// with the fewest structural steps it can find: pure insertions or pure
// deletions of characters plus mark steps, falling back to one replacement of
// the differing middle. Small steps keep other positions (the caret, undo
// history) mapping through cleanly where a whole-block replace would not.
export function rewrite_inline_content(
  tr: Transaction,
  block_pos: number,
  target: Fragment,
): void {
  const block = tr.doc.nodeAt(block_pos);
  if (!block) return;
  const content_start = block_pos + 1;
  const old_units = inline_units(block.content);
  const new_units = inline_units(target);
  const { start, old_end, new_end } = common_bounds(old_units, new_units);
  const old_mid = old_units.slice(start, old_end);
  const new_mid = new_units.slice(start, new_end);
  const mid_end_offset = old_units[old_end]?.offset ?? block.content.size;

  const kept = match_subsequence(new_mid, old_mid);
  const added = kept ? null : match_subsequence(old_mid, new_mid);
  if (kept) {
    delete_unmatched(tr, content_start, old_mid, kept);
  } else if (added) {
    insert_unmatched(
      tr,
      content_start,
      old_mid,
      new_mid,
      added,
      mid_end_offset,
    );
  } else {
    const from = content_start + (old_mid[0]?.offset ?? mid_end_offset);
    tr.replaceWith(
      from,
      content_start + mid_end_offset,
      Fragment.from(units_to_nodes(new_mid)),
    );
  }
  sync_marks(tr, content_start, target);
}
