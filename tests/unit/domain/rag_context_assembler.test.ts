import { describe, expect, it } from "vitest";
import {
  assemble_context,
  estimate_tokens,
  type RagContextCandidate,
} from "$lib/features/rag";

function candidate(
  overrides: Partial<RagContextCandidate> = {},
): RagContextCandidate {
  return {
    note_path: "a.md",
    title: "A",
    text: "body",
    score: 1,
    source: "both",
    ...overrides,
  };
}

describe("estimate_tokens", () => {
  it("approximates four characters per token", () => {
    expect(estimate_tokens("12345678")).toBe(2);
    expect(estimate_tokens("123")).toBe(1);
    expect(estimate_tokens("")).toBe(0);
  });
});

describe("assemble_context", () => {
  it("sorts by score and assigns sequential 1-based indices", () => {
    const result = assemble_context([
      candidate({ note_path: "low.md", score: 0.2 }),
      candidate({ note_path: "high.md", score: 0.9 }),
      candidate({ note_path: "mid.md", score: 0.5 }),
    ]);

    expect(result.map((c) => c.note_path)).toEqual([
      "high.md",
      "mid.md",
      "low.md",
    ]);
    expect(result.map((c) => c.index)).toEqual([1, 2, 3]);
  });

  it("dedupes by path keeping the highest score", () => {
    const result = assemble_context([
      candidate({ note_path: "dup.md", score: 0.3, title: "low" }),
      candidate({ note_path: "dup.md", score: 0.8, title: "high" }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("high");
    expect(result[0]?.index).toBe(1);
  });

  it("includes whole notes that fit within budget", () => {
    const result = assemble_context([candidate({ text: "short" })], {
      token_budget: 1000,
      reserve_tokens: 0,
      min_context_chars: 1,
    });

    expect(result[0]?.text).toBe("short");
  });

  it("truncates the note that crosses the budget boundary", () => {
    const long = "x".repeat(1000);
    const result = assemble_context([candidate({ text: long })], {
      token_budget: 100,
      reserve_tokens: 0,
      chars_per_token: 1,
      min_context_chars: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.text.length).toBeLessThan(long.length);
    expect(result[0]?.text).toContain("…[truncated]");
  });

  it("stops including notes once the budget is exhausted", () => {
    const block = "y".repeat(80);
    const result = assemble_context(
      [
        candidate({ note_path: "first.md", score: 0.9, text: block }),
        candidate({ note_path: "second.md", score: 0.5, text: block }),
        candidate({ note_path: "third.md", score: 0.1, text: block }),
      ],
      {
        token_budget: 100,
        reserve_tokens: 0,
        chars_per_token: 1,
        min_context_chars: 10,
      },
    );

    expect(result.map((c) => c.note_path)).toEqual(["first.md"]);
  });

  it("returns nothing when no budget remains after reservations", () => {
    const result = assemble_context([candidate()], {
      token_budget: 100,
      reserve_tokens: 100,
    });

    expect(result).toEqual([]);
  });
});
