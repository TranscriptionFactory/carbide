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
  it("maps safe permission mode to a read-only toolset", () => {
    expect(chat_policy("safe")).toEqual({
      toolset: { kind: "read_only" },
    });
  });

  it("maps power permission mode to the full toolset", () => {
    expect(chat_policy("power")).toEqual({
      toolset: { kind: "full" },
    });
  });
});
