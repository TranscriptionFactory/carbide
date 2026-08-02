import { describe, expect, it } from "vitest";
import {
  AssistantRunStore,
  AssistantSessionStore,
  create_session_run_sink,
  type AssistantMessage,
  type RunSink,
  AssistantChatStore,
} from "$lib/features/assistant";
import { make_run_spec } from "../helpers/assistant_fixtures";

function create_harness() {
  const runs = new AssistantRunStore();
  const sessions = new AssistantSessionStore(() => 1_000);
  const sink = create_session_run_sink({ runs, sessions });

  // A run is associated with a session only through its own record, so a test
  // opens one the same way the kernel does.
  const open_run = (run_id: string, session_id?: string) => {
    runs.start(
      run_id,
      make_run_spec(session_id ? { origin: { session_id } } : {}),
      0,
    );
  };

  const session_of = (id: string) => sessions.get(id);
  const messages_of = (id: string): AssistantMessage[] =>
    sessions.get(id)?.messages ?? [];

  return { runs, sessions, sink, open_run, session_of, messages_of };
}

function create_chat(sessions: AssistantSessionStore) {
  return sessions.create({
    kind: "chat",
    title: "How do backlinks work?",
    provider_id: "claude",
  });
}

function stream_text(sink: RunSink, run_id: string, ...texts: string[]) {
  for (const text of texts) sink.on_event(run_id, { type: "text", text });
}

describe("create_session_run_sink", () => {
  describe("association", () => {
    it("ignores a run whose origin names no session", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1");

      stream_text(sink, "run-1", "hello");

      expect(messages_of(session.id)).toEqual([]);
    });

    it("ignores a run whose session no longer exists", () => {
      const { sink, open_run, sessions } = create_harness();
      open_run("run-1", "deleted-session");

      expect(() => {
        stream_text(sink, "run-1", "hello");
      }).not.toThrow();
      expect(sessions.sessions).toEqual([]);
    });

    it("ignores a run with no record at all", () => {
      const { sessions, sink, messages_of } = create_harness();
      const session = create_chat(sessions);

      stream_text(sink, "unknown-run", "hello");

      expect(messages_of(session.id)).toEqual([]);
    });
  });

  describe("streaming a turn", () => {
    it("opens a trailing assistant message on the first text event", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);

      stream_text(sink, "run-1", "The answer");

      expect(messages_of(session.id)).toHaveLength(1);
      expect(messages_of(session.id)[0]).toMatchObject({
        role: "assistant",
        content: "The answer",
        citations: [],
      });
    });

    it("appends later text to the same message rather than opening new ones", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);

      stream_text(sink, "run-1", "The ", "answer ", "is 42.");

      expect(messages_of(session.id)).toHaveLength(1);
      expect(messages_of(session.id)[0]?.content).toBe("The answer is 42.");
    });

    it("accumulates reasoning onto the same message", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);

      sink.on_event("run-1", { type: "reasoning", text: "Let me " });
      sink.on_event("run-1", { type: "reasoning", text: "think." });
      stream_text(sink, "run-1", "Done.");

      expect(messages_of(session.id)).toHaveLength(1);
      expect(messages_of(session.id)[0]?.reasoning).toBe("Let me think.");
      expect(messages_of(session.id)[0]?.content).toBe("Done.");
    });

    it("records the provider's session id on the session", () => {
      const { sessions, sink, open_run, session_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);

      sink.on_event("run-1", {
        type: "session",
        provider_session_id: "provider-abc",
      });

      expect(session_of(session.id)?.agent_session_id).toBe("provider-abc");
    });
  });

  describe("tool events", () => {
    it("appends a tool event and marks the matching one finished", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);

      sink.on_event("run-1", {
        type: "tool_start",
        name: "read_note",
        input_summary: "notes/a.md",
        paths: ["notes/a.md"],
        mutating: false,
      });
      sink.on_event("run-1", {
        type: "tool_end",
        name: "read_note",
        ok: true,
      });

      expect(messages_of(session.id)[0]?.tool_events).toEqual([
        {
          name: "read_note",
          input_summary: "notes/a.md",
          paths: ["notes/a.md"],
          ok: true,
        },
      ]);
    });

    it("marks only the most recent unfinished call of that name", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);

      for (const summary of ["first", "second"]) {
        sink.on_event("run-1", {
          type: "tool_start",
          name: "read_note",
          input_summary: summary,
          paths: [],
          mutating: false,
        });
      }
      sink.on_event("run-1", {
        type: "tool_end",
        name: "read_note",
        ok: false,
      });

      const events = messages_of(session.id)[0]?.tool_events ?? [];
      expect(events[0]?.ok).toBeUndefined();
      expect(events[1]?.ok).toBe(false);
    });

    it("does not conjure a message for a tool_end with no open turn", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);

      sink.on_event("run-1", { type: "tool_end", name: "read_note", ok: true });

      expect(messages_of(session.id)).toEqual([]);
    });
  });

  describe("closing the turn out", () => {
    it("leaves a completed turn exactly as it streamed", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);
      stream_text(sink, "run-1", "The answer is 42.");

      sink.on_end?.("run-1", {
        status: "done",
        text: "The answer is 42.",
        stats: null,
      });

      expect(messages_of(session.id)).toHaveLength(1);
      expect(messages_of(session.id)[0]).toMatchObject({
        content: "The answer is 42.",
      });
      expect(messages_of(session.id)[0]?.stopped).toBeUndefined();
    });

    // Marked, not half-open: the transcript has to say the user stopped this,
    // and it must not say the model failed.
    it("marks a stopped turn as stopped while keeping its text", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);
      stream_text(sink, "run-1", "The answer is 4");

      sink.on_end?.("run-1", { status: "aborted", text: "The answer is 4" });

      expect(messages_of(session.id)[0]).toMatchObject({
        content: "The answer is 4",
        stopped: true,
      });
      expect(messages_of(session.id)[0]?.error).toBeUndefined();
    });

    it("drops a stopped turn that produced nothing at all", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);
      stream_text(sink, "run-1", "");

      sink.on_end?.("run-1", { status: "aborted", text: "" });

      expect(messages_of(session.id)).toEqual([]);
    });

    // The tool trail is the only record of what the agent touched, so an
    // otherwise empty turn that ran one survives.
    it("keeps a stopped turn whose only evidence is a tool call", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);
      sink.on_event("run-1", {
        type: "tool_start",
        name: "write_note",
        input_summary: "notes/a.md",
        paths: ["notes/a.md"],
        mutating: true,
      });

      sink.on_end?.("run-1", { status: "aborted", text: "" });

      expect(messages_of(session.id)).toHaveLength(1);
      expect(messages_of(session.id)[0]?.stopped).toBe(true);
    });

    it("records the failure on a turn that produced something first", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);
      stream_text(sink, "run-1", "Partial");

      sink.on_end?.("run-1", {
        status: "error",
        error: { message: "Ollama is unreachable.", detail: "ECONNREFUSED" },
        text: "Partial",
      });

      expect(messages_of(session.id)[0]).toMatchObject({
        content: "Partial",
        error: "Ollama is unreachable.",
      });
      expect(messages_of(session.id)[0]?.stopped).toBeUndefined();
    });

    it("drops an empty failed turn rather than leaving a blank bubble", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const session = create_chat(sessions);
      open_run("run-1", session.id);
      sink.on_event("run-1", { type: "error", message: "boom" });

      sink.on_end?.("run-1", {
        status: "error",
        error: { message: "boom", detail: "boom" },
        text: "",
      });

      expect(messages_of(session.id)).toEqual([]);
    });
  });

  describe("concurrent runs", () => {
    // transcript_sink writes to whichever session is active, so switching
    // chats mid-run corrupts the wrong transcript. Association by run record
    // is what makes that impossible here.
    it("writes to the run's own session, not the most recent one", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const first = create_chat(sessions);
      open_run("run-1", first.id);
      stream_text(sink, "run-1", "for the first chat");

      const second = create_chat(sessions);

      stream_text(sink, "run-1", " still the first");

      expect(messages_of(first.id)[0]?.content).toBe(
        "for the first chat still the first",
      );
      expect(messages_of(second.id)).toEqual([]);
    });

    it("keeps two runs on two sessions from crossing over", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const first = create_chat(sessions);
      const second = create_chat(sessions);
      open_run("run-1", first.id);
      open_run("run-2", second.id);

      stream_text(sink, "run-1", "one");
      stream_text(sink, "run-2", "two");
      stream_text(sink, "run-1", "-one");

      expect(messages_of(first.id)[0]?.content).toBe("one-one");
      expect(messages_of(second.id)[0]?.content).toBe("two");
    });

    it("closes each run out independently", () => {
      const { sessions, sink, open_run, messages_of } = create_harness();
      const first = create_chat(sessions);
      const second = create_chat(sessions);
      open_run("run-1", first.id);
      open_run("run-2", second.id);
      stream_text(sink, "run-1", "kept");
      stream_text(sink, "run-2", "also kept");

      sink.on_end?.("run-1", { status: "aborted", text: "kept" });
      sink.on_end?.("run-2", {
        status: "done",
        text: "also kept",
        stats: null,
      });

      expect(messages_of(first.id)[0]?.stopped).toBe(true);
      expect(messages_of(second.id)[0]?.stopped).toBeUndefined();
    });
  });

  // R8's payoff, stated as a property rather than a promise: this sink can
  // replace agent_runner's transcript_sink because for the same events it
  // writes the same transcript. The swap itself is C3's (AU-040) — registering
  // this sink while transcript_sink is still installed would double-write every
  // agent turn, so in C1 it ships unregistered.
  it("writes the transcript agent_runner's rag path writes for the same events", () => {
    const runs = new AssistantRunStore();
    const sessions = new AssistantSessionStore(() => 1_000);
    const sink = create_session_run_sink({ runs, sessions });
    const rag = new AssistantChatStore(sessions);

    const through_sink = create_chat(sessions);
    runs.start(
      "run-1",
      make_run_spec({ origin: { session_id: through_sink.id } }),
      0,
    );
    const through_rag = create_chat(sessions);
    rag.switch_session(through_rag.id);

    sink.on_event("run-1", {
      type: "session",
      provider_session_id: "provider-1",
    });
    rag.set_agent_session_id("provider-1");

    sink.on_event("run-1", { type: "text", text: "Reading" });
    rag.start_streaming();
    rag.append_streaming_text("Reading");

    const tool = {
      name: "read_note",
      input_summary: "notes/a.md",
      paths: ["notes/a.md"],
    };
    sink.on_event("run-1", { type: "tool_start", ...tool, mutating: false });
    rag.add_streaming_tool_event(tool);

    sink.on_event("run-1", { type: "tool_end", name: tool.name, ok: true });
    rag.finish_streaming_tool_event(tool.name, true);

    sink.on_event("run-1", { type: "text", text: " — done." });
    rag.append_streaming_text(" — done.");

    sink.on_end?.("run-1", {
      status: "done",
      text: "Reading — done.",
      stats: null,
    });
    rag.finish_streaming();

    const without_ids = (messages: AssistantMessage[]) =>
      messages.map((message) => ({ ...message, id: "" }));

    expect(without_ids(sessions.get(through_sink.id)?.messages ?? [])).toEqual(
      without_ids(sessions.get(through_rag.id)?.messages ?? []),
    );
    expect(sessions.get(through_sink.id)?.agent_session_id).toBe(
      sessions.get(through_rag.id)?.agent_session_id,
    );
  });

  // The kernel catches sink throws, but a sink that relies on being caught
  // silently loses every write queued behind the one that threw.
  it("never throws out of on_event or on_end for an unknown run", () => {
    const { sink } = create_harness();

    expect(() => {
      sink.on_event("ghost", { type: "text", text: "x" });
      sink.on_end?.("ghost", { status: "aborted", text: "" });
    }).not.toThrow();
  });
});
