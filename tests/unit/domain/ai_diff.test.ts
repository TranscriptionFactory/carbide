import { describe, expect, it, vi } from "vitest";
import {
  apply_ai_draft_hunk_selection,
  build_proposal,
  create_ai_draft_diff,
} from "$lib/features/ai/domain/ai_diff";

// compute_note_revision is AU-030's to implement (NOT_IMPLEMENTED as of the
// C2 contract) — build_proposal calls it as contract surface (P1 ruling) but
// this file must not depend on its runtime behaviour, so it is faked here.
vi.mock("$lib/features/assistant", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/features/assistant")>();
  return {
    ...actual,
    compute_note_revision: vi.fn((text: string) => `rev-${text.length}`),
  };
});

describe("create_ai_draft_diff", () => {
  it("tracks additions and deletions for full-note drafts", () => {
    const diff = create_ai_draft_diff({
      original_text: "Alpha\nBeta\nGamma",
      draft_text: "Alpha\nBeta revised\nGamma\nDelta",
      target: "full_note",
    });

    expect(diff.additions).toBe(2);
    expect(diff.deletions).toBe(1);
    expect(diff.hunks[0]?.header).toBe("@@ -1,3 +1,4 @@");
    expect(diff.hunks[0]?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "del",
          content: "Beta",
          old_line: 2,
          new_line: null,
        }),
        expect.objectContaining({
          kind: "add",
          content: "Beta revised",
          old_line: null,
          new_line: 2,
        }),
        expect.objectContaining({
          kind: "add",
          content: "Delta",
          old_line: null,
          new_line: 4,
        }),
      ]),
    );
  });

  it("uses a selection-specific header for selection drafts", () => {
    const diff = create_ai_draft_diff({
      original_text: "Old sentence",
      draft_text: "New sentence",
      target: "selection",
    });

    expect(diff.hunks[0]?.header).toBe("@@ -1,1 +1,1 @@");
  });

  it("splits distant changes into separate hunks", () => {
    const diff = create_ai_draft_diff({
      original_text: "A\nB\nC\nD\nE\nF\nG\nH\nI\nJ\nK\nL",
      draft_text: "A\nB changed\nC\nD\nE\nF\nG\nH\nI\nJ changed\nK\nL",
      target: "full_note",
    });

    expect(diff.hunks).toHaveLength(2);
    expect(
      diff.hunks.map(
        (hunk) => hunk.lines.filter((line) => line.kind === "add").length,
      ),
    ).toEqual([1, 1]);
    expect(
      diff.hunks.map(
        (hunk) => hunk.lines.filter((line) => line.kind === "del").length,
      ),
    ).toEqual([1, 1]);
  });

  // Every hunk defaults to selected — the panel starts with everything
  // checked, and the review center's per-hunk toggle is what turns this off.
  it("defaults every hunk to selected", () => {
    const diff = create_ai_draft_diff({
      original_text: "A\nB",
      draft_text: "A\nB changed",
      target: "full_note",
    });

    expect(diff.hunks.every((hunk) => hunk.selected)).toBe(true);
  });
});

// Document-context apply only (see ai_actions.ts's ALLOWED_DIRECT_APPLY) —
// note-context apply no longer reconstructs text locally; the proposal store
// carries the selected hunks and AU-030's apply service does the write.
describe("apply_ai_draft_hunk_selection", () => {
  it("reconstructs a partial draft from selected hunks", () => {
    const diff = create_ai_draft_diff({
      original_text: "A\nB\nC\nD\nE\nF\nG\nH\nI\nJ\nK\nL",
      draft_text: "A\nB changed\nC\nD\nE\nF\nG\nH\nI\nJ changed\nK\nL",
      target: "full_note",
    });

    const partial_output = apply_ai_draft_hunk_selection({
      diff,
      selected_hunk_ids: [diff.hunks[1]?.id ?? ""],
    });

    expect(partial_output).toBe("A\nB\nC\nD\nE\nF\nG\nH\nI\nJ changed\nK\nL");
  });
});

describe("build_proposal", () => {
  it("builds a pending Proposal with a base_revision from the pre-edit text", () => {
    const proposal = build_proposal({
      note_path: "hybrid-retrieval.md",
      original_text: "A\nB",
      draft_text: "A\nB changed",
      target: "full_note",
      origin: { session_id: "session-1", run_id: null },
    });

    expect(proposal.note_path).toBe("hybrid-retrieval.md");
    expect(proposal.status).toBe("pending");
    expect(proposal.base_revision).toBe("rev-3");
    expect(proposal.origin).toEqual({ session_id: "session-1", run_id: null });
    expect(
      proposal.hunks.flatMap((hunk) => hunk.lines).map((line) => line.kind),
    ).toContain("add");
  });

  it("mints a distinct id per proposal", () => {
    const one = build_proposal({
      note_path: "a.md",
      original_text: "A",
      draft_text: "B",
      target: "full_note",
      origin: { session_id: "session-1", run_id: null },
    });
    const two = build_proposal({
      note_path: "a.md",
      original_text: "A",
      draft_text: "B",
      target: "full_note",
      origin: { session_id: "session-1", run_id: null },
    });

    expect(one.id).not.toBe(two.id);
  });
});
