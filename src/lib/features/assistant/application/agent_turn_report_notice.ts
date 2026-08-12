import type { AgentTurnProposalReport } from "$lib/features/assistant/application/agent_proposal_service";

const NAME_LIMIT = 3;

// AgentProposalService reports a note it refused to roll back with STALE_ERROR,
// whose text is "the note changed on disk after the checkpoint". That is not a
// failure — it is the user's evidence that the edit they made during the turn
// is still the copy on disk — so it is separated out and worded as an outcome.
const STALE_MARKER = "changed on disk";

const NO_ANCHOR_NOTICE =
  "No proposals for this turn: there is no git checkpoint to compare against, " +
  "because the vault is not a git repository or has no commits yet. " +
  "This turn's edits are saved to disk and were not reviewable. " +
  'Run "Initialize Git Repository" from the command palette to make future turns reviewable.';

const HEADER = "Not everything in this turn could be proposed for review:";

// The turn's report reaches log.info and nothing else, so every category below
// is a change the user cannot see and cannot review. Each line states what
// happened AND where the bytes ended up, because "no proposal" is only half the
// news — the other half is that the writes are already on disk.
export function build_turn_report_notice(
  report: AgentTurnProposalReport,
): string | null {
  if (report.status === "no_anchor") return NO_ANCHOR_NOTICE;

  const stale = report.failed.filter(is_stale);
  const failed = report.failed.filter((entry) => !is_stale(entry));

  const lines = [
    line(
      report.kept_creations,
      "Created, left on disk and not reviewable (a new note is in no commit, so it cannot be rolled back loss-free)",
    ),
    line(
      report.reverted_deletions,
      "Deleted by the agent, restored from the checkpoint",
    ),
    line(
      report.skipped_non_note,
      "Edited on disk outside review — only Markdown notes can be proposed",
    ),
    line(
      report.skipped_binary,
      "Changed with no reviewable text diff, left on disk",
    ),
    line(
      stale.map((entry) => entry.note_path),
      "Changed on disk during the turn, so your version was kept and nothing was proposed",
    ),
    line(
      failed.map((entry) => entry.note_path),
      "Could not be rolled back to the checkpoint, so the turn's edits are still on disk and unreviewed",
    ),
  ].filter((entry): entry is string => entry !== null);

  if (lines.length === 0) return null;
  return [HEADER, ...lines].join("\n");
}

function is_stale(entry: { error: string }): boolean {
  return entry.error.includes(STALE_MARKER);
}

function line(paths: readonly string[], label: string): string | null {
  if (paths.length === 0) return null;
  return `- ${label}: ${names(paths)}`;
}

// Compact by contract: a turn that touched forty files must not paste forty
// paths into the transcript.
function names(paths: readonly string[]): string {
  if (paths.length <= NAME_LIMIT) return paths.join(", ");
  const shown = paths.slice(0, NAME_LIMIT).join(", ");
  const rest = paths.length - NAME_LIMIT;
  return `${shown} and ${String(rest)} more`;
}
