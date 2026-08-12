import { describe, expect, it } from "vitest";
import {
  apply_permission_request,
  apply_permission_resolved,
  apply_tool_update,
  dismiss_open_permissions,
  hydrate_placeholder,
  cap_tool_content,
  finish_tool_event,
  is_placeholder_summary,
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

  it("adopts the refined input summary and title the update carries", () => {
    const events: AssistantToolEvent[] = [
      { id: "a", name: "Terminal", input_summary: "{}" },
    ];

    const next = apply_tool_update(events, {
      id: "a",
      input_summary: '{"command":"ls -la"}',
      name: "bash: ls -la",
    });

    expect(next[0]?.input_summary).toBe('{"command":"ls -la"}');
    expect(next[0]?.name).toBe("bash: ls -la");
  });

  it("keeps a good summary when a later update carries an empty input", () => {
    const events: AssistantToolEvent[] = [
      { id: "a", name: "bash: ls -la", input_summary: '{"command":"ls -la"}' },
    ];

    for (const patch of [
      { input_summary: "{}" },
      { input_summary: "" },
      { input_summary: null },
      {},
    ]) {
      const next = apply_tool_update(events, { id: "a", ...patch });
      expect(next[0]?.input_summary).toBe('{"command":"ls -la"}');
    }
  });

  it("keeps the existing name when the update carries none", () => {
    const events: AssistantToolEvent[] = [
      { id: "a", name: "bash: ls -la", input_summary: "" },
    ];

    const next = apply_tool_update(events, { id: "a", name: null });

    expect(next[0]?.name).toBe("bash: ls -la");
  });
});

describe("is_placeholder_summary", () => {
  it("treats an absent, empty, or empty-object summary as no summary yet", () => {
    for (const summary of [undefined, null, "", "  ", "{}", " {} "]) {
      expect(is_placeholder_summary(summary)).toBe(true);
    }
  });

  it("treats any real input as a summary", () => {
    for (const summary of ['{"command":"ls"}', "projects", "{}{}"]) {
      expect(is_placeholder_summary(summary)).toBe(false);
    }
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

  it("keeps block identity when nothing is capped", () => {
    const content = [
      { kind: "diff" as const, path: "a.md", old_text: "a", new_text: "b" },
      { kind: "text" as const, text: "short" },
    ];
    const capped = cap_tool_content(content, "edit");

    expect(capped[0]).toBe(content[0]);
    expect(capped[1]).toBe(content[1]);
  });
});

describe("permission folding", () => {
  const options = [
    { option_id: "a", label: "Allow", kind: "allow_once" as const },
  ];

  it("attaches a request to the tool event it gates by id", () => {
    const events: AssistantToolEvent[] = [
      { id: "call-1", name: "bash", input_summary: "ls" },
    ];

    const next = apply_permission_request(events, {
      request_id: "perm-1",
      tool_call_id: "call-1",
      name: "bash",
      kind: "execute",
      input_summary: "ls",
      paths: [],
      options,
    });

    expect(next).toHaveLength(1);
    expect(next[0]?.permission?.request_id).toBe("perm-1");
  });

  it("repairs a placeholder summary from the request's complete input", () => {
    const events: AssistantToolEvent[] = [
      { id: "call-1", name: "Terminal", input_summary: "{}" },
    ];

    const next = apply_permission_request(events, {
      request_id: "perm-1",
      tool_call_id: "call-1",
      name: "bash",
      kind: "execute",
      input_summary: '{"command":"ls -la"}',
      paths: [],
      options,
    });

    expect(next[0]?.input_summary).toBe('{"command":"ls -la"}');
  });

  it("keeps a stored summary the request cannot improve on", () => {
    const events: AssistantToolEvent[] = [
      { id: "call-1", name: "bash", input_summary: '{"command":"ls -la"}' },
    ];

    const next = apply_permission_request(events, {
      request_id: "perm-1",
      tool_call_id: "call-1",
      name: "bash",
      kind: "execute",
      input_summary: "{}",
      paths: [],
      options,
    });

    expect(next[0]?.input_summary).toBe('{"command":"ls -la"}');
  });

  it("inserts a placeholder when the request outruns tool_start", () => {
    const next = apply_permission_request([], {
      request_id: "perm-1",
      tool_call_id: "call-1",
      name: "bash",
      kind: "execute",
      input_summary: "ls",
      paths: [],
      options,
    });

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("call-1");
    expect(next[0]?.ok).toBeUndefined();

    const hydrated = hydrate_placeholder(next, {
      id: "call-1",
      name: "bash",
      kind: "execute",
      input_summary: '{"command":"ls"}',
      paths: ["notes"],
    });
    expect(hydrated).not.toBeNull();
    expect(hydrated).toHaveLength(1);
    expect(hydrated?.[0]?.input_summary).toBe('{"command":"ls"}');
    expect(hydrated?.[0]?.permission?.request_id).toBe("perm-1");
  });

  it("returns null from hydrate when no placeholder matches", () => {
    expect(
      hydrate_placeholder([], { id: "x", name: "bash", input_summary: "" }),
    ).toBeNull();
  });

  it("marks the prompt resolved by request id", () => {
    const events = apply_permission_request([], {
      request_id: "perm-1",
      tool_call_id: null,
      name: "bash",
      kind: "execute",
      input_summary: "ls",
      paths: [],
      options,
    });

    const next = apply_permission_resolved(
      events,
      "perm-1",
      "selected:allow_once",
      false,
    );
    expect(next[0]?.permission?.resolved).toEqual({
      outcome: "selected:allow_once",
      auto: false,
    });
  });

  it("dismisses unresolved prompts when a run closes out", () => {
    const events = apply_permission_request([], {
      request_id: "perm-1",
      tool_call_id: null,
      name: "bash",
      kind: "execute",
      input_summary: "ls",
      paths: [],
      options,
    });

    const settled = dismiss_open_permissions(events);
    expect(settled[0]?.permission?.resolved?.outcome).toBe("cancelled");

    // already-settled prompts return the same reference (no store churn)
    expect(dismiss_open_permissions(settled)).toBe(settled);
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
