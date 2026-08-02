import { describe, expect, it, vi } from "vitest";
import { AgentProposalService } from "$lib/features/rag/application/agent_proposal_service";
import { AssistantProposalStore } from "$lib/features/assistant";
import { compute_note_revision } from "$lib/features/assistant";
import type { GitDiff } from "$lib/features/git";
import type {
  GitDiffHunk,
  GitDiffLine,
} from "$lib/features/rag/domain/agent_turn_proposals";
import type { ProposalOrigin } from "$lib/features/assistant";

const origin: ProposalOrigin = { session_id: "session-1", run_id: "run-1" };

function line(
  type: GitDiffLine["type"],
  content: string,
  old_line: number | null,
  new_line: number | null,
): GitDiffLine {
  return { type, content, old_line, new_line };
}

function hunk(
  file_path: string,
  header: string,
  lines: GitDiffLine[],
): GitDiffHunk {
  return { file_path, header, lines };
}

function diff(hunks: GitDiffHunk[]): GitDiff {
  return { additions: 0, deletions: 0, hunks };
}

function edit_hunk(file_path: string): GitDiffHunk {
  return hunk(file_path, "@@ -1,2 +1,2 @@", [
    line("deletion", "before\n", 1, null),
    line("addition", "after\n", null, 1),
    line("context", "tail\n", 2, 2),
  ]);
}

function creation_hunk(file_path: string): GitDiffHunk {
  return hunk(file_path, "@@ -0,0 +1,1 @@", [
    line("addition", "brand new\n", null, 1),
  ]);
}

function deletion_hunk(file_path: string): GitDiffHunk {
  return hunk(file_path, "@@ -1,1 +0,0 @@", [
    line("deletion", "was here\n", 1, null),
  ]);
}

type Harness = ReturnType<typeof create_harness>;

// An in-memory vault with a commit history, so rollback can be asserted
// against real content rather than against call arguments.
function create_harness(options?: {
  commits?: Record<string, Record<string, string>>;
  disk?: Record<string, string>;
  diffs?: Record<string, GitDiff>;
}) {
  const commits = new Map<string, Map<string, string>>(
    Object.entries(options?.commits ?? {}).map(([sha, files]) => [
      sha,
      new Map(Object.entries(files)),
    ]),
  );
  const disk = new Map(Object.entries(options?.disk ?? {}));
  const diffs: Record<string, GitDiff> = { ...options?.diffs };
  const writes: string[] = [];

  const get_working_diff = vi.fn(
    (_file_path: string | null, base_ref?: string | null) =>
      Promise.resolve(diffs[base_ref ?? "HEAD"] ?? diff([])),
  );

  const git = {
    get_working_diff,
    get_file_at_commit: vi.fn((file_path: string, commit_hash: string) => {
      const content = commits.get(commit_hash)?.get(file_path);
      if (content === undefined) {
        return Promise.reject(new Error("file not found at commit"));
      }
      return Promise.resolve(content);
    }),
  };

  const notes = {
    write_note: vi.fn((note_path: string, content: string) => {
      writes.push(note_path);
      disk.set(note_path, content);
      return Promise.resolve();
    }),
  };

  const queue = new AssistantProposalStore();
  const add_many = vi.spyOn(queue, "add_many");
  const service = new AgentProposalService(git, notes, queue, () => 1700);

  return {
    service,
    git,
    notes,
    queue,
    add_many,
    disk,
    commits,
    diffs,
    writes,
  };
}

function content_at(harness: Harness, sha: string, path: string) {
  return harness.commits.get(sha)?.get(path);
}

describe("AgentProposalService.produce", () => {
  const anchor = "checkpoint-sha";

  function modified_harness() {
    return create_harness({
      commits: { [anchor]: { "note.md": "before\ntail\n" } },
      disk: { "note.md": "after\ntail\n" },
      diffs: { [anchor]: diff([edit_hunk("note.md")]) },
    });
  }

  it("rolls the note back to the checkpoint and queues a pending proposal", async () => {
    const h = modified_harness();

    const report = await h.service.produce({
      anchor,
      origin,
      touched_paths: ["note.md"],
    });

    expect(report.status).toBe("produced");
    expect(report.proposed).toEqual(["note.md"]);
    expect(h.disk.get("note.md")).toBe("before\ntail\n");
    expect(h.queue.pending).toHaveLength(1);
    expect(h.queue.pending[0]?.note_path).toBe("note.md");
  });

  // R-5b's runtime assertion. No grep can state this; only the behaviour can.
  it("leaves every proposed note byte-identical to its checkpoint content", async () => {
    const h = create_harness({
      commits: {
        [anchor]: { "a.md": "before\ntail\n", "b.md": "before\ntail\n" },
      },
      disk: { "a.md": "after\ntail\n", "b.md": "after\ntail\n" },
      diffs: { [anchor]: diff([edit_hunk("a.md"), edit_hunk("b.md")]) },
    });

    const report = await h.service.produce({
      anchor,
      origin,
      touched_paths: ["a.md", "b.md"],
    });

    expect(report.proposed).toEqual(["a.md", "b.md"]);
    for (const note_path of report.proposed) {
      expect(h.disk.get(note_path)).toBe(content_at(h, anchor, note_path));
    }
  });

  it("derives base_revision from the restored content", async () => {
    const h = modified_harness();

    await h.service.produce({ anchor, origin, touched_paths: ["note.md"] });

    expect(h.queue.pending[0]?.base_revision).toBe(
      compute_note_revision("before\ntail\n"),
    );
  });

  // F3 / scenario 10. A HEAD-anchored diff would read a different (empty)
  // diff here and produce nothing; passing the checkpoint sha is what makes
  // a mid-turn autocommit harmless.
  it("anchors the diff to the checkpoint sha rather than to HEAD", async () => {
    const h = create_harness({
      commits: { [anchor]: { "note.md": "before\ntail\n" } },
      disk: { "note.md": "after\ntail\n" },
      diffs: {
        [anchor]: diff([edit_hunk("note.md")]),
        HEAD: diff([]),
      },
    });

    const report = await h.service.produce({
      anchor,
      origin,
      touched_paths: ["note.md"],
    });

    expect(h.git.get_working_diff).toHaveBeenCalledWith(null, anchor);
    expect(report.proposed).toEqual(["note.md"]);
  });

  it("adds a whole turn's proposals in a single batch", async () => {
    const h = create_harness({
      commits: {
        [anchor]: { "a.md": "before\ntail\n", "b.md": "before\ntail\n" },
      },
      disk: { "a.md": "after\ntail\n", "b.md": "after\ntail\n" },
      diffs: { [anchor]: diff([edit_hunk("a.md"), edit_hunk("b.md")]) },
    });

    await h.service.produce({
      anchor,
      origin,
      touched_paths: ["a.md", "b.md"],
    });

    expect(h.add_many).toHaveBeenCalledTimes(1);
    expect(h.add_many.mock.calls[0]?.[0]).toHaveLength(2);
  });

  describe("carve-outs", () => {
    // I5 carve-out 1: a vault that is not a git repo has no checkpoint, so an
    // agent turn's writes stay on disk unreviewed. Refusing the turn instead
    // would make agent mode unusable in every non-git vault (D2-2).
    it("produces nothing and touches no note when there is no anchor", async () => {
      const h = create_harness({ disk: { "note.md": "after\ntail\n" } });

      const report = await h.service.produce({
        anchor: null,
        origin,
        touched_paths: ["note.md"],
      });

      expect(report.status).toBe("no_anchor");
      expect(report.proposed).toEqual([]);
      expect(h.git.get_working_diff).not.toHaveBeenCalled();
      expect(h.notes.write_note).not.toHaveBeenCalled();
      expect(h.disk.get("note.md")).toBe("after\ntail\n");
      expect(h.queue.proposals).toHaveLength(0);
    });

    // I5 carve-out 2: an unborn branch reaches the same branch with a null
    // sha — there is no commit to diff against or restore from.
    it("treats an unborn-branch checkpoint the same as no repository", async () => {
      const h = create_harness({ disk: { "note.md": "after\ntail\n" } });

      const report = await h.service.produce({
        anchor: null,
        origin,
        touched_paths: ["note.md"],
      });

      expect(report.status).toBe("no_anchor");
      expect(h.disk.get("note.md")).toBe("after\ntail\n");
    });

    // R-4: the frozen contract has no representation for a file ceasing to
    // exist, so a deletion is restored and never enters the queue.
    it("restores a deleted note, does not propose it, and reports it", async () => {
      const h = create_harness({
        commits: { [anchor]: { "gone.md": "was here\n" } },
        disk: {},
        diffs: { [anchor]: diff([deletion_hunk("gone.md")]) },
      });

      const report = await h.service.produce({
        anchor,
        origin,
        touched_paths: ["gone.md"],
      });

      expect(report.reverted_deletions).toEqual(["gone.md"]);
      expect(report.proposed).toEqual([]);
      expect(h.disk.get("gone.md")).toBe("was here\n");
      expect(h.queue.proposals).toHaveLength(0);
    });

    // Carve-out 3: a creation exists in no commit, so deleting it would
    // destroy content with no way back. It is kept and reported instead.
    it("keeps a created note on disk, does not propose it, and reports it", async () => {
      const h = create_harness({
        commits: { [anchor]: {} },
        disk: { "new.md": "brand new\n" },
        diffs: { [anchor]: diff([creation_hunk("new.md")]) },
      });

      const report = await h.service.produce({
        anchor,
        origin,
        touched_paths: ["new.md"],
      });

      expect(report.kept_creations).toEqual(["new.md"]);
      expect(report.proposed).toEqual([]);
      expect(h.disk.get("new.md")).toBe("brand new\n");
      expect(h.notes.write_note).not.toHaveBeenCalled();
    });

    // A rename arrives as two deltas and therefore splits across two
    // carve-outs: the new path is kept, the old path is restored.
    it("keeps the new half of a rename and restores the old half", async () => {
      const h = create_harness({
        commits: { [anchor]: { "old.md": "body\n" } },
        disk: { "new.md": "body\n" },
        diffs: {
          [anchor]: diff([deletion_hunk("old.md"), creation_hunk("new.md")]),
        },
      });

      const report = await h.service.produce({
        anchor,
        origin,
        touched_paths: ["old.md", "new.md"],
      });

      expect(report.reverted_deletions).toEqual(["old.md"]);
      expect(report.kept_creations).toEqual(["new.md"]);
      expect(h.disk.get("old.md")).toBe("body\n");
      expect(h.disk.get("new.md")).toBe("body\n");
    });

    it("reports non-note writes and leaves them on disk", async () => {
      const h = create_harness({
        commits: { [anchor]: { "data.json": "{}\n" } },
        disk: { "data.json": "{ changed: true }\n" },
        diffs: { [anchor]: diff([edit_hunk("data.json")]) },
      });

      const report = await h.service.produce({
        anchor,
        origin,
        touched_paths: ["data.json"],
      });

      expect(report.skipped_non_note).toEqual(["data.json"]);
      expect(report.proposed).toEqual([]);
      expect(h.disk.get("data.json")).toBe("{ changed: true }\n");
    });

    it("reports a hunk with no usable lines instead of proposing it", async () => {
      const h = create_harness({
        commits: { [anchor]: { "opaque.md": "x" } },
        disk: { "opaque.md": "y" },
        diffs: { [anchor]: diff([hunk("opaque.md", "[Binary file]", [])]) },
      });

      const report = await h.service.produce({
        anchor,
        origin,
        touched_paths: ["opaque.md"],
      });

      expect(report.skipped_binary).toEqual(["opaque.md"]);
      expect(report.proposed).toEqual([]);
    });
  });

  describe("safety", () => {
    // I-i. The checkpoint stages everything, so the diff also contains notes
    // the user edited during the turn. Rolling those back would eat their
    // work. Removing the touched-paths filter must fail this test.
    it("never rolls back a note the agent's transcript did not touch", async () => {
      const h = create_harness({
        commits: {
          [anchor]: {
            "agent.md": "before\ntail\n",
            "user.md": "before\ntail\n",
          },
        },
        disk: {
          "agent.md": "after\ntail\n",
          "user.md": "user was typing\n",
        },
        diffs: {
          [anchor]: diff([edit_hunk("agent.md"), edit_hunk("user.md")]),
        },
      });

      const report = await h.service.produce({
        anchor,
        origin,
        touched_paths: ["agent.md"],
      });

      expect(report.proposed).toEqual(["agent.md"]);
      expect(h.disk.get("user.md")).toBe("user was typing\n");
      expect(h.notes.write_note).toHaveBeenCalledTimes(1);
    });

    // Proposing a note we could not roll back would leave the agent's content
    // on disk AND queue hunks computed against the pre-turn offsets — exactly
    // the corruption the rollback model exists to prevent.
    it("fails closed for a note it could not roll back", async () => {
      const h = create_harness({
        commits: { [anchor]: { "ok.md": "before\ntail\n" } },
        disk: { "ok.md": "after\ntail\n", "lost.md": "after\ntail\n" },
        diffs: {
          [anchor]: diff([edit_hunk("ok.md"), edit_hunk("lost.md")]),
        },
      });

      const report = await h.service.produce({
        anchor,
        origin,
        touched_paths: ["ok.md", "lost.md"],
      });

      expect(report.proposed).toEqual(["ok.md"]);
      expect(report.failed.map((f) => f.note_path)).toEqual(["lost.md"]);
      expect(h.queue.proposals).toHaveLength(1);
    });

    it("reports a deletion it could not restore instead of dropping it", async () => {
      const h = create_harness({
        commits: { [anchor]: {} },
        disk: {},
        diffs: { [anchor]: diff([deletion_hunk("gone.md")]) },
      });

      const report = await h.service.produce({
        anchor,
        origin,
        touched_paths: ["gone.md"],
      });

      expect(report.reverted_deletions).toEqual([]);
      expect(report.failed.map((f) => f.note_path)).toEqual(["gone.md"]);
    });

    it("produces nothing when the diff is empty", async () => {
      const h = create_harness({
        commits: { [anchor]: { "note.md": "before\ntail\n" } },
        disk: { "note.md": "before\ntail\n" },
        diffs: { [anchor]: diff([]) },
      });

      const report = await h.service.produce({
        anchor,
        origin,
        touched_paths: ["note.md"],
      });

      expect(report.proposed).toEqual([]);
      expect(h.notes.write_note).not.toHaveBeenCalled();
    });
  });

  // Scenario 21 and the user-accepted cross-turn consequence: because turn 1
  // rolled its note back, turn 2 starts from the pre-turn content and cannot
  // double-count turn 1's edit. The agent does NOT see its own prior-turn
  // work until the user accepts it.
  describe("across two turns in one session", () => {
    it("starts the second turn from the rolled-back content", async () => {
      const first = "checkpoint-1";
      const h = create_harness({
        commits: { [first]: { "note.md": "before\ntail\n" } },
        disk: { "note.md": "after\ntail\n" },
        diffs: { [first]: diff([edit_hunk("note.md")]) },
      });

      await h.service.produce({
        anchor: first,
        origin,
        touched_paths: ["note.md"],
      });

      // The agent's own edit is gone from disk; a second turn reads this.
      expect(h.disk.get("note.md")).toBe("before\ntail\n");

      const second = "checkpoint-2";
      h.commits.set(second, new Map([["note.md", "before\ntail\n"]]));
      h.disk.set("note.md", "second turn\ntail\n");
      h.diffs[second] = diff([edit_hunk("note.md")]);

      const report = await h.service.produce({
        anchor: second,
        origin: { session_id: "session-1", run_id: "run-2" },
        touched_paths: ["note.md"],
      });

      expect(report.proposed).toEqual(["note.md"]);
      expect(h.queue.proposals).toHaveLength(2);
      expect(h.queue.proposals[0]?.id).not.toBe(h.queue.proposals[1]?.id);
      expect(h.disk.get("note.md")).toBe("before\ntail\n");
    });
  });
});
