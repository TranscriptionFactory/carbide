import { describe, expect, it } from "vitest";
import { chat_policy } from "$lib/features/ai";

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
