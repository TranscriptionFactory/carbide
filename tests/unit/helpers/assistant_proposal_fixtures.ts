import type {
  Proposal,
  ProposalHunk,
  ProposalLine,
} from "$lib/features/assistant";

// C2 shared fixtures (E1). AU-031/AU-032a render proposals from these via
// props — the store's mutators are AU-030's and stay NOT_IMPLEMENTED until it
// lands, so nothing in a UI lane may depend on them.

let next_proposal = 0;
let next_hunk = 0;

export function make_proposal_line(
  overrides: Partial<ProposalLine> = {},
): ProposalLine {
  return {
    kind: "context",
    content: "weights are still hand-tuned",
    old_line: 12,
    new_line: 12,
    ...overrides,
  };
}

// Defaults to a realistic mixed hunk (one deletion, two additions) rather
// than a single line, so a renderer that only handles one line kind fails on
// the default fixture instead of passing until someone writes a richer case.
export function make_proposal_hunk(
  overrides: Partial<ProposalHunk> = {},
): ProposalHunk {
  next_hunk += 1;
  return {
    id: `hunk-${String(next_hunk)}`,
    header: "@@ Open questions @@",
    lines: [
      make_proposal_line({
        kind: "del",
        content: "weights are still hand-tuned",
        new_line: null,
      }),
      make_proposal_line({
        kind: "add",
        content:
          "weights are hand-tuned — validate k=60 against [[rrf-weights]]",
        old_line: null,
      }),
      make_proposal_line({
        kind: "add",
        content: "measure block-vs-note score interaction (duplicate sources)",
        old_line: null,
      }),
    ],
    selected: true,
    ...overrides,
  };
}

export function make_proposal(overrides: Partial<Proposal> = {}): Proposal {
  next_proposal += 1;
  return {
    id: `proposal-${String(next_proposal)}`,
    note_path: "hybrid-retrieval.md",
    base_revision: "rev-base",
    hunks: [make_proposal_hunk()],
    origin: { session_id: "session-1", run_id: null },
    status: "pending",
    created_at: 1_700_000_000_000,
    ...overrides,
  };
}
