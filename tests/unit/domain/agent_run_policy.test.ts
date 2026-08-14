import { describe, expect, it } from "vitest";
import { chat_policy, inline_edit_policy } from "$lib/features/ai";

describe("inline_edit_policy", () => {
  it("reads around the note without a mutating tool", () => {
    expect(inline_edit_policy()).toEqual({
      toolset: { kind: "only", names: ["read_note", "search_notes"] },
    });
  });
});

describe("chat_policy", () => {
  // I1: the selector is surface scope, so it no longer varies with consent —
  // there is nothing to pass it and nothing it could narrow.
  it("advertises the whole catalog", () => {
    expect(chat_policy()).toEqual({ toolset: { kind: "full" } });
  });
});
