import type { GitDiff } from "$lib/features/git";
import {
  compute_note_revision,
  type Proposal,
  type ProposalHunk,
  type ProposalLine,
  type ProposalLineKind,
  type ProposalOrigin,
} from "$lib/features/assistant";

// Derived from GitDiff rather than imported directly: the git entrypoint
// exposes only the top-level type, and deriving keeps these structurally
// pinned to it so they cannot drift the way the hand-written mirror did.
export type GitDiffHunk = GitDiff["hunks"][number];
export type GitDiffLine = GitDiffHunk["lines"][number];

// A turn's end-of-turn diff, sorted into what the frozen Proposal contract can
// and cannot carry. The contract describes note *content* at a revision
// (assistant/types/proposal.ts) and has no representation for a file coming
// into or going out of existence, so creations and deletions are handled
// outside the queue and counted rather than being forced into it.
export type AgentTurnFileDiff = {
  note_path: string;
  hunks: GitDiffHunk[];
};

export type AgentTurnDiffTriage = {
  modified: AgentTurnFileDiff[];
  created_paths: string[];
  deleted_paths: string[];
  skipped_non_note: string[];
  skipped_binary: string[];
};

const LINE_KIND: Record<GitDiffLine["type"], ProposalLineKind> = {
  addition: "add",
  deletion: "del",
  context: "context",
};

export function is_note_path(path: string): boolean {
  return /\.md$/i.test(path);
}

// I-i, the lane's load-bearing safety property. The turn's checkpoint stages
// everything (GitService.create_checkpoint commits with a null file list), so
// the end-of-turn diff contains the user's concurrent edits alongside the
// agent's and cannot tell them apart. Rolling a note back on the strength of
// the diff alone would therefore eat whatever the user typed during the turn.
// The tool transcript is the only record of what the agent actually touched,
// so it, not the diff, decides what is in scope.
export function triage_turn_diff(
  hunks: readonly GitDiffHunk[],
  touched_paths: readonly string[],
): AgentTurnDiffTriage {
  const touched = new Set(touched_paths);
  const triage: AgentTurnDiffTriage = {
    modified: [],
    created_paths: [],
    deleted_paths: [],
    skipped_non_note: [],
    skipped_binary: [],
  };

  for (const [note_path, file_hunks] of group_by_file(hunks)) {
    if (!touched.has(note_path)) continue;
    if (!is_note_path(note_path)) {
      triage.skipped_non_note.push(note_path);
      continue;
    }

    const lines = file_hunks.flatMap(content_lines);
    if (lines.length === 0) {
      triage.skipped_binary.push(note_path);
      continue;
    }

    if (lines.every((line) => line.old_line === null)) {
      triage.created_paths.push(note_path);
    } else if (lines.every((line) => line.new_line === null)) {
      triage.deleted_paths.push(note_path);
    } else {
      triage.modified.push({ note_path, hunks: file_hunks });
    }
  }

  return triage;
}

export type AgentTurnProposalInput = {
  file: AgentTurnFileDiff;
  base_content: string;
};

// `base_revision` is derived from the same bytes the caller writes back to
// disk during rollback, never from a re-read, so there is no window in which
// the recorded revision and the file on disk can disagree.
export function build_turn_proposals(
  inputs: readonly AgentTurnProposalInput[],
  origin: ProposalOrigin,
  created_at: number,
): Proposal[] {
  return inputs.map(({ file, base_content }) => {
    const id = proposal_id(origin, created_at, file.note_path);
    return {
      id,
      note_path: file.note_path,
      base_revision: compute_note_revision(base_content),
      hunks: file.hunks.map((hunk, index) => to_proposal_hunk(hunk, id, index)),
      origin,
      status: "pending",
      created_at,
    };
  });
}

function proposal_id(
  origin: ProposalOrigin,
  created_at: number,
  note_path: string,
): string {
  return `${origin.run_id ?? origin.session_id}:${String(created_at)}:${note_path}`;
}

function to_proposal_hunk(
  hunk: GitDiffHunk,
  proposal: string,
  index: number,
): ProposalHunk {
  return {
    id: `${proposal}#${String(index)}`,
    header: hunk.header,
    lines: content_lines(hunk).map(to_proposal_line),
    selected: true,
  };
}

function to_proposal_line(line: GitDiffLine): ProposalLine {
  return {
    kind: LINE_KIND[line.type],
    content: strip_line_terminator(line.content),
    old_line: line.old_line,
    new_line: line.new_line,
  };
}

// libgit2 hands back each line with its terminator attached, and
// apply_proposal_hunks rejoins the applied lines with "\n". Carrying the
// terminator through would double every newline in an accepted proposal.
function strip_line_terminator(content: string): string {
  return content.replace(/\r?\n$/, "");
}

// A unified diff's line stream also carries file headers, hunk headers and the
// "\ No newline at end of file" marker, and the Rust side maps every origin it
// does not recognise to "context" (features/git/service.rs, line_type). Those
// pseudo-lines are exactly the ones libgit2 assigns no line number to, on
// either side — real content always has at least one. Splicing them into a
// note would inject "@@ -1,3 +1,4 @@" into the user's prose.
function content_lines(hunk: GitDiffHunk): GitDiffLine[] {
  return hunk.lines.filter(
    (line) => line.old_line !== null || line.new_line !== null,
  );
}

function group_by_file(
  hunks: readonly GitDiffHunk[],
): Map<string, GitDiffHunk[]> {
  const grouped = new Map<string, GitDiffHunk[]>();
  for (const hunk of hunks) {
    const existing = grouped.get(hunk.file_path);
    if (existing) existing.push(hunk);
    else grouped.set(hunk.file_path, [hunk]);
  }
  return grouped;
}
