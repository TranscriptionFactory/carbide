import { describe, expect, it } from "vitest";
import { chat_policy, inline_edit_policy } from "$lib/features/ai";

describe("inline_edit_policy", () => {
  it("reads around the note without a mutating tool, applying via the diff sink", () => {
    expect(inline_edit_policy()).toEqual({
      toolset: { kind: "only", names: ["read_note", "search_notes"] },
      prompt_mode: "inline_edit",
      sink: "diff_apply",
    });
  });
});

describe("chat_policy", () => {
  it("maps safe permission mode to a read-only chat surface", () => {
    expect(chat_policy("safe")).toEqual({
      toolset: { kind: "read_only" },
      prompt_mode: "chat",
      sink: "session",
    });
  });

  it("maps power permission mode to a full-tool chat surface", () => {
    expect(chat_policy("power")).toEqual({
      toolset: { kind: "full" },
      prompt_mode: "chat",
      sink: "session",
    });
  });
});
