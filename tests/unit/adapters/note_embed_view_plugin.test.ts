import { describe, expect, it } from "vitest";
import { embed_src_matches_path } from "$lib/features/editor/adapters/note_embed_view_plugin";

describe("embed_src_matches_path", () => {
  it("matches a name-only src against a nested fs path", () => {
    expect(embed_src_matches_path("Meeting Notes", "work/Meeting Notes.md")).toBe(true);
  });

  it("matches an exact path src with extension stripped", () => {
    expect(embed_src_matches_path("work/plan", "work/plan.md")).toBe(true);
  });

  it("matches case-insensitively like wiki link resolution", () => {
    expect(embed_src_matches_path("readme", "docs/README.md")).toBe(true);
  });

  it("rejects a different note whose name merely ends with the src", () => {
    expect(embed_src_matches_path("plan", "work/master-plan.md")).toBe(false);
  });

  it("rejects unrelated paths", () => {
    expect(embed_src_matches_path("alpha", "beta.md")).toBe(false);
  });
});
