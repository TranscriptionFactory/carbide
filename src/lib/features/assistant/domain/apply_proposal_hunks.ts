import type { ProposalHunk } from "$lib/features/assistant/types/proposal";

// Only selected hunks apply (R4). Bottom-up splice, mirroring
// lint/domain/apply_text_edits.ts: hunks are applied from the end of the
// file backward so an earlier hunk's old_line numbers are never invalidated
// by a later hunk's edit.
export function apply_proposal_hunks(
  content: string,
  hunks: ProposalHunk[],
): string {
  const selected = hunks.filter((hunk) => hunk.selected);
  if (selected.length === 0) return content;

  const lines = content.split("\n");
  const ordered = [...selected].sort((a, b) => hunk_anchor(b) - hunk_anchor(a));

  for (const hunk of ordered) {
    const new_side = hunk.lines
      .filter((line) => line.kind !== "del")
      .map((line) => line.content);
    const span = old_line_span(hunk);

    if (!span) {
      lines.push(...new_side);
      continue;
    }

    lines.splice(span.start - 1, span.end - span.start + 1, ...new_side);
  }

  return lines.join("\n");
}

// A hunk with no old-side lines (pure insertion carrying no context/del, so
// no old_line anchor at all) sorts last and is appended at end-of-file — the
// hunk itself carries no positional information to do otherwise.
function hunk_anchor(hunk: ProposalHunk): number {
  return old_line_span(hunk)?.end ?? Number.NEGATIVE_INFINITY;
}

function old_line_span(
  hunk: ProposalHunk,
): { start: number; end: number } | null {
  const line_numbers = hunk.lines
    .filter((line) => line.kind === "context" || line.kind === "del")
    .map((line) => line.old_line)
    .filter((line_number): line_number is number => line_number !== null);

  if (line_numbers.length === 0) return null;
  return { start: Math.min(...line_numbers), end: Math.max(...line_numbers) };
}
