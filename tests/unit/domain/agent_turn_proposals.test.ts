import { describe, expect, it } from "vitest";
import {
  build_turn_proposals,
  is_note_path,
  triage_turn_diff,
  type GitDiffHunk,
  type GitDiffLine,
} from "$lib/features/rag/domain/agent_turn_proposals";
import { apply_proposal_hunks } from "$lib/features/assistant/domain/apply_proposal_hunks";
import { compute_note_revision } from "$lib/features/assistant";
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

// libgit2 hands each line back with its terminator attached; the fixtures keep
// that shape so the producer is exercised against the real wire format.
function hunk(
  file_path: string,
  header: string,
  lines: GitDiffLine[],
): GitDiffHunk {
  return { file_path, header, lines };
}

function modified_note(file_path = "note.md"): GitDiffHunk {
  return hunk(file_path, "@@ -1,3 +1,3 @@", [
    line("context", "one\n", 1, 1),
    line("deletion", "two\n", 2, null),
    line("addition", "edited\n", null, 2),
    line("context", "three\n", 3, 3),
  ]);
}

describe("is_note_path", () => {
  it("accepts markdown and rejects everything else", () => {
    expect(is_note_path("notes/a.md")).toBe(true);
    expect(is_note_path("notes/a.MD")).toBe(true);
    expect(is_note_path("assets/diagram.png")).toBe(false);
    expect(is_note_path("config.json")).toBe(false);
    expect(is_note_path("md")).toBe(false);
  });
});

describe("triage_turn_diff", () => {
  it("routes a modified note to the proposable bucket", () => {
    const triage = triage_turn_diff([modified_note()], ["note.md"]);

    expect(triage.modified).toHaveLength(1);
    expect(triage.modified[0]?.note_path).toBe("note.md");
    expect(triage.created_paths).toEqual([]);
    expect(triage.deleted_paths).toEqual([]);
  });

  it("keeps every hunk of a multi-hunk file together under one entry", () => {
    const triage = triage_turn_diff(
      [
        hunk("note.md", "@@ -1,1 +1,1 @@", [
          line("deletion", "a\n", 1, null),
          line("addition", "A\n", null, 1),
        ]),
        hunk("note.md", "@@ -9,1 +9,1 @@", [
          line("deletion", "b\n", 9, null),
          line("addition", "B\n", null, 9),
        ]),
      ],
      ["note.md"],
    );

    expect(triage.modified).toHaveLength(1);
    expect(triage.modified[0]?.hunks).toHaveLength(2);
  });

  it("separates files that share an identical hunk header", () => {
    const triage = triage_turn_diff(
      [
        hunk("a.md", "@@ -1 +1 @@", [
          line("deletion", "one\n", 1, null),
          line("addition", "alpha\n", null, 1),
        ]),
        hunk("b.md", "@@ -1 +1 @@", [
          line("deletion", "two\n", 1, null),
          line("addition", "bravo\n", null, 1),
        ]),
      ],
      ["a.md", "b.md"],
    );

    expect(triage.modified.map((file) => file.note_path)).toEqual([
      "a.md",
      "b.md",
    ]);
  });

  // I-i. The turn's checkpoint stages everything, so the diff contains the
  // user's concurrent edits too and cannot tell them apart from the agent's.
  // Without this guard the rollback would revert whatever the user typed
  // during the turn. Dropping the touched_paths filter must fail this test.
  it("ignores files the agent's tool transcript never touched", () => {
    const triage = triage_turn_diff(
      [modified_note("agent.md"), modified_note("user_was_typing.md")],
      ["agent.md"],
    );

    expect(triage.modified.map((file) => file.note_path)).toEqual(["agent.md"]);
    expect(triage.skipped_non_note).toEqual([]);
    expect(triage.skipped_binary).toEqual([]);
  });

  it("classifies a file with no old side as a creation", () => {
    const triage = triage_turn_diff(
      [
        hunk("new.md", "@@ -0,0 +1,2 @@", [
          line("addition", "fresh\n", null, 1),
          line("addition", "note\n", null, 2),
        ]),
      ],
      ["new.md"],
    );

    expect(triage.created_paths).toEqual(["new.md"]);
    expect(triage.modified).toEqual([]);
  });

  it("classifies a file with no new side as a deletion", () => {
    const triage = triage_turn_diff(
      [
        hunk("gone.md", "@@ -1,2 +0,0 @@", [
          line("deletion", "will be\n", 1, null),
          line("deletion", "deleted\n", 2, null),
        ]),
      ],
      ["gone.md"],
    );

    expect(triage.deleted_paths).toEqual(["gone.md"]);
    expect(triage.modified).toEqual([]);
  });

  // A rename reaches TypeScript as two independent deltas, so it splits across
  // two buckets: the new path is kept on disk, the old path is restored.
  it("splits a rename into a creation and a deletion", () => {
    const triage = triage_turn_diff(
      [
        hunk("old.md", "@@ -1,1 +0,0 @@", [
          line("deletion", "body\n", 1, null),
        ]),
        hunk("new.md", "@@ -0,0 +1,1 @@", [
          line("addition", "body\n", null, 1),
        ]),
      ],
      ["old.md", "new.md"],
    );

    expect(triage.deleted_paths).toEqual(["old.md"]);
    expect(triage.created_paths).toEqual(["new.md"]);
    expect(triage.modified).toEqual([]);
  });

  it("counts non-note writes instead of proposing them", () => {
    const triage = triage_turn_diff(
      [modified_note("note.md"), modified_note("assets/data.json")],
      ["note.md", "assets/data.json"],
    );

    expect(triage.modified.map((file) => file.note_path)).toEqual(["note.md"]);
    expect(triage.skipped_non_note).toEqual(["assets/data.json"]);
  });

  // The Rust side emits a binary delta as a single header-only hunk with zero
  // lines; a proposal built from it would apply nothing at all.
  it("counts a hunk carrying no usable lines instead of proposing it", () => {
    const triage = triage_turn_diff(
      [hunk("weird.md", "[Binary file]", [])],
      ["weird.md"],
    );

    expect(triage.skipped_binary).toEqual(["weird.md"]);
    expect(triage.modified).toEqual([]);
  });

  it("drops pseudo-lines that carry no line number on either side", () => {
    const triage = triage_turn_diff(
      [
        hunk("note.md", "@@ -1,2 +1,2 @@", [
          line("context", "@@ -1,2 +1,2 @@\n", null, null),
          line("deletion", "one\n", 1, null),
          line("addition", "ONE\n", null, 1),
          line("context", "\\ No newline at end of file\n", null, null),
        ]),
      ],
      ["note.md"],
    );

    expect(triage.modified).toHaveLength(1);
  });
});

describe("build_turn_proposals", () => {
  const base_content = "one\ntwo\nthree\n";

  function build() {
    return build_turn_proposals(
      [
        {
          file: { note_path: "note.md", hunks: [modified_note()] },
          base_content,
        },
      ],
      origin,
      1700,
    );
  }

  it("produces one pending proposal per note with every hunk selected", () => {
    const [proposal] = build();

    expect(proposal?.note_path).toBe("note.md");
    expect(proposal?.status).toBe("pending");
    expect(proposal?.created_at).toBe(1700);
    expect(proposal?.origin).toEqual(origin);
    expect(proposal?.hunks).toHaveLength(1);
    expect(proposal?.hunks.every((h) => h.selected)).toBe(true);
  });

  it("derives base_revision from the content handed in", () => {
    const [proposal] = build();

    expect(proposal?.base_revision).toBe(compute_note_revision(base_content));
  });

  it("mints ids that are unique per note and per hunk", () => {
    const proposals = build_turn_proposals(
      [
        {
          file: { note_path: "a.md", hunks: [modified_note("a.md")] },
          base_content,
        },
        {
          file: { note_path: "b.md", hunks: [modified_note("b.md")] },
          base_content,
        },
      ],
      origin,
      1700,
    );

    const ids = proposals.map((proposal) => proposal.id);
    expect(new Set(ids).size).toBe(2);
    const hunk_ids = proposals.flatMap((p) => p.hunks.map((h) => h.id));
    expect(new Set(hunk_ids).size).toBe(hunk_ids.length);
  });

  it("gives two turns in the same session distinct proposal ids", () => {
    const first = build_turn_proposals(
      [
        {
          file: { note_path: "note.md", hunks: [modified_note()] },
          base_content,
        },
      ],
      { session_id: "session-1", run_id: "run-1" },
      1700,
    );
    const second = build_turn_proposals(
      [
        {
          file: { note_path: "note.md", hunks: [modified_note()] },
          base_content,
        },
      ],
      { session_id: "session-1", run_id: "run-2" },
      1800,
    );

    expect(first[0]?.id).not.toBe(second[0]?.id);
  });

  // ProposalOrigin permits a null run_id (ambient producers), so the id
  // cannot lean on the run alone to stay unique across turns.
  it("keeps ids distinct across turns even without a run id", () => {
    const anonymous = { session_id: "session-1", run_id: null };
    const first = build_turn_proposals(
      [
        {
          file: { note_path: "note.md", hunks: [modified_note()] },
          base_content,
        },
      ],
      anonymous,
      1700,
    );
    const second = build_turn_proposals(
      [
        {
          file: { note_path: "note.md", hunks: [modified_note()] },
          base_content,
        },
      ],
      anonymous,
      1800,
    );

    expect(first[0]?.id).not.toBe(second[0]?.id);
  });

  // F5: the assistant slice deliberately does not share git's vocabulary.
  it("remaps git line kinds onto the proposal vocabulary", () => {
    const [proposal] = build();

    expect(proposal?.hunks[0]?.lines.map((l) => l.kind)).toEqual([
      "context",
      "del",
      "add",
      "context",
    ]);
  });

  it("strips the line terminator libgit2 leaves on each line", () => {
    const [proposal] = build();

    for (const l of proposal?.hunks[0]?.lines ?? []) {
      expect(l.content.endsWith("\n")).toBe(false);
    }
  });

  it("also strips a CRLF terminator", () => {
    const [proposal] = build_turn_proposals(
      [
        {
          file: {
            note_path: "note.md",
            hunks: [
              hunk("note.md", "@@ -1 +1 @@", [
                line("deletion", "one\r\n", 1, null),
                line("addition", "ONE\r\n", null, 1),
              ]),
            ],
          },
          base_content: "one\n",
        },
      ],
      origin,
      1700,
    );

    expect(proposal?.hunks[0]?.lines.map((l) => l.content)).toEqual([
      "one",
      "ONE",
    ]);
  });

  it("excludes pseudo-lines from the proposal's hunks", () => {
    const [proposal] = build_turn_proposals(
      [
        {
          file: {
            note_path: "note.md",
            hunks: [
              hunk("note.md", "@@ -1 +1 @@", [
                line("context", "@@ -1 +1 @@\n", null, null),
                line("deletion", "one\n", 1, null),
                line("addition", "ONE\n", null, 1),
              ]),
            ],
          },
          base_content: "one\n",
        },
      ],
      origin,
      1700,
    );

    expect(proposal?.hunks[0]?.lines).toHaveLength(2);
    expect(
      proposal?.hunks[0]?.lines.some((l) => l.content.includes("@@")),
    ).toBe(false);
  });

  // The whole point of the rollback model: applying the proposal to the
  // rolled-back note must reproduce exactly what the agent wrote.
  it("round-trips through apply_proposal_hunks back to the agent's content", () => {
    const [proposal] = build();

    expect(apply_proposal_hunks(base_content, proposal?.hunks ?? [])).toBe(
      "one\nedited\nthree\n",
    );
  });

  it("round-trips a multi-hunk edit", () => {
    const content = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n";
    const [proposal] = build_turn_proposals(
      [
        {
          file: {
            note_path: "note.md",
            hunks: [
              hunk("note.md", "@@ -1,2 +1,2 @@", [
                line("deletion", "a\n", 1, null),
                line("addition", "A\n", null, 1),
                line("context", "b\n", 2, 2),
              ]),
              hunk("note.md", "@@ -8,2 +8,2 @@", [
                line("context", "h\n", 8, 8),
                line("deletion", "i\n", 9, null),
                line("addition", "I\n", null, 9),
              ]),
            ],
          },
          base_content: content,
        },
      ],
      origin,
      1700,
    );

    expect(apply_proposal_hunks(content, proposal?.hunks ?? [])).toBe(
      "A\nb\nc\nd\ne\nf\ng\nh\nI\nj\n",
    );
  });
});
