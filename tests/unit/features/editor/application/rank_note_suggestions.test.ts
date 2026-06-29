import { describe, it, expect } from "vitest";
import { rank_note_suggestions } from "$lib/features/editor/application/rank_note_suggestions";

type Suggestion = { title: string; path: string };

const notes: Suggestion[] = [
  { title: "Roadmap", path: "1_PLANS/Roadmap.md" },
  { title: "Kitchen", path: "2_HOME/Kitchen.md" },
  { title: "Rtk sqk notes", path: "5_MISC/tools/Rtk_sqk_proxy.md" },
  { title: "Retro", path: "3_LOG/Retro.md" },
];

describe("rank_note_suggestions", () => {
  it("surfaces a mid-path substring match above unrelated notes", () => {
    const ranked = rank_note_suggestions("rtk", notes);
    expect(ranked[0]?.path).toBe("5_MISC/tools/Rtk_sqk_proxy.md");
  });

  it("returns items unchanged for an empty query", () => {
    expect(rank_note_suggestions("   ", notes)).toEqual(notes);
  });

  it("never drops a backend result, only reorders", () => {
    const ranked = rank_note_suggestions("rtk", notes);
    expect(ranked).toHaveLength(notes.length);
    expect([...ranked].sort((a, b) => a.path.localeCompare(b.path))).toEqual(
      [...notes].sort((a, b) => a.path.localeCompare(b.path)),
    );
  });

  it("preserves original order for items with no fuzzy match", () => {
    const ranked = rank_note_suggestions("zzz_no_match", notes);
    expect(ranked).toEqual(notes);
  });
});
