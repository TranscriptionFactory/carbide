import {
  to_proposal_summary,
  type Proposal,
  type ProposalHunkId,
  type ProposalId,
  type ProposalStatus,
  type ProposalSummary,
} from "$lib/features/assistant/types/proposal";

const NOT_IMPLEMENTED = "NOT_IMPLEMENTED: AU-030 implements the proposal store";

// I5: the one proposal queue. In-memory by contract (R4/I8) — no persistence
// port, no hydration reactor, nothing survives a restart. Read paths are real
// because they are the frozen shape AU-031/AU-032a build against; every
// mutator is AU-030's to implement.
export class AssistantProposalStore {
  proposals = $state<Proposal[]>([]);

  // Injectable clock, AU-005/AU-010 precedent — created_at comes from here so
  // tests never sleep. Public until AU-030's mutators consume it.
  constructor(readonly now: () => number = () => Date.now()) {}

  get summaries(): ProposalSummary[] {
    return this.proposals.map(to_proposal_summary);
  }

  get pending(): Proposal[] {
    return this.proposals.filter((proposal) => proposal.status === "pending");
  }

  get(id: ProposalId): Proposal | null {
    return this.proposals.find((proposal) => proposal.id === id) ?? null;
  }

  by_note(note_path: string): Proposal[] {
    return this.proposals.filter(
      (proposal) => proposal.note_path === note_path,
    );
  }

  // The review center's provenance grouping (mockup §3).
  by_session(session_id: string): Proposal[] {
    return this.proposals.filter(
      (proposal) => proposal.origin.session_id === session_id,
    );
  }

  add(_proposal: Proposal): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  // An agent turn produces a whole batch at once (R7); adding them one at a
  // time would let the review center render a half-arrived turn.
  add_many(_proposals: Proposal[]): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  set_status(_id: ProposalId, _status: ProposalStatus): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  set_hunk_selected(
    _id: ProposalId,
    _hunk_id: ProposalHunkId,
    _selected: boolean,
  ): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  set_all_hunks_selected(_id: ProposalId, _selected: boolean): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  remove(_id: ProposalId): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  clear(): void {
    throw new Error(NOT_IMPLEMENTED);
  }
}
