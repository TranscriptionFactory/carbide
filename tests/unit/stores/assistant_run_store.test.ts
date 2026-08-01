import { describe, expect, it } from "vitest";
import { AssistantRunStore } from "$lib/features/assistant";
import { make_provider, make_run_spec } from "../helpers/assistant_fixtures";

function start_run(store: AssistantRunStore, id: string, started_at = 0) {
  store.start(id, make_run_spec({ provider: make_provider() }), started_at);
}

describe("AssistantRunStore", () => {
  it("inserts a starting record carrying the spec's kind, label and origin", () => {
    const store = new AssistantRunStore();

    store.start(
      "run-1",
      make_run_spec({
        kind: "chat",
        label: "Ask about the vault",
        provider: make_provider(),
        origin: { note_path: "docs/demo.md", session_id: "chat-7" },
      }),
      1_700_000_000,
    );

    expect(store.get("run-1")).toEqual({
      id: "run-1",
      kind: "chat",
      label: "Ask about the vault",
      status: "starting",
      started_at: 1_700_000_000,
      provider_id: "claude",
      provider_session_id: null,
      origin: { note_path: "docs/demo.md", session_id: "chat-7" },
      error: null,
      stats: null,
    });
    expect(store.text_of("run-1")).toBe("");
  });

  it("returns null and ignores events for an unknown run", () => {
    const store = new AssistantRunStore();

    store.apply_event("ghost", { type: "text", text: "nope" });

    expect(store.get("ghost")).toBeNull();
    expect(store.text_of("ghost")).toBe("");
    expect(store.all).toEqual([]);
  });

  it("flips to streaming and accumulates text on text events", () => {
    const store = new AssistantRunStore();
    start_run(store, "run-1");

    store.apply_event("run-1", { type: "text", text: "Hello" });
    expect(store.get("run-1")?.status).toBe("streaming");

    store.apply_event("run-1", { type: "text", text: ", world" });

    expect(store.text_of("run-1")).toBe("Hello, world");
    expect(store.get("run-1")?.status).toBe("streaming");
  });

  it("records the provider session id without disturbing status", () => {
    const store = new AssistantRunStore();
    start_run(store, "run-1");

    store.apply_event("run-1", {
      type: "session",
      provider_session_id: "sess-42",
    });

    expect(store.get("run-1")?.provider_session_id).toBe("sess-42");
    expect(store.get("run-1")?.status).toBe("starting");
  });

  it("leaves status and text untouched for tool events", () => {
    const store = new AssistantRunStore();
    start_run(store, "run-1");
    store.apply_event("run-1", { type: "text", text: "thinking" });

    store.apply_event("run-1", {
      type: "tool_start",
      name: "read_file",
      input_summary: "docs/demo.md",
      paths: ["docs/demo.md"],
      mutating: false,
    });
    store.apply_event("run-1", {
      type: "tool_end",
      name: "read_file",
      ok: true,
      result_summary: "12 lines",
    });

    expect(store.get("run-1")?.status).toBe("streaming");
    expect(store.text_of("run-1")).toBe("thinking");
  });

  it("terminates on done with stats and on error with the error retained", () => {
    const store = new AssistantRunStore();
    start_run(store, "done-run");
    start_run(store, "error-run");

    store.apply_event("done-run", {
      type: "done",
      stats: { duration_ms: 1200, num_turns: 2 },
    });
    store.apply_event("error-run", {
      type: "error",
      message: "Claude Code CLI not found",
    });

    expect(store.get("done-run")?.status).toBe("done");
    expect(store.get("done-run")?.stats).toEqual({
      duration_ms: 1200,
      num_turns: 2,
    });
    expect(store.get("error-run")?.status).toBe("error");
    expect(store.get("error-run")?.error).toEqual({
      message: "Claude Code CLI not found",
      detail: "Claude Code CLI not found",
    });
  });

  it("orders all by start time and excludes terminated runs from active", () => {
    const store = new AssistantRunStore();
    start_run(store, "late", 300);
    start_run(store, "early", 100);
    start_run(store, "middle", 200);

    store.apply_event("early", { type: "done" });
    store.apply_event("middle", { type: "text", text: "streaming" });

    expect(store.all.map((run) => run.id)).toEqual(["early", "middle", "late"]);
    expect(store.active.map((run) => run.id)).toEqual(["middle", "late"]);
    expect(store.active_count).toBe(2);
  });

  it("reports has_error only while some record is in error", () => {
    const store = new AssistantRunStore();
    start_run(store, "run-1");
    start_run(store, "run-2", 1);

    expect(store.has_error).toBe(false);

    store.apply_event("run-2", { type: "error", message: "boom" });
    expect(store.has_error).toBe(true);

    store.clear_terminated();
    expect(store.has_error).toBe(false);
  });

  it("clears terminated runs and their text but keeps live ones", () => {
    const store = new AssistantRunStore();
    start_run(store, "done-run", 1);
    start_run(store, "error-run", 2);
    start_run(store, "aborted-run", 3);
    start_run(store, "live-run", 4);

    store.apply_event("done-run", { type: "done" });
    store.apply_event("error-run", { type: "error", message: "boom" });
    store.set_status("aborted-run", "aborted");
    store.apply_event("live-run", { type: "text", text: "still going" });

    store.clear_terminated();

    expect(store.all.map((run) => run.id)).toEqual(["live-run"]);
    expect(store.text_of("done-run")).toBe("");
    expect(store.text_of("live-run")).toBe("still going");
  });

  it("accumulates text per run without bleeding between runs", () => {
    const store = new AssistantRunStore();
    start_run(store, "run-1", 1);
    start_run(store, "run-2", 2);

    store.apply_event("run-1", { type: "text", text: "one " });
    store.apply_event("run-2", { type: "text", text: "two " });
    store.apply_event("run-1", { type: "text", text: "one" });

    expect(store.text_of("run-1")).toBe("one one");
    expect(store.text_of("run-2")).toBe("two ");
  });
});
