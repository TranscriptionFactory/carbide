import type { AiApplyTarget } from "$lib/features/ai/domain/ai_types";
import {
  compute_note_revision,
  type Proposal,
  type ProposalHunk,
  type ProposalLine,
  type ProposalOrigin,
} from "$lib/features/assistant";

// I5's producer: the panel and inline surfaces both diff a before/after
// markdown pair and hand the result to the proposal store. This module owns
// the diff *algorithm*, remapped onto ProposalHunk/ProposalLine — the
// assistant contract's shape — rather than a parallel local type, so the
// AI-edit surfaces carry exactly one hunk model.

// `lines` is the full, unwindowed diff — kept alongside `hunks` (the ± 2
// line windows used for display and for the note-path proposal producer)
// because the document-context apply path (out of scope for the proposal
// contract this cycle — see ai_actions.ts's ALLOWED_DIRECT_APPLY) still
// needs to reconstruct a complete output string from a hunk selection.
export type AiDraftDiff = {
  additions: number;
  deletions: number;
  lines: ProposalLine[];
  hunks: ProposalHunk[];
};

const HUNK_CONTEXT_LINES = 2;

function split_lines(input: string): string[] {
  return input.split("\n");
}

function lcs_table(left: string[], right: string[]): number[][] {
  const table: number[][] = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      const row = table[i];
      const next_row = table[i + 1];
      if (!row || !next_row) {
        continue;
      }
      row[j] =
        left[i] === right[j]
          ? (next_row[j + 1] ?? 0) + 1
          : Math.max(next_row[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  return table;
}

function diff_lines(original: string[], revised: string[]): ProposalLine[] {
  const table = lcs_table(original, revised);
  const lines: ProposalLine[] = [];
  let i = 0;
  let j = 0;
  let old_line = 1;
  let new_line = 1;

  while (i < original.length && j < revised.length) {
    if (original[i] === revised[j]) {
      lines.push({
        kind: "context",
        content: original[i] ?? "",
        old_line,
        new_line,
      });
      i += 1;
      j += 1;
      old_line += 1;
      new_line += 1;
      continue;
    }

    const row = table[i];
    const next_row = table[i + 1];
    const down = next_row?.[j] ?? 0;
    const right_score = row?.[j + 1] ?? 0;

    if (down >= right_score) {
      lines.push({
        kind: "del",
        content: original[i] ?? "",
        old_line,
        new_line: null,
      });
      i += 1;
      old_line += 1;
      continue;
    }

    lines.push({
      kind: "add",
      content: revised[j] ?? "",
      old_line: null,
      new_line,
    });
    j += 1;
    new_line += 1;
  }

  while (i < original.length) {
    lines.push({
      kind: "del",
      content: original[i] ?? "",
      old_line,
      new_line: null,
    });
    i += 1;
    old_line += 1;
  }

  while (j < revised.length) {
    lines.push({
      kind: "add",
      content: revised[j] ?? "",
      old_line: null,
      new_line,
    });
    j += 1;
    new_line += 1;
  }

  return lines;
}

function hunk_ranges(lines: ProposalLine[]) {
  const ranges: Array<{ start: number; end: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.kind === "context") {
      continue;
    }

    const start = Math.max(0, index - HUNK_CONTEXT_LINES);
    const end = Math.min(lines.length, index + HUNK_CONTEXT_LINES + 1);
    const last_range = ranges[ranges.length - 1];

    if (!last_range || start > last_range.end) {
      ranges.push({ start, end });
      continue;
    }

    last_range.end = Math.max(last_range.end, end);
  }

  return ranges;
}

function hunk_header(lines: ProposalLine[]) {
  const old_start =
    lines.find((line) => line.old_line !== null)?.old_line ??
    lines.find((line) => line.new_line !== null)?.new_line ??
    1;
  const new_start =
    lines.find((line) => line.new_line !== null)?.new_line ??
    lines.find((line) => line.old_line !== null)?.old_line ??
    1;
  const old_count = lines.filter((line) => line.kind !== "add").length;
  const new_count = lines.filter((line) => line.kind !== "del").length;

  return `@@ -${String(old_start)},${String(old_count)} +${String(new_start)},${String(new_count)} @@`;
}

function assign_hunks(lines: ProposalLine[]): ProposalHunk[] {
  const ranges = hunk_ranges(lines);

  return ranges.map((range, index) => {
    const hunk_lines = lines.slice(range.start, range.end);
    return {
      id: `hunk-${String(index + 1)}`,
      header: hunk_header(hunk_lines),
      lines: hunk_lines,
      selected: true,
    };
  });
}

export function create_ai_draft_diff(input: {
  original_text: string;
  draft_text: string;
  target: AiApplyTarget;
}): AiDraftDiff {
  const original_lines = split_lines(input.original_text);
  const draft_lines = split_lines(input.draft_text);
  const lines = diff_lines(original_lines, draft_lines);
  const additions = lines.filter((line) => line.kind === "add").length;
  const deletions = lines.filter((line) => line.kind === "del").length;
  const hunks = assign_hunks(lines);

  return {
    additions,
    deletions,
    lines,
    hunks:
      hunks.length > 0
        ? hunks
        : [
            {
              id: "hunk-1",
              header:
                input.target === "selection"
                  ? "@@ AI selection draft @@"
                  : "@@ AI full note draft @@",
              lines,
              selected: true,
            },
          ],
  };
}

// Document-context apply only (see ai_actions.ts's ALLOWED_DIRECT_APPLY):
// reconstructs the full output text for a hunk selection. Hunk membership is
// tracked by line identity rather than a `hunk_id` field, since ProposalLine
// (the frozen shape) carries none.
export function apply_ai_draft_hunk_selection(input: {
  diff: AiDraftDiff;
  selected_hunk_ids: string[];
}): string {
  const selected_hunk_ids = new Set(input.selected_hunk_ids);
  const hunk_of_line = new Map<ProposalLine, string>();
  for (const hunk of input.diff.hunks) {
    for (const line of hunk.lines) hunk_of_line.set(line, hunk.id);
  }

  const output: string[] = [];
  for (const line of input.diff.lines) {
    if (line.kind === "context") {
      output.push(line.content);
      continue;
    }

    const hunk_id = hunk_of_line.get(line);
    if (hunk_id && selected_hunk_ids.has(hunk_id)) {
      if (line.kind === "add") {
        output.push(line.content);
      }
      continue;
    }

    if (line.kind === "del") {
      output.push(line.content);
    }
  }

  return output.join("\n");
}

// I5's producer: turns a before/after markdown pair into a Proposal the
// store can hold pending. base_revision is computed against `original_text`
// — the note as it stood before this draft — so the apply service can tell a
// drifted note from an untouched one (R4) when the batch is later accepted.
export function build_proposal(input: {
  note_path: string;
  original_text: string;
  draft_text: string;
  target: AiApplyTarget;
  origin: ProposalOrigin;
}): Proposal {
  const diff = create_ai_draft_diff(input);
  return {
    id: crypto.randomUUID(),
    note_path: input.note_path,
    base_revision: compute_note_revision(input.original_text),
    hunks: diff.hunks,
    origin: input.origin,
    status: "pending",
    created_at: Date.now(),
  };
}
