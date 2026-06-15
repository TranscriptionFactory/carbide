import { describe, expect, it } from "vitest";
import { RagService, RagStore } from "$lib/features/rag";
import { VaultStore } from "$lib/features/vault";
import { load_rag_sessions } from "$lib/reactors/rag_sessions_load.reactor.svelte";
import { create_test_rag_persistence_adapter } from "../../adapters/test_rag_persistence_adapter";
import { create_test_vault } from "../helpers/test_fixtures";
import type { RagSession } from "$lib/features/rag/domain/rag_types";

const VAULT_ID = "v1";

function make_service(persistence = create_test_rag_persistence_adapter()) {
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault({ path: "/vault/demo" as never }));
  return new RagService(
    { hybrid_search: () => Promise.resolve([]) } as never,
    { read_note: () => Promise.resolve({ markdown: "" }) } as never,
    { stream_text: () => (async function* () {})(), abort: () => {} } as never,
    vault_store,
    persistence,
    { get_notes_for_tag: () => Promise.resolve([]) } as never,
  );
}

function session(overrides: Partial<RagSession> = {}): RagSession {
  return {
    id: "s1",
    title: "First chat",
    created_at: 1,
    updated_at: 2,
    messages: [
      { id: "m1", role: "user", content: "what is X?", citations: [] },
      { id: "m2", role: "assistant", content: "X is Y [1].", citations: [] },
    ],
    provider_id: "ollama",
    scope: { folder: "projects/" },
    ...overrides,
  };
}

describe("rag session persistence round-trip", () => {
  it("restores prior sessions and their messages into a fresh store", async () => {
    const persistence = create_test_rag_persistence_adapter();
    const writer = make_service(persistence);
    await writer.save_session(VAULT_ID, session({ id: "a", updated_at: 10 }));
    await writer.save_session(VAULT_ID, session({ id: "b", updated_at: 20 }));

    const reader = make_service(persistence);
    const store = new RagStore();
    await load_rag_sessions(store, reader, VAULT_ID);

    expect(store.summaries.map((s) => s.id)).toEqual(["b", "a"]);

    store.switch_session("a");
    expect(store.messages).toEqual(session({ id: "a" }).messages);
    expect(store.provider_id).toBe("ollama");
    expect(store.scope).toEqual({ folder: "projects/" });
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
    const store = new RagStore();
    await load_rag_sessions(store, make_service(), VAULT_ID);
    expect(store.sessions).toEqual([]);
  });

  it("skips the hydrate when the vault is no longer current (switch race)", async () => {
    const persistence = create_test_rag_persistence_adapter();
    const writer = make_service(persistence);
    await writer.save_session(VAULT_ID, session());

    const store = new RagStore();
    await load_rag_sessions(
      store,
      make_service(persistence),
      VAULT_ID,
      () => false,
    );

    expect(store.sessions).toEqual([]);
  });
});
