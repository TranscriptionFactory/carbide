import { describe, expect, it } from "vitest";
import { RagStore } from "$lib/features/rag";
import type {
  RagCitation,
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
    title: "First chat",
    created_at: 1,
    updated_at: 2,
    messages: [{ id: "m1", role: "user", content: "hi", citations: [] }],
    provider_id: "ollama",
    scope: {},
    ...overrides,
  };
}

describe("RagStore", () => {
  it("creates a session on the first user message and derives its title", () => {
    const store = new RagStore();

    const user = store.add_user_message("what is it about caching?");

    expect(store.sessions).toHaveLength(1);
    expect(store.active_id).toBe(store.sessions[0]?.id);
    expect(store.sessions[0]?.title).toBe("what is it about caching?");
    expect(store.messages).toEqual([user]);
  });

  it("appends user and assistant messages into the active session", () => {
    const store = new RagStore();

    const user = store.add_user_message("what is it?");
    const assistant = store.add_assistant_message("It is 42 [1].", [citation]);

    expect(store.messages).toHaveLength(2);
    expect(assistant.citations).toEqual([citation]);
    expect(user.id).not.toBe(assistant.id);
    expect(store.sessions).toHaveLength(1);
  });

  it("snapshots the current provider and scope into a new session", () => {
    const store = new RagStore();
    store.set_provider("ollama");
    store.set_scope({ folders: ["projects/"] });

    store.add_user_message("q");

    expect(store.sessions[0]?.provider_id).toBe("ollama");
    expect(store.sessions[0]?.scope).toEqual({ folders: ["projects/"] });
  });

  it("start_new_session deactivates and bumps the revision", () => {
    const store = new RagStore();
    store.add_user_message("q");
    const before = store.revision;

    store.start_new_session();

    expect(store.active_id).toBeNull();
    expect(store.messages).toEqual([]);
    expect(store.revision).toBe(before + 1);
  });

  it("switch_session restores provider/scope and bumps the revision", () => {
    const store = new RagStore();
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
    const store = new RagStore();
    store.hydrate([saved_session({ id: "a" }), saved_session({ id: "b" })]);
    store.switch_session("a");
    const before = store.revision;

    store.delete_session("a");

    expect(store.sessions.map((s) => s.id)).toEqual(["b"]);
    expect(store.active_id).toBeNull();
    expect(store.revision).toBe(before + 1);
  });

  it("rename_session updates the title and ignores blank names", () => {
    const store = new RagStore();
    store.hydrate([saved_session({ id: "a", title: "old" })]);

    store.rename_session("a", "  new title  ");
    expect(store.sessions[0]?.title).toBe("new title");

    store.rename_session("a", "   ");
    expect(store.sessions[0]?.title).toBe("new title");
  });

  it("hydrate restores sessions and their messages on switch", () => {
    const store = new RagStore();
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
    const store = new RagStore();
    store.hydrate([
      saved_session({ id: "a", updated_at: 10 }),
      saved_session({ id: "b", updated_at: 30 }),
      saved_session({ id: "c", updated_at: 20 }),
    ]);

    expect(store.summaries.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("begin_turn increments and returns the revision", () => {
    const store = new RagStore();
    const r1 = store.begin_turn();
    const r2 = store.begin_turn();
    expect(r2).toBe(r1 + 1);
    expect(store.revision).toBe(r2);
  });

  it("tracks loading then clears it on success", () => {
    const store = new RagStore();

    store.start_loading();
    expect(store.is_loading).toBe(true);

    store.finish_loading();
    expect(store.is_loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("sets error and stops loading", () => {
    const store = new RagStore();
    store.start_loading();

    store.set_error("model crashed");

    expect(store.error).toBe("model crashed");
    expect(store.is_loading).toBe(false);
  });

  it("set_provider updates provider_id", () => {
    const store = new RagStore();
    store.set_provider("ollama");
    expect(store.provider_id).toBe("ollama");
  });

  it("fail_streaming keeps a partial reply and surfaces the error beneath it", () => {
    const store = new RagStore();
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
    const store = new RagStore();
    store.add_user_message("q");
    store.start_streaming();

    store.fail_streaming("model crashed");

    expect(store.messages.map((m) => m.role)).toEqual(["user"]);
    expect(store.streaming_id).toBeNull();
    expect(store.error).toBe("model crashed");
  });

  it("set_streaming_context_stats stamps stats onto the streaming message", () => {
    const store = new RagStore();
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
});
