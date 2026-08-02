import { describe, expect, it } from "vitest";
import {
  AssistantChatStore,
  AssistantSessionService,
  AssistantSessionStore,
  load_assistant_sessions,
} from "$lib/features/assistant";
import { create_test_assistant_session_persistence_adapter } from "../../adapters/test_assistant_session_persistence_adapter";
import type { AssistantScope, AssistantSession } from "$lib/features/assistant";

const VAULT_ID = "v1";

function make_service(
  persistence = create_test_assistant_session_persistence_adapter(),
) {
  return new AssistantSessionService(persistence, {
    start: () => Promise.reject(new Error("no run expected")),
  });
}

function make_stores() {
  const sessions = new AssistantSessionStore();
  return { sessions, store: new AssistantChatStore(sessions) };
}

function session(overrides: Partial<AssistantSession> = {}): AssistantSession {
  return {
    id: "s1",
    kind: "chat",
    title: "First chat",
    title_source: "derived",
    origin: {},
    created_at: 1,
    updated_at: 2,
    messages: [
      { id: "m1", role: "user", content: "what is X?", citations: [] },
      { id: "m2", role: "assistant", content: "X is Y [1].", citations: [] },
    ],
    provider_id: "ollama",
    scope: { folders: ["projects/"] },
    mode: "ask",
    permission_mode: "safe",
    changed_files: [],
    ...overrides,
  };
}

describe("assistant session persistence round-trip", () => {
  it("restores prior sessions and their messages into a fresh store", async () => {
    const persistence = create_test_assistant_session_persistence_adapter();
    const writer = make_service(persistence);
    await writer.save_session(VAULT_ID, session({ id: "a", updated_at: 10 }));
    await writer.save_session(VAULT_ID, session({ id: "b", updated_at: 20 }));

    const reader = make_service(persistence);
    const { sessions, store } = make_stores();
    await load_assistant_sessions(sessions, store, reader, VAULT_ID);

    expect(store.summaries.map((s) => s.id)).toEqual(["b", "a"]);

    store.switch_session("a");
    expect(store.messages).toEqual(session({ id: "a" }).messages);
    expect(store.provider_id).toBe("ollama");
    expect(store.scope).toEqual({ folders: ["projects/"] });
  });

  it("migrates a legacy single-value scope when loading old sessions", async () => {
    const persistence = create_test_assistant_session_persistence_adapter();
    const writer = make_service(persistence);
    await writer.save_session(
      VAULT_ID,
      session({
        id: "legacy",
        scope: {
          folder: "projects",
          tag: "active",
        } as unknown as AssistantScope,
      }),
    );

    const { sessions, store } = make_stores();
    await load_assistant_sessions(
      sessions,
      store,
      make_service(persistence),
      VAULT_ID,
    );

    store.switch_session("legacy");
    expect(store.scope).toEqual({ folders: ["projects"], tags: ["active"] });
  });

  it("round-trips tool-call and tool-result messages", async () => {
    const persistence = create_test_assistant_session_persistence_adapter();
    const writer = make_service(persistence);
    const agent_session = session({
      id: "agent",
      mode: "agent",
      messages: [
        { id: "m1", role: "user", content: "create a note", citations: [] },
        {
          id: "m2",
          role: "assistant",
          content: "",
          citations: [],
          tool_calls: [
            {
              id: "call_1",
              name: "create_note",
              arguments: '{"path":"notes/a.md"}',
            },
          ],
        },
        {
          id: "m3",
          role: "tool",
          content: "Created notes/a.md",
          citations: [],
          tool_call_id: "call_1",
        },
        { id: "m4", role: "assistant", content: "Done.", citations: [] },
      ],
    });
    await writer.save_session(VAULT_ID, agent_session);

    const { sessions, store } = make_stores();
    await load_assistant_sessions(
      sessions,
      store,
      make_service(persistence),
      VAULT_ID,
    );

    store.switch_session("agent");
    expect(store.messages).toEqual(agent_session.messages);
  });

  // title_source used to be optional, so files written back then have no such
  // field. They must arrive complete rather than half-typed.
  it("round-trips title_source and completes legacy sessions without it", async () => {
    const persistence = create_test_assistant_session_persistence_adapter();
    const writer = make_service(persistence);
    await writer.save_session(
      VAULT_ID,
      session({ id: "named", title_source: "manual" }),
    );

    const legacy: Record<string, unknown> = { ...session({ id: "legacy" }) };
    delete legacy["title_source"];
    await writer.save_session(VAULT_ID, legacy as unknown as AssistantSession);

    const { sessions, store } = make_stores();
    await load_assistant_sessions(
      sessions,
      store,
      make_service(persistence),
      VAULT_ID,
    );

    expect(store.sessions.find((s) => s.id === "named")?.title_source).toBe(
      "manual",
    );
    expect(store.sessions.find((s) => s.id === "legacy")?.title_source).toBe(
      "derived",
    );
  });

  it("save_session fails soft when the vault rejects .carbide/ writes (browse mode)", async () => {
    const failing = {
      list_sessions: () => Promise.resolve([]),
      load_session: () => Promise.resolve(null),
      save_session: () =>
        Promise.reject(new Error("cannot write to .carbide/ in browse mode")),
      delete_session: () => Promise.resolve(),
    };
    const service = make_service(failing as never);

    await expect(
      service.save_session(VAULT_ID, session()),
    ).resolves.toBeUndefined();
  });

  it("hydrates an empty list when the vault has no sessions", async () => {
    const { sessions, store } = make_stores();
    await load_assistant_sessions(sessions, store, make_service(), VAULT_ID);
    expect(store.sessions).toEqual([]);
  });

  it("skips the hydrate when the vault is no longer current (switch race)", async () => {
    const persistence = create_test_assistant_session_persistence_adapter();
    const writer = make_service(persistence);
    await writer.save_session(VAULT_ID, session());

    const { sessions, store } = make_stores();
    await load_assistant_sessions(
      sessions,
      store,
      make_service(persistence),
      VAULT_ID,
      () => false,
    );

    expect(store.sessions).toEqual([]);
  });
});
