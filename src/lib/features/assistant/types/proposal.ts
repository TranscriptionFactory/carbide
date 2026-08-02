// C2 contracts — frozen for the cycle (E1). A lane needing a change files it
// to the orchestrator instead of editing.
//
// I5: every AI note-mutation flows through the proposal store behind a
// checkpoint. Inline decorations, panel diffs and the review center are three
// renderings of this one queue (mockup §3), never three apply paths.
//
// I8/R4: proposals are IN-MEMORY ONLY. There is no persistence port here and
// there must not be one — a restart clears the queue and leaves notes
// untouched. The program's only persisted-format change was C1's.

import type { RunId } from "$lib/features/assistant/types/run";

export type ProposalId = string;
export type ProposalHunkId = string;

// Opaque marker for "the note content this proposal was computed against"
// (R4). No note revision concept exists anywhere in the tree today — verified
// at C2 contract time — so this cycle introduces one, deliberately as a value
// derived from content rather than from mtime: an editor that rewrites a note
// to identical bytes must NOT invalidate a pending proposal.
export type NoteRevision = string;

export type ProposalLineKind = "context" | "add" | "del";

export type ProposalLine = {
  kind: ProposalLineKind;
  content: string;
  old_line: number | null;
  new_line: number | null;
};

// Mirrors GitDiffHunk's shape so an agent turn's end-of-turn diff maps across
// without a translation layer (AU-032b). `selected` is review state, not diff
// state: the review center toggles it per hunk and apply honours it.
export type ProposalHunk = {
  id: ProposalHunkId;
  header: string;
  lines: ProposalLine[];
  selected: boolean;
};

// Provenance — the mockup's "from ▤ this session" chip and the review
// center's grouping key. A proposal always knows which session produced it;
// `run_id` is null for proposals not born of a kernel run (e.g. ambient
// producers in C3).
export type ProposalOrigin = {
  session_id: string;
  run_id: RunId | null;
};

// `stale` is terminal-on-detection, not a fourth pending state: it means the
// note moved under the proposal and the hunks can no longer be trusted to
// apply where they were computed. Staleness is checked AT APPLY (R4), not
// polled — a proposal may sit `pending` over a note that has already drifted.
export type ProposalStatus = "pending" | "applied" | "rejected" | "stale";

export type Proposal = {
  id: ProposalId;
  note_path: string;
  base_revision: NoteRevision;
  hunks: ProposalHunk[];
  origin: ProposalOrigin;
  status: ProposalStatus;
  created_at: number;
};

export type ProposalSummary = {
  id: ProposalId;
  note_path: string;
  hunk_count: number;
  selected_hunk_count: number;
  status: ProposalStatus;
};

export function to_proposal_summary(proposal: Proposal): ProposalSummary {
  return {
    id: proposal.id,
    note_path: proposal.note_path,
    hunk_count: proposal.hunks.length,
    selected_hunk_count: proposal.hunks.filter((hunk) => hunk.selected).length,
    status: proposal.status,
  };
}
