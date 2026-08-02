import { describe, expect, it } from "vitest";
import { RagStore } from "$lib/features/rag";
import { AssistantSessionStore } from "$lib/features/assistant";
import type { AssistantMessage } from "$lib/features/assistant";
import type {
  RagCitation,
  RagMessage,
  RagSession,
} from "$lib/features/rag/domain/rag_types";

const citation: RagCitation = {
  index: 1,
  note_path: "notes/q.md",
  title: "Q",
};

function saved_session(overrides: Partial<RagSession> = {}): RagSession {
  return {
    id: "s1",
    kind: "chat",
    title: "First chat",
    title_source: "derived",
    origin: {},
    created_at: 1,
    updated_at: 2,
    messages: [{ id: "m1", role: "user", content: "hi", citations: [] }],
    provider_id: "ollama",
    scope: {},
    mode: "ask",
    permission_mode: "safe",
    changed_files: [],
    ...overrides,
  };
}

// I4: the chat panel renders sessions it does not own. These pin that the
// assistant store is the single source rather than a place RagStore copies to.
describe("RagStore session ownership", () => {
  function create_shared() {
    const sessions = new AssistantSessionStore();
    return { sessions, store: new RagStore(sessions) };
  }

  it("puts a session it creates into the assistant store as a chat", () => {
    const { sessions, store } = create_shared();

    store.add_user_message("what is it about caching?");

    expect(sessions.of_kind("chat")).toHaveLength(1);
    expect(sessions.sessions[0]?.kind).toBe("chat");
    expect(sessions.sessions[0]?.title).toBe("what is it about caching?");
  });

  it("shows a chat created directly in the assistant store", () => {
    const { sessions, store } = create_shared();

    const session = sessions.create({
      kind: "chat",
      title: "From elsewhere",
      provider_id: "claude",
    });

    expect(store.sessions.map((s) => s.id)).toEqual([session.id]);
    expect(store.summaries.map((s) => s.title)).toEqual(["From elsewhere"]);
  });

  it("ignores sessions belonging to the other surfaces", () => {
    const { sessions, store } = create_shared();
    sessions.create({ kind: "inline", title: "Inline", provider_id: "claude" });
    sessions.create({ kind: "note", title: "Note", provider_id: "claude" });
    const chat = sessions.create({
      kind: "chat",
      title: "Chat",
      provider_id: "claude",
    });

    expect(store.sessions.map((s) => s.id)).toEqual([chat.id]);
  });

  it("writes a streamed turn into the shared store, not a private copy", () => {
    const { sessions, store } = create_shared();
    store.add_user_message("q");
    store.start_streaming();

    store.append_streaming_text("partial answer");

    const shared = sessions.of_kind("chat")[0];
    expect(shared?.messages.at(-1)?.content).toBe("partial answer");
    expect(store.messages).toEqual(shared?.messages);
  });

  // Rag persists only chats, so a vault load must not evict the inline and
  // note sessions living beside them.
  it("leaves other kinds alone when hydrating chats", () => {
    const { sessions, store } = create_shared();
    const inline = sessions.create({
      kind: "inline",
      title: "Inline",
      provider_id: "claude",
    });

    store.hydrate([saved_session({ id: "a" })]);

    expect(sessions.get(inline.id)).not.toBeNull();
    expect(store.sessions.map((s) => s.id)).toEqual(["a"]);
  });

  // Structural: two structurally-identical declarations would satisfy every
  // other test here and still drift apart later. This only compiles while
  // there is exactly one definition.
  it("names the assistant's message type rather than declaring a second one", () => {
    const assistant: AssistantMessage = {
      id: "m1",
      role: "user",
      content: "hi",
      citations: [],
    };
    const as_rag: RagMessage = assistant;
    const back: AssistantMessage = as_rag;

    expect(back).toBe(assistant);
  });

  it("keeps its surface state out of the shared session", () => {
    const { sessions, store } = create_shared();
    store.add_user_message("q");
    store.start_loading();
    store.set_pending_sources([]);

    const shared = sessions.of_kind("chat")[0] as unknown as Record<
      string,
      unknown
    >;
    expect(shared["is_loading"]).toBeUndefined();
    expect(shared["pending_sources"]).toBeUndefined();
    expect(store.is_loading).toBe(true);
  });
});

describe("RagStore", () => {
  it("creates a session on the first user message and derives its title", () => {
    const store = new RagStore(new AssistantSessionStore());

    const user = store.add_user_message("what is it about caching?");

    expect(store.sessions).toHaveLength(1);
    expect(store.active_id).toBe(store.sessions[0]?.id);
    expect(store.sessions[0]?.title).toBe("what is it about caching?");
    expect(store.messages).toEqual([user]);
  });

  it("appends user and assistant messages into the active session", () => {
    const store = new RagStore(new AssistantSessionStore());

    const user = store.add_user_message("what is it?");
    const assistant = store.add_assistant_message("It is 42 [1].", [citation]);

    expect(store.messages).toHaveLength(2);
    expect(assistant.citations).toEqual([citation]);
    expect(user.id).not.toBe(assistant.id);
    expect(store.sessions).toHaveLength(1);
  });

  it("snapshots the current provider and scope into a new session", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.set_provider("ollama");
    store.set_scope({ folders: ["projects/"] });

    store.add_user_message("q");

    expect(store.sessions[0]?.provider_id).toBe("ollama");
    expect(store.sessions[0]?.scope).toEqual({ folders: ["projects/"] });
  });

  it("start_new_session deactivates and bumps the revision", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.add_user_message("q");
    const before = store.revision;

    store.start_new_session();

    expect(store.active_id).toBeNull();
    expect(store.messages).toEqual([]);
    expect(store.revision).toBe(before + 1);
  });

  it("switch_session restores provider/scope and bumps the revision", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.hydrate([
      saved_session({ id: "a", provider_id: "claude", scope: { tags: ["x"] } }),
    ]);
    const before = store.revision;

    store.switch_session("a");

    expect(store.active_id).toBe("a");
    expect(store.provider_id).toBe("claude");
    expect(store.scope).toEqual({ tags: ["x"] });
    expect(store.revision).toBe(before + 1);
  });

  it("delete_session removes the session and clears active when it was open", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.hydrate([saved_session({ id: "a" }), saved_session({ id: "b" })]);
    store.switch_session("a");
    const before = store.revision;

    store.delete_session("a");

    expect(store.sessions.map((s) => s.id)).toEqual(["b"]);
    expect(store.active_id).toBeNull();
    expect(store.revision).toBe(before + 1);
  });

  it("rename_session updates the title and ignores blank names", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.hydrate([saved_session({ id: "a", title: "old" })]);

    store.rename_session("a", "  new title  ");
    expect(store.sessions[0]?.title).toBe("new title");

    store.rename_session("a", "   ");
    expect(store.sessions[0]?.title).toBe("new title");
  });

  it("hydrate restores sessions and their messages on switch", () => {
    const store = new RagStore(new AssistantSessionStore());
    const a = saved_session({
      id: "a",
      messages: [{ id: "m1", role: "user", content: "older", citations: [] }],
    });

    store.hydrate([a]);
    expect(store.active_id).toBeNull();

    store.switch_session("a");
    expect(store.messages).toEqual(a.messages);
  });

  it("summaries are sorted newest-first", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.hydrate([
      saved_session({ id: "a", updated_at: 10 }),
      saved_session({ id: "b", updated_at: 30 }),
      saved_session({ id: "c", updated_at: 20 }),
    ]);

    expect(store.summaries.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("begin_turn increments and returns the revision", () => {
    const store = new RagStore(new AssistantSessionStore());
    const r1 = store.begin_turn();
    const r2 = store.begin_turn();
    expect(r2).toBe(r1 + 1);
    expect(store.revision).toBe(r2);
  });

  it("tracks loading then clears it on success", () => {
    const store = new RagStore(new AssistantSessionStore());

    store.start_loading();
    expect(store.is_loading).toBe(true);

    store.finish_loading();
    expect(store.is_loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("sets error and stops loading", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.start_loading();

    store.set_error("model crashed");

    expect(store.error).toBe("model crashed");
    expect(store.is_loading).toBe(false);
  });

  it("set_provider updates provider_id", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.set_provider("ollama");
    expect(store.provider_id).toBe("ollama");
  });

  it("append_streaming_reasoning accumulates reasoning without touching content", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.add_user_message("q");
    store.start_streaming();

    store.append_streaming_reasoning("step one; ");
    store.append_streaming_reasoning("step two");
    store.append_streaming_text("the answer");

    const reply = store.messages.at(-1);
    expect(reply?.reasoning).toBe("step one; step two");
    expect(reply?.content).toBe("the answer");
  });

  it("fail_streaming keeps a partial reply and surfaces the error beneath it", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.add_user_message("q");
    store.start_streaming();
    store.append_streaming_text("partial answer");

    store.fail_streaming("rate limited");

    expect(store.messages.map((m) => m.content)).toEqual([
      "q",
      "partial answer",
    ]);
    expect(store.streaming_id).toBeNull();
    expect(store.error).toBe("rate limited");
  });

  it("fail_streaming drops an empty streaming placeholder", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.add_user_message("q");
    store.start_streaming();

    store.fail_streaming("model crashed");

    expect(store.messages.map((m) => m.role)).toEqual(["user"]);
    expect(store.streaming_id).toBeNull();
    expect(store.error).toBe("model crashed");
  });

  it("fail_streaming keeps a textless turn that ran tools, with the failure recorded", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.add_user_message("q");
    store.start_streaming();
    store.add_streaming_tool_event({
      name: "read_note",
      input_summary: '{"path":"clips/scraped.md"}',
    });
    store.finish_streaming_tool_event("read_note", true);

    store.fail_streaming("blocked by the provider");

    const reply = store.messages.at(-1);
    expect(reply?.role).toBe("assistant");
    expect(reply?.content).toBe("");
    expect(reply?.tool_events).toEqual([
      {
        name: "read_note",
        input_summary: '{"path":"clips/scraped.md"}',
        ok: true,
      },
    ]);
    expect(reply?.error).toBe("blocked by the provider");
  });

  it("fail_streaming keeps a textless turn that only reasoned", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.add_user_message("q");
    store.start_streaming();
    store.append_streaming_reasoning("thinking about it");

    store.fail_streaming("blocked by the provider");

    expect(store.messages.at(-1)?.reasoning).toBe("thinking about it");
    expect(store.messages.at(-1)?.error).toBe("blocked by the provider");
  });

  it("fail_streaming records the failure on a kept partial reply", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.add_user_message("q");
    store.start_streaming();
    store.append_streaming_text("partial answer");

    store.fail_streaming("rate limited");

    expect(store.messages.at(-1)?.error).toBe("rate limited");
  });

  it("fork_session clones up to the message, activates the fork, and keeps the original", () => {
    const store = new RagStore(new AssistantSessionStore());
    const messages = [
      { id: "u1", role: "user" as const, content: "q1", citations: [] },
      {
        id: "a1",
        role: "assistant" as const,
        content: "answer 1",
        citations: [citation],
      },
      { id: "u2", role: "user" as const, content: "q2", citations: [] },
      {
        id: "a2",
        role: "assistant" as const,
        content: "answer 2",
        citations: [],
      },
    ];
    store.hydrate([saved_session({ id: "orig", title: "Chat", messages })]);
    store.switch_session("orig");
    const before = store.revision;

    const fork_id = store.fork_session("a1");

    expect(fork_id).not.toBeNull();
    expect(store.active_id).toBe(fork_id);
    expect(store.revision).toBe(before + 1);
    const fork = store.sessions.find((s) => s.id === fork_id);
    expect(fork?.title).toBe("Chat (fork)");
    expect(fork?.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    const original = store.sessions.find((s) => s.id === "orig");
    expect(original?.messages).toHaveLength(4);
    expect(store.sessions[0]?.id).toBe(fork_id);
  });

  it("fork_session deep-copies messages so edits do not leak into the original", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.hydrate([
      saved_session({
        id: "orig",
        messages: [
          { id: "u1", role: "user", content: "q", citations: [] },
          { id: "a1", role: "assistant", content: "a", citations: [citation] },
        ],
      }),
    ]);
    store.switch_session("orig");

    const fork_id = store.fork_session("a1");
    const fork = store.sessions.find((s) => s.id === fork_id);
    const forked_message = fork?.messages[1];
    const forked_citation = forked_message?.citations[0];
    if (!forked_message || !forked_citation) {
      throw new Error("fork missing message");
    }
    forked_message.content = "mutated";
    forked_citation.title = "mutated title";

    const original = store.sessions.find((s) => s.id === "orig");
    expect(original?.messages[1]?.content).toBe("a");
    expect(original?.messages[1]?.citations[0]?.title).toBe("Q");
  });

  it("fork_session resets streaming, loading, and error state", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.hydrate([
      saved_session({
        id: "orig",
        messages: [
          { id: "u1", role: "user", content: "q", citations: [] },
          { id: "a1", role: "assistant", content: "a", citations: [] },
        ],
      }),
    ]);
    store.switch_session("orig");
    store.add_user_message("q2");
    store.start_loading();
    store.start_streaming();

    const fork_id = store.fork_session("a1");

    expect(fork_id).not.toBeNull();
    expect(store.is_loading).toBe(false);
    expect(store.streaming_id).toBeNull();

    store.set_error("boom");
    store.fork_session("u1");

    expect(store.error).toBeNull();
  });

  it("fork_session returns null for an unknown message or no active session", () => {
    const store = new RagStore(new AssistantSessionStore());
    expect(store.fork_session("nope")).toBeNull();

    store.add_user_message("q");
    expect(store.fork_session("missing")).toBeNull();
    expect(store.sessions).toHaveLength(1);
  });

  it("truncate_after keeps the user question and drops the assistant reply", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.hydrate([
      saved_session({
        id: "a",
        messages: [
          { id: "u1", role: "user", content: "q1", citations: [] },
          { id: "a1", role: "assistant", content: "answer 1", citations: [] },
          { id: "u2", role: "user", content: "q2", citations: [] },
          { id: "a2", role: "assistant", content: "answer 2", citations: [] },
        ],
      }),
    ]);
    store.switch_session("a");

    store.truncate_after("a2");

    expect(store.messages.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("truncate_after on a user message keeps that message", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.hydrate([
      saved_session({
        id: "a",
        messages: [
          { id: "u1", role: "user", content: "q1", citations: [] },
          { id: "a1", role: "assistant", content: "answer 1", citations: [] },
          { id: "u2", role: "user", content: "q2", citations: [] },
        ],
      }),
    ]);
    store.switch_session("a");

    store.truncate_after("u2");

    expect(store.messages.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("rename_session records the title source and defaults to manual", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.hydrate([saved_session({ id: "a", title: "old" })]);

    store.rename_session("a", "picked by user");
    expect(store.sessions[0]?.title_source).toBe("manual");

    store.rename_session("a", "Model title", "generated");
    expect(store.sessions[0]?.title_source).toBe("generated");
  });

  it("set_streaming_context_stats stamps stats onto the streaming message", () => {
    const store = new RagStore(new AssistantSessionStore());
    store.add_user_message("q");
    store.start_streaming();

    store.set_streaming_context_stats({ retrieved: 8, used: 3, truncated: 1 });
    store.append_streaming_text("answer");
    store.finish_streaming();

    expect(store.messages[1]?.context_stats).toEqual({
      retrieved: 8,
      used: 3,
      truncated: 1,
    });
  });

  describe("pending sources", () => {
    const source = {
      note_path: "notes/q.md",
      title: "Q",
      score: 0.9,
      truncated: false,
      pinned: false,
    };

    it("stays set from receipt through streaming and clears on finish", () => {
      const store = new RagStore(new AssistantSessionStore());
      store.add_user_message("q");
      store.set_pending_sources([source]);
      expect(store.pending_sources).toEqual([source]);

      store.start_streaming();
      expect(store.pending_sources).toEqual([source]);

      store.finish_streaming();
      expect(store.pending_sources).toBeNull();
    });

    it("clears when the stream fails", () => {
      const store = new RagStore(new AssistantSessionStore());
      store.add_user_message("q");
      store.set_pending_sources([source]);
      store.start_streaming();

      store.fail_streaming("boom");
      expect(store.pending_sources).toBeNull();
    });

    it("clears at the start of a new turn", () => {
      const store = new RagStore(new AssistantSessionStore());
      store.set_pending_sources([source]);

      store.begin_turn();
      expect(store.pending_sources).toBeNull();
    });

    it("clears when switching sessions, starting a new one, or forking", () => {
      const store = new RagStore(new AssistantSessionStore());
      store.hydrate([saved_session({ id: "a" })]);

      store.set_pending_sources([source]);
      store.switch_session("a");
      expect(store.pending_sources).toBeNull();

      store.set_pending_sources([source]);
      store.fork_session("m1");
      expect(store.pending_sources).toBeNull();

      store.set_pending_sources([source]);
      store.start_new_session();
      expect(store.pending_sources).toBeNull();
    });
  });
});
