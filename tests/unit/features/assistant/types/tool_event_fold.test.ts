import { describe, expect, it } from "vitest";
import { finish_tool_event } from "$lib/features/assistant/types/tool_event_fold";
import type { AssistantToolEvent } from "$lib/features/assistant/types/session";

function open_event(name: string, input_summary = ""): AssistantToolEvent {
  return { name, input_summary };
}

describe("finish_tool_event", () => {
  it("settles the most recent open event with the matching name", () => {
    const events = [
      open_event("read_note", "first"),
      open_event("read_note", "second"),
    ];

    const next = finish_tool_event(events, { name: "read_note", ok: false });

    expect(next[0]?.ok).toBeUndefined();
    expect(next[1]?.ok).toBe(false);
  });

  it("skips events already settled", () => {
    const events: AssistantToolEvent[] = [
      { name: "read_note", input_summary: "old", ok: true },
      open_event("read_note", "new"),
    ];

    const next = finish_tool_event(events, { name: "read_note", ok: true });

    expect(next[0]?.input_summary).toBe("old");
    expect(next[1]?.ok).toBe(true);
  });

  it("copies rather than mutates", () => {
    const events = [open_event("read_note")];

    const next = finish_tool_event(events, { name: "read_note", ok: true });

    expect(events[0]?.ok).toBeUndefined();
    expect(next).not.toBe(events);
    expect(next[0]).not.toBe(events[0]);
  });

  it("records a result summary when the finish carries one", () => {
    const next = finish_tool_event([open_event("search_notes")], {
      name: "search_notes",
      ok: true,
      result_summary: "3 matches",
    });

    expect(next[0]).toEqual({
      name: "search_notes",
      input_summary: "",
      ok: true,
      result_summary: "3 matches",
    });
  });

  it("leaves result_summary absent for a null or missing summary", () => {
    const from_null = finish_tool_event([open_event("read_note")], {
      name: "read_note",
      ok: true,
      result_summary: null,
    });
    expect(from_null[0]).not.toHaveProperty("result_summary");

    const from_missing = finish_tool_event([open_event("read_note")], {
      name: "read_note",
      ok: true,
    });
    expect(from_missing[0]).not.toHaveProperty("result_summary");
  });

  it("returns an equivalent list when nothing matches", () => {
    const events = [open_event("read_note")];

    const next = finish_tool_event(events, { name: "write_note", ok: true });

    expect(next).toEqual(events);
  });
});
