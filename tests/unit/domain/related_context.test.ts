import { describe, expect, it } from "vitest";
import {
  collect_same_day_notes,
  collect_shared_tag_notes,
  filter_unlinked_mentions,
} from "$lib/features/links/domain/related_context";
import type { NoteSearchHit } from "$lib/shared/types/search";
import type { NoteMeta } from "$lib/shared/types/note";
import { path_to_note_meta } from "$lib/features/links/domain/merge_suggestions";

function hit(path: string, score = 1): NoteSearchHit {
  return { note: path_to_note_meta(path), score };
}

/* Fixtures are built from local wall-clock components so the calendar days
   they describe hold in whatever zone the runner happens to be in. */
const local_ms = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number => new Date(year, month, day, hour, minute, second, ms).getTime();

const ANCHOR_DAY_NOON = local_ms(2026, 6, 29, 12);
const ANCHOR_DAY_FIRST_MS = local_ms(2026, 6, 29, 0, 0, 0, 0);
const ANCHOR_DAY_LAST_MS = local_ms(2026, 6, 29, 23, 59, 59, 999);
const PREV_DAY_LAST_MS = local_ms(2026, 6, 28, 23, 59, 59, 999);
const NEXT_DAY_FIRST_MS = local_ms(2026, 6, 30, 0, 0, 0, 0);

function timed_note(
  path: string,
  ctime_ms: number,
  mtime_ms = ctime_ms,
): NoteMeta {
  return { ...path_to_note_meta(path), ctime_ms, mtime_ms };
}

describe("collect_same_day_notes", () => {
  const anchor = timed_note("self.md", ANCHOR_DAY_NOON);

  it("matches on the candidate's creation day", () => {
    const notes = [anchor, timed_note("same.md", ANCHOR_DAY_LAST_MS)];

    const result = collect_same_day_notes(anchor, notes, 30);

    expect(result.map((n) => n.path)).toEqual(["same.md"]);
  });

  it("matches on the candidate's modification day when it was created earlier", () => {
    const notes = [
      anchor,
      timed_note("touched.md", PREV_DAY_LAST_MS, ANCHOR_DAY_FIRST_MS),
    ];

    const result = collect_same_day_notes(anchor, notes, 30);

    expect(result.map((n) => n.path)).toEqual(["touched.md"]);
  });

  it("excludes notes on either side of the day boundary", () => {
    const notes = [
      anchor,
      timed_note("yesterday.md", PREV_DAY_LAST_MS),
      timed_note("tomorrow.md", NEXT_DAY_FIRST_MS),
    ];

    expect(collect_same_day_notes(anchor, notes, 30)).toEqual([]);
  });

  it("anchors on the open note's creation day, not its modification day", () => {
    const edited_later = timed_note(
      "self.md",
      ANCHOR_DAY_NOON,
      NEXT_DAY_FIRST_MS,
    );
    const notes = [
      edited_later,
      timed_note("same.md", ANCHOR_DAY_FIRST_MS),
      timed_note("tomorrow.md", NEXT_DAY_FIRST_MS),
    ];

    const result = collect_same_day_notes(edited_later, notes, 30);

    expect(result.map((n) => n.path)).toEqual(["same.md"]);
  });

  it("excludes the anchor note itself", () => {
    const result = collect_same_day_notes(anchor, [anchor], 30);

    expect(result).toEqual([]);
  });

  it("caps at the limit", () => {
    const notes = [
      timed_note("a.md", ANCHOR_DAY_NOON),
      timed_note("b.md", ANCHOR_DAY_NOON),
      timed_note("c.md", ANCHOR_DAY_NOON),
    ];

    const result = collect_same_day_notes(anchor, notes, 2);

    expect(result.map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });
});

describe("collect_shared_tag_notes", () => {
  it("dedupes paths and excludes the given set", () => {
    const notes = collect_shared_tag_notes(
      ["a.md", "b.md", "a.md", "self.md"],
      ["self.md"],
      10,
    );
    expect(notes.map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });

  it("caps at the limit", () => {
    const notes = collect_shared_tag_notes(["a.md", "b.md", "c.md"], [], 2);
    expect(notes.map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });

  it("derives a title from the path", () => {
    const [note] = collect_shared_tag_notes(["Projects/Plan.md"], [], 1);
    expect(note?.name).toBe("Plan");
  });
});

describe("filter_unlinked_mentions", () => {
  it("drops self and already-linked notes", () => {
    const result = filter_unlinked_mentions(
      [hit("self.md"), hit("linked.md"), hit("fresh.md")],
      ["self.md", "linked.md"],
      10,
    );
    expect(result.map((n) => n.path)).toEqual(["fresh.md"]);
  });

  it("dedupes repeated hits and respects the limit", () => {
    const result = filter_unlinked_mentions(
      [hit("a.md"), hit("a.md"), hit("b.md"), hit("c.md")],
      [],
      2,
    );
    expect(result.map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });
});
