import { describe, expect, it } from "vitest";
import type { NoteMeta } from "$lib/shared/types/note";
import {
  OMNIBAR_SCORES,
  RECENCY_WINDOW_MS,
  classify_match,
  rank_notes,
  recency_boost,
  score_note,
  type AccessHistory,
} from "$lib/features/search/domain/omnibar_ranking";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

function make_note(name: string, folder = ""): NoteMeta {
  const path = `${folder ? `${folder}/` : ""}${name}.md`;
  return {
    id: path as NoteId,
    path: path as NotePath,
    name,
    title: name,
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function fixture_50_notes(): NoteMeta[] {
  // 50 notes split into four buckets to exercise every match kind.
  const out: NoteMeta[] = [];
  // 10 exact-prefix candidates for query "alpha"
  for (let i = 0; i < 10; i += 1) {
    out.push(make_note(`alpha-${i}`, "topics"));
  }
  // 15 substring candidates ("xalphax" — query is substring inside)
  for (let i = 0; i < 15; i += 1) {
    out.push(make_note(`pre-alpha-${i}`, "research"));
  }
  // 15 fuzzy candidates (chars in order, scattered)
  for (let i = 0; i < 15; i += 1) {
    out.push(make_note(`a-l-p-h-a-mix-${i}`, "fuzzy"));
  }
  // 10 non-matching
  for (let i = 0; i < 10; i += 1) {
    out.push(make_note(`unrelated-${i}`, "misc"));
  }
  return out;
}

describe("OMNIBAR_SCORES table", () => {
  it("documents the scoring rule as constants", () => {
    expect(OMNIBAR_SCORES.exact_prefix).toBe(1.0);
    expect(OMNIBAR_SCORES.substring).toBe(0.6);
    expect(OMNIBAR_SCORES.fuzzy).toBe(0.3);
    expect(OMNIBAR_SCORES.recency_boost_per_access).toBe(0.1);
    expect(OMNIBAR_SCORES.recency_boost_max).toBe(0.3);
  });
});

describe("classify_match", () => {
  it("returns exact_prefix when query is a prefix of any target", () => {
    expect(classify_match("alpha", ["alpha-1", "topics/alpha-1.md"])).toBe(
      "exact_prefix",
    );
  });
  it("returns substring when query appears in the middle", () => {
    expect(classify_match("alpha", ["pre-alpha-1"])).toBe("substring");
  });
  it("returns fuzzy when chars are a subsequence but not contiguous", () => {
    expect(classify_match("alpha", ["a-l-p-h-a-mix-1"])).toBe("fuzzy");
    expect(classify_match("alpha", ["axxxlxxxpxxxhxxxa"])).toBe("fuzzy");
  });
  it("returns none when there is no match", () => {
    expect(classify_match("alpha", ["unrelated"])).toBe("none");
  });
  it("is case-insensitive", () => {
    expect(classify_match("Alpha", ["alpha-1"])).toBe("exact_prefix");
  });
});

describe("recency_boost", () => {
  it("is 0 when no access history", () => {
    expect(recency_boost("note-1", { now_ms: 1_000_000 })).toBe(0);
  });

  it("counts only accesses within the 24h window", () => {
    const now = 24 * 60 * 60 * 1000 * 10;
    const history: AccessHistory = new Map([
      [
        "note-1",
        [
          now - RECENCY_WINDOW_MS - 1, // outside window
          now - RECENCY_WINDOW_MS + 1, // inside
          now - 10, // inside
        ],
      ],
    ]);
    const boost = recency_boost("note-1", {
      now_ms: now,
      access_history: history,
    });
    expect(boost).toBeCloseTo(0.2, 5);
  });

  it("caps the boost at recency_boost_max", () => {
    const now = 1_000_000_000;
    const history: AccessHistory = new Map([
      ["note-1", Array.from({ length: 50 }, () => now - 1000)],
    ]);
    expect(
      recency_boost("note-1", { now_ms: now, access_history: history }),
    ).toBe(OMNIBAR_SCORES.recency_boost_max);
  });
});

describe("score_note + rank_notes (50-note fixture)", () => {
  it("orders results: exact_prefix > substring > fuzzy", () => {
    const notes = fixture_50_notes();
    const items = notes.map((note) => ({ note }));
    const now_ms = 1_700_000_000_000;
    const ranked = rank_notes(items, { query: "alpha", now_ms });

    // Find first occurrence of each kind in the ranked output.
    const find_first = (kind: string) =>
      ranked.findIndex((item) => item.ranked.kind === kind);

    const first_exact = find_first("exact_prefix");
    const first_substring = find_first("substring");
    const first_fuzzy = find_first("fuzzy");

    expect(first_exact).toBeGreaterThanOrEqual(0);
    expect(first_substring).toBeGreaterThanOrEqual(0);
    expect(first_exact).toBeLessThan(first_substring);

    // Fuzzy may not appear at all if every match qualified higher; that's OK.
    if (first_fuzzy !== -1) {
      expect(first_substring).toBeLessThan(first_fuzzy);
    }
  });

  it("applies recency boost to break ties within the same match kind", () => {
    const notes = fixture_50_notes();
    const items = notes.map((note) => ({ note }));
    const now_ms = 1_700_000_000_000;

    // Boost alpha-9 (last exact-prefix) above alpha-0 (first exact-prefix).
    const history: AccessHistory = new Map([
      ["topics/alpha-9.md", [now_ms - 1000, now_ms - 2000, now_ms - 3000]],
    ]);

    const ranked = rank_notes(items, {
      query: "alpha",
      now_ms,
      access_history: history,
    });

    const idx_a9 = ranked.findIndex(
      (item) => item.note.path === "topics/alpha-9.md",
    );
    const idx_a0 = ranked.findIndex(
      (item) => item.note.path === "topics/alpha-0.md",
    );
    expect(idx_a9).toBeLessThan(idx_a0);
  });

  it("scores match the documented constants", () => {
    const exact = score_note(make_note("alpha-1"), {
      query: "alpha",
      now_ms: 0,
    });
    expect(exact.match_score).toBe(OMNIBAR_SCORES.exact_prefix);
    expect(exact.total).toBe(OMNIBAR_SCORES.exact_prefix);

    const sub = score_note(make_note("pre-alpha-1"), {
      query: "alpha",
      now_ms: 0,
    });
    expect(sub.match_score).toBe(OMNIBAR_SCORES.substring);

    const none = score_note(make_note("unrelated"), {
      query: "alpha",
      now_ms: 0,
    });
    expect(none.match_score).toBe(0);
  });

  it("recency boost does not apply to non-matching notes", () => {
    const note = make_note("unrelated");
    const history: AccessHistory = new Map([[note.id, [1, 2, 3, 4]]]);
    const result = score_note(note, {
      query: "alpha",
      now_ms: 5,
      access_history: history,
    });
    expect(result.recency_boost).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("backend relevance integration", () => {
  it("defaults relevance to 0 so totals match the documented constants", () => {
    const s = score_note(make_note("alpha-1"), { query: "alpha", now_ms: 0 });
    expect(s.relevance_boost).toBe(0);
    expect(s.total).toBe(OMNIBAR_SCORES.exact_prefix);
  });

  it("orders same-kind matches by backend relevance, not input order", () => {
    const low = make_note("alpha-low");
    const high = make_note("alpha-high");
    // Input order puts the less-relevant note first; relevance must reorder.
    const ranked = rank_notes(
      [
        { note: low, relevance: 0.1 },
        { note: high, relevance: 0.9 },
      ],
      { query: "alpha", now_ms: 0 },
    );
    expect(ranked[0]?.note).toBe(high);
    expect(ranked[1]?.note).toBe(low);
  });

  it("orders body-only matches by backend relevance", () => {
    // Neither title/name/path contains "alpha" -> both are kind "none", which
    // gets no recency boost; relevance is the only differentiator.
    const weak = make_note("zzz-weak");
    const strong = make_note("zzz-strong");
    const ranked = rank_notes(
      [
        { note: weak, relevance: 0.2 },
        { note: strong, relevance: 0.95 },
      ],
      { query: "alpha", now_ms: 0 },
    );
    expect(ranked.map((r) => r.ranked.kind)).toEqual(["none", "none"]);
    expect(ranked[0]?.note).toBe(strong);
  });

  it("keeps the match-kind bucket above relevance: a title match outranks a top-relevance body match", () => {
    const title = make_note("alpha-note"); // exact_prefix for "alpha"
    const body = make_note("zzz-unrelated"); // "none" for "alpha"
    const ranked = rank_notes(
      [
        { note: body, relevance: 1 },
        { note: title, relevance: 0 },
      ],
      { query: "alpha", now_ms: 0 },
    );
    expect(ranked[0]?.note).toBe(title);
  });
});
