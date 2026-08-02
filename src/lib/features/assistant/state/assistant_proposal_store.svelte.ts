import {
  to_proposal_summary,
  type Proposal,
  type ProposalHunkId,
  type ProposalId,
  type ProposalStatus,
  type ProposalSummary,
} from "$lib/features/assistant/types/proposal";

// I5: the one proposal queue. In-memory by contract (R4/I8) — no persistence
// port, no hydration reactor, nothing survives a restart. Read paths are real
// because they are the frozen shape AU-031/AU-032a build against; every
// mutator is AU-030's to implement.
export class AssistantProposalStore {
  proposals = $state<Proposal[]>([]);

  // No injectable clock, deliberately (D2-3). `add`/`add_many` take fully
  // formed Proposals whose `created_at` the producer supplies, so nothing here
  // would ever call it — this store is `hydrate`-shaped, not `create`-shaped.
  // Shipping a constructor param with no consumer is the `detached_ids`
  // mistake from W0; the producer owns its own clock.

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

  // No dedup by id — a producer always hands fresh ids, and this store
  // preserves them verbatim rather than reconciling (hydrate-shaped, not
  // create-shaped: see the constructor comment).
  add(proposal: Proposal): void {
    this.proposals = [...this.proposals, proposal];
  }

  // An agent turn produces a whole batch at once (R7); adding them one at a
  // time would let the review center render a half-arrived turn.
  add_many(proposals: Proposal[]): void {
    if (proposals.length === 0) return;
    this.proposals = [...this.proposals, ...proposals];
  }

  // Raw setter, no transition validation — the apply service owns which
  // transitions are meaningful.
  set_status(id: ProposalId, status: ProposalStatus): void {
    this.patch(id, (proposal) => ({ ...proposal, status }));
  }

  set_hunk_selected(
    id: ProposalId,
    hunk_id: ProposalHunkId,
    selected: boolean,
  ): void {
    this.patch(id, (proposal) => {
      if (proposal.status !== "pending") return null;
      const hunk_index = proposal.hunks.findIndex(
        (hunk) => hunk.id === hunk_id,
      );
      const target = proposal.hunks[hunk_index];
      if (!target) return null;

      const hunks = [...proposal.hunks];
      hunks[hunk_index] = { ...target, selected };
      return { ...proposal, hunks };
    });
  }

  set_all_hunks_selected(id: ProposalId, selected: boolean): void {
    this.patch(id, (proposal) => {
      if (proposal.status !== "pending") return null;
      return {
        ...proposal,
        hunks: proposal.hunks.map((hunk) => ({ ...hunk, selected })),
      };
    });
  }

  remove(id: ProposalId): void {
    this.proposals = this.proposals.filter((proposal) => proposal.id !== id);
  }

  clear(): void {
    this.proposals = [];
  }

  // A transform returning null means "no change" (unknown id, or a
  // selection edit on a non-pending proposal) and must not touch the array.
  private patch(
    id: ProposalId,
    transform: (proposal: Proposal) => Proposal | null,
  ): void {
    const index = this.proposals.findIndex((proposal) => proposal.id === id);
    const current = this.proposals[index];
    if (!current) return;

    const next = transform(current);
    if (!next) return;

    const proposals = [...this.proposals];
    proposals[index] = next;
    this.proposals = proposals;
  }
}
