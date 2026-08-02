import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTEXT_BUDGET,
  assemble_context,
  estimate_tokens,
  type ContextBudget,
} from "$lib/features/assistant/domain/context_assembler";
import type {
  ContextBlock,
  ContextSource,
} from "$lib/features/assistant/domain/context_source";

const TRUNCATION_MARKER = "\n…[middle truncated]\n";
const MARKER_LENGTH = TRUNCATION_MARKER.length;

function block(overrides: Partial<ContextBlock> = {}): ContextBlock {
  return {
    id: "b1",
    note_path: "a.md",
    title: "A",
    text: "body",
    score: 1,
    source_tag: "both",
    pinned: false,
    ...overrides,
  };
}

function source(
  id: string,
  blocks: ContextBlock[],
  overrides: Partial<ContextSource> = {},
): ContextSource {
  return { id, blocks, ...overrides };
}

function budget(overrides: Partial<ContextBudget> = {}): ContextBudget {
  return {
    token_budget: 100,
    reserve_tokens: 0,
    chars_per_token: 1,
    min_block_chars: 10,
    ...overrides,
  };
}

function ids(items: { id: string }[]): string[] {
  return items.map((item) => item.id);
}

function seeded_shuffle<T>(items: T[], seed: number): T[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const at_i = result[i] as T;
    const at_j = result[j] as T;
    result[i] = at_j;
    result[j] = at_i;
  }
  return result;
}

describe("assemble_context budget arithmetic", () => {
  it("spends the token budget less the reservation, in characters", () => {
    const result = assemble_context(
      [source("s1", [block({ text: "short" })])],
      budget({ token_budget: 1000, reserve_tokens: 0, chars_per_token: 4 }),
    );

    expect(result.stats.chars_available).toBe(4000);
    expect(ids(result.blocks)).toEqual(["b1"]);
  });

  it("admits nothing when the reservation consumes the whole budget", () => {
    const result = assemble_context(
      [source("s1", [block()])],
      budget({ token_budget: 100, reserve_tokens: 100, chars_per_token: 4 }),
    );

    expect(result.blocks).toEqual([]);
    expect(result.stats.chars_available).toBe(0);
    expect(result.dropped).toEqual([
      {
        id: "b1",
        source_id: "s1",
        note_path: "a.md",
        reason: "budget_exhausted",
      },
    ]);
  });

  it("clamps an over-reserved budget to zero rather than going negative", () => {
    const result = assemble_context(
      [source("s1", [block()])],
      budget({ token_budget: 100, reserve_tokens: 150, chars_per_token: 4 }),
    );

    expect(result.stats.chars_available).toBe(0);
  });

  it("fills the first block whole and drops the two that no longer fit", () => {
    const eighty = "y".repeat(80);
    const result = assemble_context(
      [
        source("s1", [
          block({ id: "first", note_path: "1.md", score: 3, text: eighty }),
          block({ id: "second", note_path: "2.md", score: 2, text: eighty }),
          block({ id: "third", note_path: "3.md", score: 1, text: eighty }),
        ]),
      ],
      budget(),
    );

    expect(ids(result.blocks)).toEqual(["first"]);
    expect(result.stats.chars_used).toBe(80);
    expect(result.stats.truncated).toBe(0);
    // 100 available - 80 spent leaves 20, under the 21-char marker, so "second"
    // cannot even be truncated.
    expect(result.dropped.map((d) => [d.id, d.reason])).toEqual([
      ["second", "budget_exhausted"],
      ["third", "budget_exhausted"],
    ]);
  });

  it("admits a block whose text exactly fills the remaining budget", () => {
    const result = assemble_context(
      [source("s1", [block({ text: "x".repeat(100) })])],
      budget(),
    );

    expect(result.blocks[0]?.truncated).toBe(false);
    expect(result.stats.chars_used).toBe(100);
    expect(result.stats.chars_available).toBe(100);
  });

  it("budgets nothing at all when no budget is supplied", () => {
    const long = "x".repeat(5000);
    const result = assemble_context(
      [
        source("s1", [
          block({ id: "one", note_path: "1.md", score: 2, text: long }),
          block({ id: "two", note_path: "2.md", score: 1, text: long }),
        ]),
      ],
      null,
    );

    expect(ids(result.blocks)).toEqual(["one", "two"]);
    expect(result.stats.truncated).toBe(0);
    expect(result.stats.chars_used).toBe(10_000);
    expect(result.stats.chars_available).toBeNull();
  });

  it("keeps the RAG defaults so adoption is numerically a no-op", () => {
    expect(DEFAULT_CONTEXT_BUDGET).toEqual({
      token_budget: 8000,
      reserve_tokens: 2500,
      chars_per_token: 4,
      min_block_chars: 200,
    });
  });
});

describe("assemble_context truncation", () => {
  it("keeps a long head and a short tail around the marker", () => {
    const text = "H".repeat(900) + "T".repeat(100);
    const result = assemble_context(
      [source("s1", [block({ text })])],
      budget(),
    );

    // 100 available - 21 marker chars = 79 kept, split 75/25.
    const keep = 100 - MARKER_LENGTH;
    const head_length = Math.floor(keep * 0.75);
    const tail_length = keep - head_length;
    const [head, tail] = (result.blocks[0]?.text ?? "").split(
      TRUNCATION_MARKER,
    );

    expect(head).toBe("H".repeat(head_length));
    expect(tail).toBe("T".repeat(tail_length));
    expect(head_length).toBe(59);
    expect(tail_length).toBe(20);
    expect(result.blocks[0]?.truncated).toBe(true);
    expect(result.stats.chars_used).toBe(100);
  });

  it("drops rather than truncates when the surviving head and tail would fall under the floor", () => {
    const result = assemble_context(
      [source("s1", [block({ text: "x".repeat(200) })])],
      budget({ min_block_chars: 90 }),
    );

    // 100 available - 21 marker chars = 79 kept, under the 90-char floor.
    expect(result.blocks).toEqual([]);
    expect(result.stats.truncated).toBe(0);
    expect(result.dropped.map((d) => d.reason)).toEqual(["budget_exhausted"]);
  });

  it("truncates only the block that crosses the boundary and drops every later one", () => {
    const result = assemble_context(
      [
        source("s1", [
          block({
            id: "b1",
            note_path: "1.md",
            score: 4,
            text: "a".repeat(60),
          }),
          block({
            id: "b2",
            note_path: "2.md",
            score: 3,
            text: "b".repeat(100),
          }),
          block({
            id: "b3",
            note_path: "3.md",
            score: 2,
            text: "c".repeat(30),
          }),
          block({
            id: "b4",
            note_path: "4.md",
            score: 1,
            text: "d".repeat(30),
          }),
        ]),
      ],
      budget(),
    );

    expect(ids(result.blocks)).toEqual(["b1", "b2"]);
    expect(result.blocks[0]?.truncated).toBe(false);
    expect(result.blocks[1]?.truncated).toBe(true);
    expect(result.stats.truncated).toBe(1);
    // b1 spends 60 of 100; b2 is truncated into the remaining 40.
    expect(result.blocks[1]?.text.length).toBe(40);
    expect(result.stats.chars_used).toBe(100);
    expect(result.dropped.map((d) => [d.id, d.reason])).toEqual([
      ["b3", "budget_exhausted"],
      ["b4", "budget_exhausted"],
    ]);
  });

  it("truncates a pinned block rather than letting a higher-scoring unpinned one take the budget", () => {
    const result = assemble_context(
      [
        source("s1", [
          block({
            id: "loose",
            note_path: "loose.md",
            score: 9,
            text: "u".repeat(30),
          }),
          block({
            id: "held",
            note_path: "held.md",
            score: 1,
            text: "p".repeat(200),
            pinned: true,
          }),
        ]),
      ],
      budget(),
    );

    expect(ids(result.blocks)).toEqual(["held"]);
    expect(result.blocks[0]?.truncated).toBe(true);
    expect(result.dropped.map((d) => [d.id, d.reason])).toEqual([
      ["loose", "budget_exhausted"],
    ]);
  });

  it("reserves budget for a pinned block declared later while still emitting it in declared order", () => {
    const result = assemble_context(
      [
        source("first", [
          block({ id: "loose", note_path: "loose.md", text: "u".repeat(200) }),
        ]),
        source("second", [
          block({
            id: "held",
            note_path: "held.md",
            text: "p".repeat(60),
            pinned: true,
          }),
        ]),
      ],
      budget(),
    );

    expect(ids(result.blocks)).toEqual(["loose", "held"]);
    expect(result.blocks.map((b) => b.index)).toEqual([1, 2]);
    // "held" reserves 60 first; "loose" is truncated into the remaining 40.
    expect(result.blocks[0]?.truncated).toBe(true);
    expect(result.blocks[0]?.text.length).toBe(40);
    expect(result.blocks[1]?.truncated).toBe(false);
    expect(result.stats.chars_used).toBe(100);
  });
});

describe("assemble_context dedup", () => {
  it("keeps the duplicate that sorts first in the total order", () => {
    const result = assemble_context(
      [
        source("s1", [
          block({ id: "zzz", note_path: "dup.md", score: 5, title: "late" }),
          block({ id: "aaa", note_path: "dup.md", score: 5, title: "early" }),
        ]),
      ],
      null,
    );

    expect(result.blocks.map((b) => b.title)).toEqual(["early"]);
    expect(result.dropped.map((d) => [d.id, d.reason])).toEqual([
      ["zzz", "duplicate"],
    ]);
  });

  it("lets the earlier source win a shared-group duplicate despite a lower score", () => {
    const result = assemble_context(
      [
        source(
          "pinned",
          [
            block({
              id: "p",
              note_path: "dup.md",
              score: 0.1,
              title: "pinned",
            }),
          ],
          { dedup_group: "vault" },
        ),
        source(
          "retrieved",
          [
            block({
              id: "r",
              note_path: "dup.md",
              score: 0.9,
              title: "retrieved",
            }),
          ],
          { dedup_group: "vault" },
        ),
      ],
      null,
    );

    expect(result.blocks.map((b) => b.title)).toEqual(["pinned"]);
    expect(result.dropped.map((d) => [d.id, d.reason])).toEqual([
      ["r", "duplicate"],
    ]);
  });

  it("keeps the higher-scoring duplicate within a single source", () => {
    const result = assemble_context(
      [
        source("s1", [
          block({ id: "low", note_path: "dup.md", score: 0.3, title: "low" }),
          block({ id: "high", note_path: "dup.md", score: 0.8, title: "high" }),
        ]),
      ],
      null,
    );

    expect(result.blocks.map((b) => b.title)).toEqual(["high"]);
    expect(result.blocks[0]?.index).toBe(1);
    expect(result.dropped.map((d) => [d.id, d.reason])).toEqual([
      ["low", "duplicate"],
    ]);
  });

  it("keeps the same note in two sources when their dedup groups differ", () => {
    const result = assemble_context(
      [
        source("backlinks", [block({ id: "b", note_path: "same.md" })]),
        source("outlinks", [block({ id: "o", note_path: "same.md" })]),
      ],
      null,
    );

    expect(ids(result.blocks)).toEqual(["b", "o"]);
    expect(result.dropped).toEqual([]);
  });

  it("never dedups blocks that carry no note path", () => {
    const result = assemble_context(
      [
        source("s1", [
          block({ id: "x", note_path: null, score: 3 }),
          block({ id: "y", note_path: null, score: 2 }),
          block({ id: "z", note_path: null, score: 1 }),
        ]),
      ],
      null,
    );

    expect(ids(result.blocks)).toEqual(["x", "y", "z"]);
    expect(result.dropped).toEqual([]);
  });

  it("drops a colliding id as a duplicate instead of throwing", () => {
    const result = assemble_context(
      [
        source("s1", [
          block({ id: "same", note_path: "one.md", score: 1, title: "loser" }),
          block({ id: "same", note_path: "two.md", score: 9, title: "winner" }),
        ]),
      ],
      null,
    );

    expect(result.blocks.map((b) => b.title)).toEqual(["winner"]);
    expect(result.dropped.map((d) => [d.note_path, d.reason])).toEqual([
      ["one.md", "duplicate"],
    ]);
  });
});

describe("assemble_context ordering", () => {
  it("breaks a score tie on id rather than on input position", () => {
    const result = assemble_context(
      [
        source("s1", [
          block({ id: "b", note_path: "b.md", score: 7 }),
          block({ id: "a", note_path: "a.md", score: 7 }),
        ]),
      ],
      null,
    );

    expect(ids(result.blocks)).toEqual(["a", "b"]);
  });

  it("orders unscored sources by declaration, then by id within each source", () => {
    const result = assemble_context(
      [
        source("first", [
          block({ id: "f2", note_path: "f2.md", score: 0 }),
          block({ id: "f1", note_path: "f1.md", score: 0 }),
        ]),
        source("second", [
          block({ id: "s2", note_path: "s2.md", score: 0 }),
          block({ id: "s1", note_path: "s1.md", score: 0 }),
        ]),
      ],
      null,
    );

    expect(ids(result.blocks)).toEqual(["f1", "f2", "s1", "s2"]);
    expect(result.blocks.map((b) => b.source_id)).toEqual([
      "first",
      "first",
      "second",
      "second",
    ]);
  });
});

describe("assemble_context determinism", () => {
  const sources: ContextSource[] = [
    source(
      "pinned",
      [
        block({
          id: "p1",
          note_path: "pin.md",
          score: 2,
          text: "p".repeat(40),
          pinned: true,
        }),
      ],
      { dedup_group: "vault" },
    ),
    source(
      "retrieved",
      [
        block({
          id: "r1",
          note_path: "one.md",
          score: 5,
          text: "a".repeat(30),
        }),
        block({
          id: "r2",
          note_path: "pin.md",
          score: 4,
          text: "b".repeat(30),
        }),
        block({
          id: "r3",
          note_path: "two.md",
          score: 4,
          text: "c".repeat(90),
        }),
        block({ id: "r4", note_path: "three.md", score: 1, text: "" }),
        block({
          id: "r5",
          note_path: "four.md",
          score: 0,
          text: "e".repeat(30),
        }),
      ],
      { dedup_group: "vault" },
    ),
  ];

  const shuffle_budget = budget({ min_block_chars: 5 });

  it("returns the same assembly however the blocks inside each source are ordered", () => {
    const baseline = assemble_context(sources, shuffle_budget);

    // The fixture exercises every path at once: a cross-source duplicate, an
    // empty block, a pinned reservation, one truncation and a budget drop.
    expect(baseline.stats.truncated).toBe(1);
    expect(baseline.dropped.map((d) => d.reason)).toEqual([
      "duplicate",
      "empty",
      "budget_exhausted",
    ]);

    for (const seed of [1, 7, 42, 1337, 90210]) {
      const shuffled = sources.map((s) =>
        source(s.id, seeded_shuffle(s.blocks, seed), {
          ...(s.dedup_group === undefined
            ? {}
            : { dedup_group: s.dedup_group }),
        }),
      );

      expect(assemble_context(shuffled, shuffle_budget)).toEqual(baseline);
    }
  });

  it("changes the assembly when the sources themselves are reordered", () => {
    const forward = assemble_context(sources, shuffle_budget);
    const reversed = assemble_context([...sources].reverse(), shuffle_budget);

    expect(ids(reversed.blocks)).not.toEqual(ids(forward.blocks));
  });
});

describe("assemble_context degenerate inputs", () => {
  it("returns an empty assembly for no sources", () => {
    const result = assemble_context([], null);

    expect(result.blocks).toEqual([]);
    expect(result.dropped).toEqual([]);
    expect(result.stats).toEqual({
      candidates: 0,
      used: 0,
      truncated: 0,
      dropped: 0,
      chars_used: 0,
      chars_available: null,
    });
  });

  it("returns an empty assembly for a source with no blocks", () => {
    const result = assemble_context([source("s1", [])], null);

    expect(result.blocks).toEqual([]);
    expect(result.stats.candidates).toBe(0);
  });

  it("drops a blank block without spending one of the source's slots", () => {
    const result = assemble_context(
      [
        source(
          "s1",
          [
            block({
              id: "blank",
              note_path: "blank.md",
              score: 9,
              text: "  \n",
            }),
            block({ id: "keep1", note_path: "1.md", score: 5 }),
            block({ id: "keep2", note_path: "2.md", score: 1 }),
          ],
          { max_blocks: 2 },
        ),
      ],
      null,
    );

    expect(ids(result.blocks)).toEqual(["keep1", "keep2"]);
    expect(result.dropped.map((d) => [d.id, d.reason])).toEqual([
      ["blank", "empty"],
    ]);
  });

  it("drops the lowest-ranked blocks past a source's max_blocks", () => {
    const result = assemble_context(
      [
        source(
          "s1",
          [
            block({ id: "a", note_path: "a.md", score: 5 }),
            block({ id: "b", note_path: "b.md", score: 4 }),
            block({ id: "c", note_path: "c.md", score: 3 }),
            block({ id: "d", note_path: "d.md", score: 2 }),
            block({ id: "e", note_path: "e.md", score: 1 }),
          ],
          { max_blocks: 2 },
        ),
      ],
      null,
    );

    expect(ids(result.blocks)).toEqual(["a", "b"]);
    expect(result.dropped.map((d) => [d.id, d.reason])).toEqual([
      ["c", "over_limit"],
      ["d", "over_limit"],
      ["e", "over_limit"],
    ]);
  });
});

describe("estimate_tokens", () => {
  it("approximates four characters per token", () => {
    expect(estimate_tokens("12345678")).toBe(2);
    expect(estimate_tokens("123")).toBe(1);
    expect(estimate_tokens("")).toBe(0);
  });

  it("honours an explicit characters-per-token ratio", () => {
    expect(estimate_tokens("12345678", 2)).toBe(4);
  });
});
