import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import type { GitDiff } from "$lib/features/git";
import { proposal_path } from "$lib/features/assistant";
import type { Proposal, ProposalOrigin } from "$lib/features/assistant";
import {
  build_turn_proposals,
  triage_turn_diff,
  type AgentTurnProposalInput,
} from "$lib/features/assistant/domain/agent_turn_proposals";

const log = create_logger("agent_proposal_service");

// The write layer reports a losing mtime comparison as `conflict:mtime_mismatch`
// and a vanished file as `conflict:file_missing`; both mean the same thing here.
const CONFLICT_PREFIX = "conflict:";

const STALE_ERROR =
  "the note changed on disk after the checkpoint; left as it is";

type RestoreOutcome =
  | { status: "restored"; content: string }
  | { status: "stale" }
  | { status: "failed" };

// Narrow structural dependencies rather than the concrete services, following
// AgentCheckpointGit's precedent in agent_runner.ts.
export type AgentProposalGit = {
  get_working_diff(
    file_path: string | null,
    base_ref?: string | null,
  ): Promise<GitDiff>;
  get_file_at_commit(file_path: string, commit_hash: string): Promise<string>;
};

export type AgentProposalNotes = {
  // expected_mtime is the whole staleness guard: the write is refused, and
  // throws, when the note on disk is no longer the one the mtime was read from.
  write_note(
    note_path: string,
    content: string,
    expected_mtime?: number,
  ): Promise<void>;
};

export type AgentProposalQueue = {
  add_many(proposals: Proposal[]): void;
};

export type AgentTurnProposalRequest = {
  anchor: string | null;
  origin: ProposalOrigin;
  touched_paths: readonly string[];
  // Read from disk at the agent's last successful write to each path, keyed by
  // vault-relative path. A path with no entry rolls back unguarded, so this is
  // required rather than optional — omitting it is the defect this exists to
  // close, and an optional field invites omitting it again.
  expected_mtimes: Readonly<Record<string, number>>;
};

export type AgentTurnProposalReport = {
  status: "produced" | "no_anchor";
  proposed: string[];
  reverted_deletions: string[];
  kept_creations: string[];
  skipped_non_note: string[];
  skipped_binary: string[];
  failed: { note_path: string; error: string }[];
};

export interface AgentTurnProposalProducer {
  produce(request: AgentTurnProposalRequest): Promise<AgentTurnProposalReport>;
}

// R7: an agent turn's writes become reviewable proposals instead of silent
// on-disk changes.
//
// The turn's edits are rolled BACK to the checkpoint here and carried forward
// as pending proposals, rather than being left on disk for a later Reject to
// undo. That direction is forced by the frozen contract: apply_proposal_hunks
// splices the new side over the OLD side's line span, so accepting a proposal
// requires the note to still be at its pre-turn content. Leaving the writes in
// place makes every proposal either instantly stale or, worse, splices new
// content at pre-turn offsets over a note that has already moved.
//
// Consequence, accepted by the user when this was escalated: a follow-up turn
// in the same session re-reads notes WITHOUT its own prior-turn edits until
// the user accepts them. Read-after-write within a single turn is unaffected —
// rollback runs after the run's outcome resolves, never during it.
export class AgentProposalService implements AgentTurnProposalProducer {
  constructor(
    private readonly git: AgentProposalGit,
    private readonly notes: AgentProposalNotes,
    private readonly queue: AgentProposalQueue,
    private readonly now_ms: () => number,
  ) {}

  async produce(
    request: AgentTurnProposalRequest,
  ): Promise<AgentTurnProposalReport> {
    const report: AgentTurnProposalReport = {
      status: "produced",
      proposed: [],
      reverted_deletions: [],
      kept_creations: [],
      skipped_non_note: [],
      skipped_binary: [],
      failed: [],
    };

    // Named I5 carve-out. Without an anchor there is no pre-turn content to
    // diff against or restore from, so the turn's writes stay on disk
    // unreviewed. Two ways to get here, both legitimate: a vault that is not a
    // git repo at all (`no_repo` — refusing the turn instead would make agent
    // mode unusable in every non-git vault, D2-2), and an unborn branch, where
    // the checkpoint was skipped because no commit exists yet.
    if (!request.anchor) return { ...report, status: "no_anchor" };

    const diff = await this.git.get_working_diff(null, request.anchor);
    const triage = triage_turn_diff(diff.hunks, request.touched_paths);
    report.skipped_non_note = triage.skipped_non_note;
    report.skipped_binary = triage.skipped_binary;

    // R-4: the contract carries note content at a revision and cannot express
    // a file ceasing to exist, so a deletion is restored from the checkpoint
    // and never enters the queue. Restoring rather than keeping is the
    // loss-free direction — a restored note is trivially re-deleted, whereas a
    // deletion the user never approved is git archaeology.
    for (const note_path of triage.deleted_paths) {
      const restored = await this.restore_to_anchor(
        note_path,
        request.anchor,
        request.expected_mtimes[note_path],
      );
      if (restored.status !== "restored") {
        report.failed.push({
          note_path,
          error:
            restored.status === "stale"
              ? STALE_ERROR
              : "could not restore deleted note from the checkpoint",
        });
        continue;
      }
      report.reverted_deletions.push(note_path);
    }

    // A creation cannot enter the queue for the same reason, and unlike a
    // deletion it CANNOT be rolled back loss-free: the new note exists in no
    // commit, so deleting it would destroy content with no way back. It is
    // therefore left on disk and reported. This is the third named carve-out.
    report.kept_creations = triage.created_paths;

    const inputs: AgentTurnProposalInput[] = [];
    for (const file of triage.modified) {
      const restored = await this.restore_to_anchor(
        file.note_path,
        request.anchor,
        request.expected_mtimes[file.note_path],
      );
      // Fail closed per note: proposing a note we could not roll back would
      // reintroduce exactly the corruption this design exists to prevent.
      if (restored.status !== "restored") {
        report.failed.push({
          note_path: file.note_path,
          error:
            restored.status === "stale"
              ? STALE_ERROR
              : "could not roll the note back to the checkpoint",
        });
        continue;
      }
      inputs.push({ file, base_content: restored.content });
    }

    const proposals = build_turn_proposals(
      inputs,
      request.origin,
      this.now_ms(),
    );
    // One add_many for the whole turn — the store's contract is that a
    // half-arrived turn must never render.
    this.queue.add_many(proposals);
    report.proposed = proposals.map((proposal) =>
      proposal_path(proposal.target),
    );

    return report;
  }

  // Carries back the content written, which is also the content the caller
  // hashes into base_revision — one read, no second read to disagree with.
  // "stale" is separated from "failed" because it is not an error: the note
  // moved under us and leaving it alone is the correct outcome, not a
  // degradation of one.
  private async restore_to_anchor(
    note_path: string,
    anchor: string,
    expected_mtime: number | undefined,
  ): Promise<RestoreOutcome> {
    let content: string;
    try {
      content = await this.git.get_file_at_commit(note_path, anchor);
    } catch (err) {
      log.warn("Could not read the note at the turn checkpoint", {
        note_path,
        error: error_message(err),
      });
      return { status: "failed" };
    }

    try {
      await this.notes.write_note(note_path, content, expected_mtime);
    } catch (err) {
      const message = error_message(err);
      if (message.startsWith(CONFLICT_PREFIX)) {
        log.info("Left a note that changed during the turn as it is on disk", {
          note_path,
        });
        return { status: "stale" };
      }
      log.warn("Could not restore note to the turn checkpoint", {
        note_path,
        error: message,
      });
      return { status: "failed" };
    }
    return { status: "restored", content };
  }
}
