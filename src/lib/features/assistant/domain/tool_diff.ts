import { diff_lines, split_lines } from "$lib/features/ai";
import type { ProposalLine } from "$lib/features/assistant/types/proposal";

export type DiffRow =
  | { kind: "add" | "del" | "ctx"; text: string }
  | { kind: "gap"; count: number }
  | { kind: "bail"; reason: string };

type TextRow = Extract<DiffRow, { text: string }>;

const MAX_DIFF_LINES = 2000;
const EDGE_CONTEXT_LINES = 3;
// 3 leading + 3 trailing + 2 slack: collapsing a shorter run would hide
// fewer lines than the gap marker itself occupies.
const COLLAPSE_THRESHOLD = 8;

export function compute_diff_rows(
  old_text: string | null,
  new_text: string,
): DiffRow[] {
  const revised = split_lines(new_text);

  if (old_text === null) {
    return revised.map((text) => ({ kind: "add", text }) as DiffRow);
  }

  const original = split_lines(old_text);
  const line_count = Math.max(original.length, revised.length);
  if (line_count > MAX_DIFF_LINES) {
    return [
      {
        kind: "bail",
        reason: `Diff too large to render (${String(line_count)} lines)`,
      },
    ];
  }

  return collapse_unchanged_runs(diff_lines(original, revised).map(to_row));
}

function to_row(line: ProposalLine): TextRow {
  if (line.kind === "add") return { kind: "add", text: line.content };
  if (line.kind === "del") return { kind: "del", text: line.content };
  return { kind: "ctx", text: line.content };
}

function collapse_unchanged_runs(rows: TextRow[]): DiffRow[] {
  const collapsed: DiffRow[] = [];
  let index = 0;

  while (index < rows.length) {
    const row = rows[index];
    if (!row) break;

    if (row.kind !== "ctx") {
      collapsed.push(row);
      index += 1;
      continue;
    }

    const start = index;
    let end = index;
    while (end < rows.length && rows[end]?.kind === "ctx") end += 1;
    const run = rows.slice(start, end);
    index = end;

    if (run.length <= COLLAPSE_THRESHOLD) {
      collapsed.push(...run);
      continue;
    }

    // The file's untouched head and tail have no change to anchor against, so
    // they collapse whole rather than leaving orphaned context.
    const leading = start === 0 ? 0 : EDGE_CONTEXT_LINES;
    const trailing = end === rows.length ? 0 : EDGE_CONTEXT_LINES;

    collapsed.push(...run.slice(0, leading));
    collapsed.push({ kind: "gap", count: run.length - leading - trailing });
    if (trailing > 0) collapsed.push(...run.slice(run.length - trailing));
  }

  return collapsed;
}
