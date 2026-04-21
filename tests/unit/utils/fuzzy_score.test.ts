import { describe, it, expect } from "vitest";
import {
  fuzzy_score,
  fuzzy_score_multi,
  fuzzy_score_fields,
} from "$lib/shared/utils/fuzzy_score";

describe("fuzzy_score", () => {
  it("returns null for empty query", () => {
    expect(fuzzy_score("", "hello")).toBeNull();
  });

  it("returns null when query is longer than target", () => {
    expect(fuzzy_score("abcdef", "abc")).toBeNull();
  });

  it("returns null when characters are not present in order", () => {
    expect(fuzzy_score("xyz", "hello")).toBeNull();
    expect(fuzzy_score("ba", "abc")).toBeNull();
  });

  it("matches exact string", () => {
    const result = fuzzy_score("hello", "hello");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 1, 2, 3, 4]);
  });

  it("matches case-insensitively", () => {
    const result = fuzzy_score("hello", "Hello World");
    expect(result).not.toBeNull();
  });

  it("matches subsequence characters", () => {
    const result = fuzzy_score("tbl", "Table");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 2, 3]);
  });

  it("scores word boundary matches higher", () => {
    const boundary = fuzzy_score("tz", "Toggle Zen Mode");
    const mid = fuzzy_score("tz", "Blitzing");
    expect(boundary).not.toBeNull();
    expect(mid).not.toBeNull();
    expect(boundary?.score).toBeGreaterThan(mid?.score ?? 0);
  });

  it("scores start-of-string matches higher", () => {
    const start = fuzzy_score("to", "Toggle");
    const mid = fuzzy_score("to", "AutoToggle");
    expect(start).not.toBeNull();
    expect(mid).not.toBeNull();
    expect(start?.score).toBeGreaterThan(mid?.score ?? 0);
  });

  it("scores consecutive matches higher", () => {
    const consecutive = fuzzy_score("tab", "Table");
    const scattered = fuzzy_score("tab", "Task Blockquote");
    expect(consecutive).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(consecutive?.score).toBeGreaterThan(scattered?.score ?? 0);
  });

  it("matches camelCase boundaries", () => {
    const result = fuzzy_score("gp", "gitPush");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 3]);
  });

  it("matches path separators as boundaries", () => {
    const result = fuzzy_score("sa", "src/architecture");
    expect(result).not.toBeNull();
  });

  it("handles real command palette queries", () => {
    expect(fuzzy_score("togzen", "Toggle Zen Mode")).not.toBeNull();
    expect(fuzzy_score("newn", "Create New Note")).not.toBeNull();
    expect(fuzzy_score("gtp", "Git Push")).not.toBeNull();
    expect(fuzzy_score("bq", "Blockquote")).not.toBeNull();
  });

  it("prefers later consecutive match over early scattered match", () => {
    // Greedy would pick a[0], b[4] (scattered).
    // Optimal should pick a[3], b[4] (consecutive + boundary).
    const result = fuzzy_score("ab", "a_xab");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([3, 4]);
  });

  it("prefers boundary-aligned match over greedy first-hit", () => {
    // Query "ac" in "x_ac_xac": neither position has START bonus.
    // Greedy picks a[2], c[3]. Optimal also picks a[2], c[3]
    // (boundary after _ + consecutive).
    // But "ac" in "xac_ac": greedy picks a[1], c[2]; optimal picks a[4], c[5]
    // because a[4] has boundary bonus + consecutive.
    // a[1]: MATCH=1, a[4]: MATCH=1+BOUNDARY=10, c[5]: MATCH=1+CONSECUTIVE=8.
    // a[1],c[2]: 1+1+8 = 10.  a[4],c[5]: 1+10+1+8 = 20.
    const result = fuzzy_score("ac", "xac_ac");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([4, 5]);
  });

  it("still prefers start-of-string for full prefix match", () => {
    // "abc" in "Abc_xabc": start-of-string [0,1,2] with START+CONSECUTIVE
    // should beat boundary [5,6,7] with BOUNDARY+CONSECUTIVE.
    const result = fuzzy_score("abc", "Abc_xabc");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 1, 2]);
  });

  it("finds optimal alignment for multi-char query with gaps", () => {
    // "fn" in "file_name": greedy picks f[0], n[5].
    // Optimal should also pick f[0], n[5] (start bonus + boundary).
    const result = fuzzy_score("fn", "file_name");
    expect(result).not.toBeNull();
    expect(result?.indices).toEqual([0, 5]);
  });
});

describe("fuzzy_score_multi", () => {
  it("returns null when no target matches", () => {
    expect(fuzzy_score_multi("xyz", ["abc", "def"])).toBeNull();
  });

  it("returns the best score across targets", () => {
    const result = fuzzy_score_multi("zen", ["Toggle Zen Mode", "zenith"]);
    expect(result).not.toBeNull();
    const direct = fuzzy_score("zen", "zenith");
    expect(result?.score).toBe(direct?.score);
  });

  it("works with single target", () => {
    const multi = fuzzy_score_multi("tbl", ["Table"]);
    const single = fuzzy_score("tbl", "Table");
    expect(multi).toEqual(single);
  });
});

describe("fuzzy_score_fields", () => {
  it("returns 0 when no field matches", () => {
    expect(fuzzy_score_fields("xyz", ["abc", "def"])).toBe(0);
  });

  it("returns best score as a number", () => {
    const score = fuzzy_score_fields("zen", ["Toggle Zen Mode", "zenith"]);
    expect(score).toBeGreaterThan(0);
  });

  it("matches multi-word query in any order", () => {
    const fields = ["Open Welcome", "welcome", "onboarding"];
    expect(fuzzy_score_fields("welcome open", fields)).toBeGreaterThan(0);
    expect(fuzzy_score_fields("open welcome", fields)).toBeGreaterThan(0);
  });

  it("returns 0 when one word in multi-word query has no match", () => {
    expect(fuzzy_score_fields("open zzz", ["Open Welcome"])).toBe(0);
  });

  it("multi-word score is sum of individual word scores", () => {
    const fields = ["Toggle Zen Mode", "zen", "focus"];
    const combined = fuzzy_score_fields("toggle zen", fields);
    const word1 = fuzzy_score_fields("toggle", fields);
    const word2 = fuzzy_score_fields("zen", fields);
    expect(combined).toBe(word1 + word2);
  });

  it("single-word query behaves as before", () => {
    const fields = ["Settings", "preferences", "config"];
    const single = fuzzy_score_fields("set", fields);
    const multi = fuzzy_score_multi("set", fields);
    expect(single).toBe(multi?.score ?? 0);
  });

  it("is case-insensitive for multi-word queries", () => {
    const fields = ["Open Welcome"];
    expect(fuzzy_score_fields("WELCOME OPEN", fields)).toBeGreaterThan(0);
    expect(fuzzy_score_fields("Welcome Open", fields)).toBeGreaterThan(0);
  });
});
