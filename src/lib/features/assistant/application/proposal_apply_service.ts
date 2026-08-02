import type { AssistantProposalStore } from "$lib/features/assistant/state/assistant_proposal_store.svelte";
import type {
  ProposalCheckpointOutcome,
  ProposalCheckpointPort,
  ProposalNotePort,
} from "$lib/features/assistant/ports";
import type { ProposalId } from "$lib/features/assistant/types/proposal";

const NOT_IMPLEMENTED = "NOT_IMPLEMENTED: AU-030 implements the apply service";

// Every id lands in exactly one bucket, so a caller can report honestly
// without re-deriving anything. `stale` is separate from `failed` because it
// is not an error: the note moved, the user decides what happens next.
export type ProposalApplyOutcome = {
  applied: ProposalId[];
  stale: ProposalId[];
  failed: { id: ProposalId; error: string }[];
  // Null when no checkpoint was ATTEMPTED — a batch that changes nothing takes
  // none, so the git log does not fill with empty checkpoints. When a
  // checkpoint was attempted, the outcome rides along: a caller must be able to
  // tell "applied, undo available" from "applied in a vault with no git", and
  // only the port can answer that (D2-2).
  checkpoint: {
    description: string;
    outcome: ProposalCheckpointOutcome;
  } | null;
};

export type ProposalApplyDeps = {
  proposals: AssistantProposalStore;
  notes: ProposalNotePort;
  git: ProposalCheckpointPort;
};

export class ProposalApplyService {
  constructor(private readonly deps: ProposalApplyDeps) {}

  // ONE checkpoint per batch (R4) — not one per proposal and not one per
  // hunk. The batch is the undo unit the user reasons about, and the C2
  // anchor ("3 hunks accepted → one checkpoint commit") is exactly this.
  // Staleness is checked here, per proposal, immediately before its write.
  apply_batch(_ids: ProposalId[]): Promise<ProposalApplyOutcome> {
    throw new Error(NOT_IMPLEMENTED);
  }

  // Rejection touches no note and takes no checkpoint — a rejected proposal
  // was never applied. (R7's safe-mode Reject, which restores a pre-turn
  // checkpoint, is a different operation and belongs to AU-032b-T.)
  reject_batch(_ids: ProposalId[]): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
