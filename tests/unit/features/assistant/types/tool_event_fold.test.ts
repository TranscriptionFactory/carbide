import { describe, expect, it } from "vitest";
import {
  apply_tool_update,
  cap_tool_content,
  finish_tool_event,
  tool_event_has_body,
  tool_event_status,
  TRUNCATED_MARKER,
} from "$lib/features/assistant/types/tool_event_fold";
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

    const next = finish_tool_event(
      events,
      { name: "read_note" },
      { ok: false },
    );

    expect(next[0]?.ok).toBeUndefined();
    expect(next[1]?.ok).toBe(false);
  });

  it("skips events already settled", () => {
    const events: AssistantToolEvent[] = [
      { name: "read_note", input_summary: "old", ok: true },
      open_event("read_note", "new"),
    ];

    const next = finish_tool_event(events, { name: "read_note" }, { ok: true });

    expect(next[0]?.input_summary).toBe("old");
    expect(next[1]?.ok).toBe(true);
  });

  it("copies rather than mutates when something settles", () => {
    const events = [open_event("read_note")];

    const next = finish_tool_event(events, { name: "read_note" }, { ok: true });

    expect(events[0]?.ok).toBeUndefined();
    expect(next).not.toBe(events);
    expect(next[0]).not.toBe(events[0]);
  });

  it("records a result summary when the finish carries one", () => {
    const next = finish_tool_event(
      [open_event("search_notes")],
      { name: "search_notes" },
      { ok: true, result_summary: "3 matches" },
    );

    expect(next[0]).toEqual({
      name: "search_notes",
      input_summary: "",
      ok: true,
      result_summary: "3 matches",
    });
  });

  it("leaves result_summary absent for a null or missing summary", () => {
    const from_null = finish_tool_event(
      [open_event("read_note")],
      { name: "read_note" },
      { ok: true, result_summary: null },
    );
    expect(from_null[0]).not.toHaveProperty("result_summary");

    const from_missing = finish_tool_event(
      [open_event("read_note")],
      { name: "read_note" },
      { ok: true },
    );
    expect(from_missing[0]).not.toHaveProperty("result_summary");
  });

  it("returns the input untouched when nothing matches", () => {
    const events = [open_event("read_note")];

    const next = finish_tool_event(
      events,
      { name: "write_note" },
      { ok: true },
    );

    expect(next).toBe(events);
    expect(events[0]?.ok).toBeUndefined();
  });
});

describe("finish_tool_event by id", () => {
  it("settles by id before falling back to name", () => {
    const events: AssistantToolEvent[] = [
      { id: "a", name: "read_note", input_summary: "first" },
      { id: "b", name: "read_note", input_summary: "second" },
    ];

    const next = finish_tool_event(
      events,
      { id: "a", name: "read_note" },
      { ok: false },
    );

    expect(next[0]?.ok).toBe(false);
    expect(next[1]?.ok).toBeUndefined();
  });

  it("falls back to last-open-by-name for an unknown id", () => {
    const events: AssistantToolEvent[] = [
      { name: "read_note", input_summary: "pre-acp" },
    ];

    const next = finish_tool_event(
      events,
      { id: "missing", name: "read_note" },
      { ok: true },
    );

    expect(next[0]?.ok).toBe(true);
  });

  it("merges tool_end paths as a union onto the settled event", () => {
    const events: AssistantToolEvent[] = [
      { id: "a", name: "edit", input_summary: "", paths: ["one.md"] },
    ];

    const next = finish_tool_event(
      events,
      { id: "a", name: "edit" },
      { ok: true, paths: ["one.md", "two.md"] },
    );

    expect(next[0]?.paths).toEqual(["one.md", "two.md"]);
  });
});

describe("apply_tool_update", () => {
  it("replaces content and merges paths on the matching event", () => {
    const events: AssistantToolEvent[] = [
      { id: "a", name: "edit", input_summary: "", paths: ["one.md"] },
    ];

    const next = apply_tool_update(events, {
      id: "a",
      content: [{ kind: "text", text: "hello" }],
      paths: ["two.md"],
    });

    expect(next[0]?.content).toEqual([{ kind: "text", text: "hello" }]);
    expect(next[0]?.paths).toEqual(["one.md", "two.md"]);
  });

  it("returns the input untouched for an unknown id", () => {
    const events: AssistantToolEvent[] = [
      { id: "a", name: "edit", input_summary: "" },
    ];

    const next = apply_tool_update(events, {
      id: "zzz",
      content: [{ kind: "text", text: "hello" }],
    });

    expect(next).toBe(events);
  });

  it("keeps existing content when the update carries none", () => {
    const events: AssistantToolEvent[] = [
      {
        id: "a",
        name: "edit",
        input_summary: "",
        content: [{ kind: "text", text: "kept" }],
      },
    ];

    const next = apply_tool_update(events, { id: "a", content: [] });

    expect(next[0]?.content).toEqual([{ kind: "text", text: "kept" }]);
  });
});

describe("cap_tool_content", () => {
  it("head-caps ordinary text blocks at 8k with a marker", () => {
    const capped = cap_tool_content(
      [{ kind: "text", text: "x".repeat(9_000) }],
      "read",
    );
    const block = capped[0];
    if (block?.kind !== "text") throw new Error("expected text block");
    expect(block.text.length).toBeLessThan(8_100);
    expect(block.text.endsWith(TRUNCATED_MARKER)).toBe(true);
    expect(block.text.startsWith("xxx")).toBe(true);
  });

  it("tail-caps execute output at 32k, keeping the end", () => {
    const text = `${"head ".repeat(10)}${"y".repeat(40_000)}END`;
    const capped = cap_tool_content([{ kind: "text", text }], "execute");
    const block = capped[0];
    if (block?.kind !== "text") throw new Error("expected text block");
    expect(block.text.startsWith(TRUNCATED_MARKER)).toBe(true);
    expect(block.text.endsWith("END")).toBe(true);
  });

  it("degrades an oversized diff to a text notice", () => {
    const capped = cap_tool_content(
      [
        {
          kind: "diff",
          path: "big.md",
          old_text: "a".repeat(150_000),
          new_text: "b".repeat(150_000),
        },
      ],
      "edit",
    );
    expect(capped[0]?.kind).toBe("text");
    if (capped[0]?.kind === "text") {
      expect(capped[0].text).toContain("big.md");
    }
  });

  it("passes small blocks through unchanged", () => {
    const content = [
      { kind: "diff" as const, path: "a.md", old_text: "a", new_text: "b" },
      { kind: "text" as const, text: "short" },
    ];
    expect(cap_tool_content(content, "edit")).toEqual(content);
  });
});

describe("tool_event_status", () => {
  it("classifies open, succeeded, and failed events", () => {
    expect(tool_event_status(open_event("read_note"))).toBe("running");
    expect(tool_event_status({ ...open_event("a"), ok: true })).toBe(
      "completed",
    );
    expect(tool_event_status({ ...open_event("a"), ok: false })).toBe("failed");
  });
});

describe("tool_event_has_body", () => {
  it("requires a result summary or paths", () => {
    expect(tool_event_has_body(open_event("think"))).toBe(false);
    expect(
      tool_event_has_body({ ...open_event("a"), result_summary: "out" }),
    ).toBe(true);
    expect(tool_event_has_body({ ...open_event("a"), paths: ["n.md"] })).toBe(
      true,
    );
    expect(tool_event_has_body({ ...open_event("a"), paths: [] })).toBe(false);
  });
});
