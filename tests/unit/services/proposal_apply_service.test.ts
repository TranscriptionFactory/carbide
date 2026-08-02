import { describe, expect, it, vi } from "vitest";
import {
  AssistantProposalStore,
  ProposalApplyService,
  compute_note_revision,
  type ProposalCheckpointOutcome,
} from "$lib/features/assistant";
import type { Proposal } from "$lib/features/assistant";
import {
  make_proposal,
  make_proposal_hunk,
  make_proposal_line,
} from "../helpers/assistant_proposal_fixtures";

function replace_line_hunk(
  id: string,
  old_line: number,
  old_content: string,
  new_content: string,
) {
  return make_proposal_hunk({
    id,
    selected: true,
    lines: [
      make_proposal_line({
        kind: "del",
        content: old_content,
        old_line,
        new_line: null,
      }),
      make_proposal_line({
        kind: "add",
        content: new_content,
        old_line: null,
        new_line: old_line,
      }),
    ],
  });
}

function make_harness(outcome: ProposalCheckpointOutcome = "created") {
  const proposals = new AssistantProposalStore();
  const notes = {
    read_note: vi.fn<(note_path: string) => Promise<string | null>>(),
    write_note: vi.fn<(note_path: string, content: string) => Promise<void>>(
      () => Promise.resolve(),
    ),
  };
  const git = {
    create_checkpoint: vi.fn<
      (description: string) => Promise<ProposalCheckpointOutcome>
    >(() => Promise.resolve(outcome)),
  };
  const service = new ProposalApplyService({ proposals, notes, git });
  return { proposals, notes, git, service };
}

function pending(content: string, overrides: Partial<Proposal> = {}) {
  return make_proposal({
    status: "pending",
    base_revision: compute_note_revision(content),
    ...overrides,
  });
}

describe("ProposalApplyService.apply_batch", () => {
  it("returns an empty outcome and touches no port for an empty id list", async () => {
    const { service, notes, git } = make_harness();

    const outcome = await service.apply_batch([]);

    expect(outcome).toEqual({
      applied: [],
      stale: [],
      failed: [],
      checkpoint: null,
    });
    expect(notes.read_note).not.toHaveBeenCalled();
    expect(git.create_checkpoint).not.toHaveBeenCalled();
  });

  it("applies a single selected hunk, writes the note and takes one checkpoint", async () => {
    const { proposals, notes, git, service } = make_harness();
    const content = "alpha\nbeta\ngamma";
    const proposal = pending(content, {
      note_path: "note.md",
      hunks: [replace_line_hunk("h1", 2, "beta", "BETA")],
    });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(content);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.applied).toEqual([proposal.id]);
    expect(outcome.stale).toEqual([]);
    expect(outcome.failed).toEqual([]);
    expect(notes.write_note).toHaveBeenCalledExactlyOnceWith(
      "note.md",
      "alpha\nBETA\ngamma",
    );
    expect(git.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(proposals.get(proposal.id)?.status).toBe("applied");
    expect(outcome.checkpoint).toEqual({
      description: "before applying 1 proposal",
      outcome: "created",
    });
  });

  it("takes exactly one checkpoint for a single proposal with 3 selected hunks", async () => {
    const { proposals, notes, git, service } = make_harness();
    const content = "one\ntwo\nthree\nfour\nfive";
    const proposal = pending(content, {
      note_path: "note.md",
      hunks: [
        replace_line_hunk("h1", 1, "one", "ONE"),
        replace_line_hunk("h2", 3, "three", "THREE"),
        replace_line_hunk("h3", 5, "five", "FIVE"),
      ],
    });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(content);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.applied).toEqual([proposal.id]);
    expect(git.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(notes.write_note).toHaveBeenCalledExactlyOnceWith(
      "note.md",
      "ONE\ntwo\nTHREE\nfour\nFIVE",
    );
  });

  it("takes exactly one checkpoint for three proposals batched together (one hunk each)", async () => {
    const { proposals, notes, git, service } = make_harness();
    const contents: Record<string, string> = {
      "a.md": "alpha",
      "b.md": "beta",
      "c.md": "gamma",
    };
    const ids: string[] = [];
    for (const [note_path, content] of Object.entries(contents)) {
      const proposal = pending(content, {
        note_path,
        hunks: [replace_line_hunk("h1", 1, content, content.toUpperCase())],
      });
      proposals.add(proposal);
      ids.push(proposal.id);
    }
    notes.read_note.mockImplementation((note_path) =>
      Promise.resolve(contents[note_path] ?? null),
    );

    const outcome = await service.apply_batch(ids);

    expect(outcome.applied).toHaveLength(3);
    expect(git.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(git.create_checkpoint).toHaveBeenCalledWith(
      "before applying 3 proposals",
    );
  });

  it("applies only the selected hunks of a partial selection, dropping the unselected hunk's change", async () => {
    const { proposals, notes, service } = make_harness();
    const content = "one\ntwo\nthree";
    const proposal = pending(content, {
      note_path: "note.md",
      hunks: [
        replace_line_hunk("h1", 1, "one", "ONE"),
        { ...replace_line_hunk("h2", 2, "two", "TWO"), selected: false },
        replace_line_hunk("h3", 3, "three", "THREE"),
      ],
    });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(content);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.applied).toEqual([proposal.id]);
    expect(notes.write_note).toHaveBeenCalledExactlyOnceWith(
      "note.md",
      "ONE\ntwo\nTHREE",
    );
    expect(proposals.get(proposal.id)?.status).toBe("applied");
  });

  it("is a vacuous success for zero selected hunks: applied, nothing written, not checkpoint-worthy", async () => {
    const { proposals, notes, git, service } = make_harness();
    const content = "alpha\nbeta";
    const proposal = pending(content, {
      note_path: "note.md",
      hunks: [
        { ...replace_line_hunk("h1", 1, "alpha", "ALPHA"), selected: false },
      ],
    });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(content);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.applied).toEqual([proposal.id]);
    expect(outcome.checkpoint).toBeNull();
    expect(notes.write_note).not.toHaveBeenCalled();
    expect(git.create_checkpoint).not.toHaveBeenCalled();
    expect(proposals.get(proposal.id)?.status).toBe("applied");
  });

  it("flags a proposal stale when the note changed after the base revision was captured", async () => {
    const { proposals, notes, git, service } = make_harness();
    const original = "alpha\nbeta";
    const edited = "alpha\nBETA-EDITED-BY-USER";
    const proposal = pending(original, {
      note_path: "note.md",
      hunks: [replace_line_hunk("h1", 2, "beta", "BETA-PROPOSED")],
    });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(edited);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.stale).toEqual([proposal.id]);
    expect(outcome.applied).toEqual([]);
    expect(notes.write_note).not.toHaveBeenCalled();
    expect(git.create_checkpoint).not.toHaveBeenCalled();
    expect(proposals.get(proposal.id)?.status).toBe("stale");
  });

  it("flags a proposal over a deleted note as stale, not failed", async () => {
    const { proposals, notes, service } = make_harness();
    const proposal = pending("alpha", { note_path: "gone.md" });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(null);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.stale).toEqual([proposal.id]);
    expect(outcome.failed).toEqual([]);
    expect(proposals.get(proposal.id)?.status).toBe("stale");
  });

  it("applies the healthy proposals of a mixed batch and still takes one checkpoint", async () => {
    const { proposals, notes, git, service } = make_harness();
    const healthy_content = "alpha\nbeta";
    const stale_original = "gamma\ndelta";
    const healthy = pending(healthy_content, {
      note_path: "healthy.md",
      hunks: [replace_line_hunk("h1", 2, "beta", "BETA")],
    });
    const stale = pending(stale_original, {
      note_path: "stale.md",
      hunks: [replace_line_hunk("h1", 1, "gamma", "GAMMA")],
    });
    proposals.add(healthy);
    proposals.add(stale);
    notes.read_note.mockImplementation((note_path) => {
      if (note_path === "healthy.md") return Promise.resolve(healthy_content);
      if (note_path === "stale.md")
        return Promise.resolve("gamma-changed\ndelta");
      return Promise.resolve(null);
    });

    const outcome = await service.apply_batch([healthy.id, stale.id]);

    expect(outcome.applied).toEqual([healthy.id]);
    expect(outcome.stale).toEqual([stale.id]);
    expect(git.create_checkpoint).toHaveBeenCalledTimes(1);
  });

  it("buckets an unknown proposal id as failed", async () => {
    const { service } = make_harness();

    const outcome = await service.apply_batch(["does-not-exist"]);

    expect(outcome.failed).toEqual([
      { id: "does-not-exist", error: "proposal not found" },
    ]);
  });

  it("buckets an already-applied id as failed rather than silently re-applying", async () => {
    const { proposals, notes, service } = make_harness();
    const proposal = make_proposal({ status: "applied" });
    proposals.add(proposal);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.failed).toEqual([
      { id: proposal.id, error: "proposal is applied, not pending" },
    ]);
    expect(notes.read_note).not.toHaveBeenCalled();
  });

  it("fails only the write that throws in a multi-proposal batch, still taking one checkpoint", async () => {
    const { proposals, notes, git, service } = make_harness();
    const content = "alpha";
    const ok = pending(content, {
      note_path: "ok.md",
      hunks: [replace_line_hunk("h1", 1, "alpha", "ALPHA")],
    });
    const breaks = pending(content, {
      note_path: "breaks.md",
      hunks: [replace_line_hunk("h1", 1, "alpha", "ALPHA")],
    });
    proposals.add(ok);
    proposals.add(breaks);
    notes.read_note.mockResolvedValue(content);
    notes.write_note.mockImplementation((note_path) => {
      if (note_path === "breaks.md")
        return Promise.reject(new Error("disk full"));
      return Promise.resolve();
    });

    const outcome = await service.apply_batch([ok.id, breaks.id]);

    expect(outcome.applied).toEqual([ok.id]);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]?.id).toBe(breaks.id);
    expect(git.create_checkpoint).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the checkpoint itself resolves failed: nothing is written", async () => {
    const { proposals, notes, service } = make_harness("failed");
    const content = "alpha";
    const proposal = pending(content, {
      note_path: "note.md",
      hunks: [replace_line_hunk("h1", 1, "alpha", "ALPHA")],
    });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(content);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.applied).toEqual([]);
    expect(outcome.failed).toEqual([
      { id: proposal.id, error: "checkpoint failed; nothing applied" },
    ]);
    expect(notes.write_note).not.toHaveBeenCalled();
    expect(outcome.checkpoint).toEqual({
      description: "before applying 1 proposal",
      outcome: "failed",
    });
    expect(proposals.get(proposal.id)?.status).toBe("pending");
  });

  it("proceeds and writes when the checkpoint is unavailable (no git repo), recording that in the outcome", async () => {
    const { proposals, notes, service } = make_harness("unavailable");
    const content = "alpha";
    const proposal = pending(content, {
      note_path: "note.md",
      hunks: [replace_line_hunk("h1", 1, "alpha", "ALPHA")],
    });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(content);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.applied).toEqual([proposal.id]);
    expect(notes.write_note).toHaveBeenCalledExactlyOnceWith(
      "note.md",
      "ALPHA",
    );
    expect(outcome.checkpoint?.outcome).toBe("unavailable");
    expect(proposals.get(proposal.id)?.status).toBe("applied");
  });

  it("proceeds and writes when the checkpoint is skipped (tree already clean)", async () => {
    const { proposals, notes, service } = make_harness("skipped");
    const content = "alpha";
    const proposal = pending(content, {
      note_path: "note.md",
      hunks: [replace_line_hunk("h1", 1, "alpha", "ALPHA")],
    });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(content);

    const outcome = await service.apply_batch([proposal.id]);

    expect(outcome.applied).toEqual([proposal.id]);
    expect(outcome.checkpoint?.outcome).toBe("skipped");
  });

  it("takes no checkpoint when nothing in the batch actually changes note bytes", async () => {
    const { git, service } = make_harness();

    const outcome = await service.apply_batch(["missing-1", "missing-2"]);

    expect(outcome.checkpoint).toBeNull();
    expect(git.create_checkpoint).not.toHaveBeenCalled();
    expect(outcome.failed).toHaveLength(2);
  });

  it("does not mutate origin, base_revision, created_at or hunk selection — only status", async () => {
    const { proposals, notes, service } = make_harness();
    const content = "alpha";
    const proposal = pending(content, {
      note_path: "note.md",
      created_at: 123,
      origin: { session_id: "s-1", run_id: null },
      hunks: [replace_line_hunk("h1", 1, "alpha", "ALPHA")],
    });
    proposals.add(proposal);
    notes.read_note.mockResolvedValue(content);

    await service.apply_batch([proposal.id]);

    const live = proposals.get(proposal.id);
    expect(live?.created_at).toBe(123);
    expect(live?.origin).toEqual({ session_id: "s-1", run_id: null });
    expect(live?.base_revision).toBe(proposal.base_revision);
    expect(live?.hunks[0]?.selected).toBe(true);
  });
});

describe("ProposalApplyService.reject_batch", () => {
  it("rejects a pending proposal and touches no note or checkpoint port", async () => {
    const { proposals, notes, git, service } = make_harness();
    const proposal = make_proposal({ status: "pending" });
    proposals.add(proposal);

    await service.reject_batch([proposal.id]);

    expect(proposals.get(proposal.id)?.status).toBe("rejected");
    expect(notes.read_note).not.toHaveBeenCalled();
    expect(notes.write_note).not.toHaveBeenCalled();
    expect(git.create_checkpoint).not.toHaveBeenCalled();
  });

  it("rejects a stale proposal", async () => {
    const { proposals, service } = make_harness();
    const proposal = make_proposal({ status: "stale" });
    proposals.add(proposal);

    await service.reject_batch([proposal.id]);

    expect(proposals.get(proposal.id)?.status).toBe("rejected");
  });

  it("is a no-op on an already-applied proposal", async () => {
    const { proposals, service } = make_harness();
    const proposal = make_proposal({ status: "applied" });
    proposals.add(proposal);

    await service.reject_batch([proposal.id]);

    expect(proposals.get(proposal.id)?.status).toBe("applied");
  });

  it("is a no-op on an already-rejected proposal", async () => {
    const { proposals, service } = make_harness();
    const proposal = make_proposal({ status: "rejected" });
    proposals.add(proposal);

    await service.reject_batch([proposal.id]);

    expect(proposals.get(proposal.id)?.status).toBe("rejected");
  });

  it("is a no-op on an unknown id", async () => {
    const { service } = make_harness();

    await expect(service.reject_batch(["missing"])).resolves.toBeUndefined();
  });

  it("is a no-op for an empty id list", async () => {
    const { service, notes, git } = make_harness();

    await service.reject_batch([]);

    expect(notes.read_note).not.toHaveBeenCalled();
    expect(git.create_checkpoint).not.toHaveBeenCalled();
  });
});
