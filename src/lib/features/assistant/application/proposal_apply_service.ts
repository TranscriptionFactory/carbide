import { error_message } from "$lib/shared/utils/error_message";
import { apply_proposal_hunks } from "$lib/features/assistant/domain/apply_proposal_hunks";
import { is_stale } from "$lib/features/assistant/domain/note_revision";
import type { AssistantProposalStore } from "$lib/features/assistant/state/assistant_proposal_store.svelte";
import type {
  AssistantDocumentPort,
  ProposalCheckpointOutcome,
  ProposalCheckpointPort,
  ProposalNotePort,
} from "$lib/features/assistant/ports";
import type { ProposalId } from "$lib/features/assistant/types/proposal";

// Every id lands in exactly one bucket, so a caller can report honestly
// without re-deriving anything. `stale` is separate from `failed` because it
// is not an error: the note moved, the user decides what happens next.
export type ProposalApplyOutcome = {
  applied: ProposalId[];
  stale: ProposalId[];
  failed: { id: ProposalId; error: string }[];
  // The notes whose bytes on disk actually changed. `applied` is a wider set:
  // it includes document targets, which stage into a buffer, and vacuous
  // applies, which write nothing. A caller reconciling the editor with disk
  // needs the narrow set — reloading a buffer that did not change costs the
  // user their cursor for no reason.
  written_note_paths: string[];
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
  documents: AssistantDocumentPort;
};

export class ProposalApplyService {
  constructor(private readonly deps: ProposalApplyDeps) {}

  // ONE checkpoint per batch (R4) — not one per proposal and not one per
  // hunk. The batch is the undo unit the user reasons about, and the C2
  // anchor ("3 hunks accepted → one checkpoint commit") is exactly this.
  // Staleness is checked here, per proposal, immediately before its write.
  //
  // Two passes: first resolve every id into stale / vacuous-applied /
  // pending-write / failed without touching a note, so the checkpoint (taken
  // once, only if a write is actually pending) can gate on the outcome of
  // the whole batch rather than being attempted speculatively. A checkpoint
  // that resolves "failed" (D2-2) fails the batch closed: nothing is
  // written. "unavailable" (no git repo) proceeds — refusing would make
  // proposals unusable in every non-git vault — but the outcome rides along
  // so no caller can claim an undo that does not exist.
  async apply_batch(ids: ProposalId[]): Promise<ProposalApplyOutcome> {
    const applied: ProposalId[] = [];
    const stale: ProposalId[] = [];
    const failed: { id: ProposalId; error: string }[] = [];
    const written_note_paths: string[] = [];
    const to_write: { id: ProposalId; note_path: string; content: string }[] =
      [];
    // Document targets STAGE into the open buffer (edited content + dirty
    // tab) — save-the-tab is what writes disk. The checkpoint is a DISK undo
    // unit, so it gates on pending note writes alone: a document-only batch
    // takes none, a mixed batch takes exactly one.
    const to_stage: { id: ProposalId; file_path: string; content: string }[] =
      [];

    for (const id of ids) {
      const proposal = this.deps.proposals.get(id);
      if (!proposal || proposal.status !== "pending") {
        failed.push({
          id,
          error: proposal
            ? `proposal is ${proposal.status}, not pending`
            : "proposal not found",
        });
        continue;
      }

      if (proposal.target.kind === "document") {
        // A closed tab is stale, not failed — mirroring the deleted-note
        // rule: the buffer the proposal was computed against is gone.
        const document = this.deps.documents.read_document(
          proposal.target.file_path,
        );
        if (
          document === null ||
          is_stale(proposal.base_revision, document.content)
        ) {
          stale.push(id);
          continue;
        }
        const next = apply_proposal_hunks(document.content, proposal.hunks);
        if (next === document.content) {
          applied.push(id);
          continue;
        }
        to_stage.push({
          id,
          file_path: proposal.target.file_path,
          content: next,
        });
        continue;
      }

      const current_content = await this.deps.notes.read_note(
        proposal.target.note_path,
      );
      if (
        current_content === null ||
        is_stale(proposal.base_revision, current_content)
      ) {
        stale.push(id);
        continue;
      }

      const next_content = apply_proposal_hunks(
        current_content,
        proposal.hunks,
      );
      if (next_content === current_content) {
        applied.push(id);
        continue;
      }

      to_write.push({
        id,
        note_path: proposal.target.note_path,
        content: next_content,
      });
    }

    for (const id of stale) this.deps.proposals.set_status(id, "stale");
    for (const id of applied) this.deps.proposals.set_status(id, "applied");

    let checkpoint: ProposalApplyOutcome["checkpoint"] = null;

    if (to_write.length > 0) {
      const description = `before applying ${String(to_write.length)} proposal${
        to_write.length === 1 ? "" : "s"
      }`;
      const outcome = await this.deps.git.create_checkpoint(description);
      checkpoint = { description, outcome };

      if (outcome === "failed") {
        // Fails the WHOLE batch closed, stagings included — a mixed batch is
        // one undo unit and must not half-apply.
        for (const entry of [...to_write, ...to_stage]) {
          failed.push({
            id: entry.id,
            error: "checkpoint failed; nothing applied",
          });
        }
      } else {
        for (const write of to_write) {
          try {
            await this.deps.notes.write_note(write.note_path, write.content);
            this.deps.proposals.set_status(write.id, "applied");
            applied.push(write.id);
            written_note_paths.push(write.note_path);
          } catch (err) {
            failed.push({ id: write.id, error: error_message(err) });
          }
        }
      }
    }

    if (checkpoint?.outcome !== "failed") {
      for (const stage of to_stage) {
        const staged = this.deps.documents.stage_document(
          stage.file_path,
          stage.content,
        );
        if (staged) {
          this.deps.proposals.set_status(stage.id, "applied");
          applied.push(stage.id);
        } else {
          failed.push({
            id: stage.id,
            error: "could not stage the document buffer",
          });
        }
      }
    }

    return { applied, stale, failed, checkpoint, written_note_paths };
  }

  // Rejection touches no note and takes no checkpoint — a rejected proposal
  // was never applied. A stale proposal is exactly the kind of thing a user
  // dismisses without applying, so it rejects too; an already-applied or
  // already-rejected id is a no-op (there is nothing to undo via reject).
  // (R7's safe-mode Reject, which restores a pre-turn checkpoint, is a
  // different operation and belongs to AU-032b-T.)
  reject_batch(ids: ProposalId[]): Promise<void> {
    for (const id of ids) {
      const proposal = this.deps.proposals.get(id);
      if (!proposal) continue;
      if (proposal.status !== "pending" && proposal.status !== "stale") {
        continue;
      }
      this.deps.proposals.set_status(id, "rejected");
    }
    return Promise.resolve();
  }
}
