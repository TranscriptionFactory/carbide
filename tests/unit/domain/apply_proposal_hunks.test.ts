import { describe, expect, it } from "vitest";
import { apply_proposal_hunks } from "$lib/features/assistant/domain/apply_proposal_hunks";
import type { ProposalHunk } from "$lib/features/assistant";

function hunk(overrides: Partial<ProposalHunk> = {}): ProposalHunk {
  return {
    id: "hunk-1",
    header: "@@ test @@",
    lines: [],
    selected: true,
    ...overrides,
  };
}

describe("apply_proposal_hunks", () => {
  it("returns the content unchanged when there are no hunks", () => {
    const content = "alpha\nbeta\ngamma";
    expect(apply_proposal_hunks(content, [])).toBe(content);
  });

  it("returns the content unchanged when every hunk is deselected", () => {
    const content = "alpha\nbeta\ngamma";
    const hunks = [
      hunk({
        selected: false,
        lines: [
          { kind: "del", content: "beta", old_line: 2, new_line: null },
          { kind: "add", content: "BETA", old_line: null, new_line: 2 },
        ],
      }),
    ];
    expect(apply_proposal_hunks(content, hunks)).toBe(content);
  });

  it("only applies selected hunks, leaving deselected ones untouched", () => {
    const content = "alpha\nbeta\ngamma";
    const hunks = [
      hunk({
        id: "unselected",
        selected: false,
        lines: [
          { kind: "del", content: "alpha", old_line: 1, new_line: null },
          { kind: "add", content: "ALPHA", old_line: null, new_line: 1 },
        ],
      }),
      hunk({
        id: "selected",
        selected: true,
        lines: [
          { kind: "del", content: "gamma", old_line: 3, new_line: null },
          { kind: "add", content: "GAMMA", old_line: null, new_line: 3 },
        ],
      }),
    ];
    expect(apply_proposal_hunks(content, hunks)).toBe("alpha\nbeta\nGAMMA");
  });

  it("replaces a single line via a del+add pair", () => {
    const content = "alpha\nbeta\ngamma";
    const hunks = [
      hunk({
        lines: [
          { kind: "del", content: "beta", old_line: 2, new_line: null },
          { kind: "add", content: "BETA-NEW", old_line: null, new_line: 2 },
        ],
      }),
    ];
    expect(apply_proposal_hunks(content, hunks)).toBe("alpha\nBETA-NEW\ngamma");
  });

  it("removes a line via a del-only hunk", () => {
    const content = "alpha\nbeta\ngamma";
    const hunks = [
      hunk({
        lines: [{ kind: "del", content: "beta", old_line: 2, new_line: null }],
      }),
    ];
    expect(apply_proposal_hunks(content, hunks)).toBe("alpha\ngamma");
  });

  it("inserts a line anchored on a context line", () => {
    const content = "alpha\nbeta\ngamma";
    const hunks = [
      hunk({
        lines: [
          { kind: "context", content: "beta", old_line: 2, new_line: 2 },
          { kind: "add", content: "NEW", old_line: null, new_line: 3 },
        ],
      }),
    ];
    expect(apply_proposal_hunks(content, hunks)).toBe(
      "alpha\nbeta\nNEW\ngamma",
    );
  });

  it("appends an anchor-free insertion (no context/del lines) at end-of-file", () => {
    const content = "alpha\nbeta";
    const hunks = [
      hunk({
        lines: [
          { kind: "add", content: "TAIL", old_line: null, new_line: null },
        ],
      }),
    ];
    expect(apply_proposal_hunks(content, hunks)).toBe("alpha\nbeta\nTAIL");
  });

  // Demonstrates why bottom-up ordering is required, not merely convenient:
  // a naive top-down apply of the line-2 deletion first would shift "delta"
  // out from under the line-4 hunk's old_line reference and corrupt the
  // result (it would delete "epsilon" and leave "delta" untouched instead).
  it("applies multiple hunks bottom-up so an upper hunk's edit never invalidates a lower hunk's line numbers", () => {
    const content = "alpha\nbeta\ngamma\ndelta\nepsilon";
    const hunks = [
      hunk({
        id: "delete-line-2",
        lines: [{ kind: "del", content: "beta", old_line: 2, new_line: null }],
      }),
      hunk({
        id: "replace-line-4",
        lines: [
          { kind: "del", content: "delta", old_line: 4, new_line: null },
          { kind: "add", content: "DELTA-NEW", old_line: null, new_line: null },
        ],
      }),
    ];
    expect(apply_proposal_hunks(content, hunks)).toBe(
      "alpha\ngamma\nDELTA-NEW\nepsilon",
    );
  });
});
