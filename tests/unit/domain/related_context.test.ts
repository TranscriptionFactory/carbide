import { describe, expect, it } from "vitest";
import {
  collect_shared_tag_notes,
  filter_unlinked_mentions,
} from "$lib/features/links/domain/related_context";
import type { NoteSearchHit } from "$lib/shared/types/search";
import { path_to_note_meta } from "$lib/features/links/domain/merge_suggestions";

function hit(path: string, score = 1): NoteSearchHit {
  return { note: path_to_note_meta(path), score };
}

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
