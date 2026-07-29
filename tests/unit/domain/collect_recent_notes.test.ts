import { describe, expect, it } from "vitest";
import { collect_recent_notes } from "$lib/features/editor/domain/collect_recent_notes";
import type { NoteMeta } from "$lib/shared/types/note";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

function note(path: string, title: string, mtime_ms: number): NoteMeta {
  return {
    id: path as NoteId,
    path: path as NotePath,
    name: path.replace(/\.md$/, "").split("/").pop() ?? path,
    title,
    blurb: "",
    mtime_ms,
    ctime_ms: mtime_ms,
    size_bytes: 0,
    file_type: "md",
  };
}

describe("collect_recent_notes", () => {
  it("puts the MRU list ahead of mtime-ranked notes", () => {
    const mru = [note("mru.md", "Mru", 1)];
    const all = [note("fresh.md", "Fresh", 900), note("mru.md", "Mru", 1)];

    const result = collect_recent_notes(mru, all, "", 10);

    expect(result.map((n) => n.path)).toEqual(["mru.md", "fresh.md"]);
  });

  it("ranks the fallback notes by descending mtime", () => {
    const all = [
      note("old.md", "Old", 100),
      note("newest.md", "Newest", 300),
      note("mid.md", "Mid", 200),
    ];

    const result = collect_recent_notes([], all, "", 10);

    expect(result.map((n) => n.path)).toEqual([
      "newest.md",
      "mid.md",
      "old.md",
    ]);
  });

  it("dedupes a note present in both sources, case-insensitively by path", () => {
    const mru = [note("Notes/Plan.md", "Plan", 5)];
    const all = [note("notes/plan.md", "Plan", 5)];

    const result = collect_recent_notes(mru, all, "", 10);

    expect(result.map((n) => n.path)).toEqual(["Notes/Plan.md"]);
  });

  it("filters on title, name and path", () => {
    const all = [
      note("archive/roadmap.md", "Q3 Roadmap", 300),
      note("meeting.md", "Standup", 200),
      note("archive/budget.md", "Budget", 100),
    ];

    expect(
      collect_recent_notes([], all, "roadmap", 10).map((n) => n.path),
    ).toEqual(["archive/roadmap.md"]);
    expect(collect_recent_notes([], all, "q3", 10).map((n) => n.path)).toEqual([
      "archive/roadmap.md",
    ]);
    expect(
      collect_recent_notes([], all, "archive/", 10).map((n) => n.path),
    ).toEqual(["archive/roadmap.md", "archive/budget.md"]);
  });

  it("caps the merged result at the limit", () => {
    const all = [
      note("a.md", "A", 400),
      note("b.md", "B", 300),
      note("c.md", "C", 200),
    ];

    const result = collect_recent_notes([note("mru.md", "Mru", 1)], all, "", 2);

    expect(result.map((n) => n.path)).toEqual(["mru.md", "a.md"]);
  });

  it("returns nothing when both sources are empty", () => {
    expect(collect_recent_notes([], [], "", 10)).toEqual([]);
  });
});
