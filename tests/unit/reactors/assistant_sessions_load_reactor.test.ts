// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { AssistantSessionStore } from "$lib/features/assistant";
import { RagStore, load_assistant_sessions } from "$lib/features/rag";
import { VaultStore } from "$lib/features/vault";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import { create_assistant_sessions_load_reactor } from "$lib/reactors/assistant_sessions_load.reactor.svelte";
import { create_test_vault } from "../helpers/test_fixtures";
import type { RagService } from "$lib/features/rag";
import type { AssistantSession } from "$lib/features/assistant";
import type { VaultId } from "$lib/shared/types/ids";

function session(overrides: Partial<AssistantSession> = {}): AssistantSession {
  return {
    id: "s1",
    kind: "chat",
    title: "First chat",
    title_source: "derived",
    origin: {},
    created_at: 100,
    updated_at: 200,
    messages: [],
    provider_id: "ollama",
    scope: {},
    mode: "ask",
    permission_mode: "safe",
    changed_files: [],
    ...overrides,
  };
}

function fake_service(by_vault: Record<string, AssistantSession[]>) {
  return {
    load_all_sessions: vi.fn((vault_id: string) =>
      Promise.resolve(by_vault[vault_id] ?? []),
    ),
    delete_session: vi.fn(() => Promise.resolve()),
  } as unknown as RagService & {
    load_all_sessions: ReturnType<typeof vi.fn>;
    delete_session: ReturnType<typeof vi.fn>;
  };
}

function make_stores() {
  const sessions = new AssistantSessionStore();
  return { sessions, rag: new RagStore(sessions) };
}

function vault_store_for(id: string): VaultStore {
  const store = new VaultStore();
  store.set_vault(create_test_vault({ id: id as VaultId }));
  return store;
}

// Retention off by default here: the fixtures carry epoch-era timestamps, so
// any real cutoff would prune them and mask what these tests assert.
function ui_store_with_retention(days = 0): UIStore {
  const store = new UIStore();
  store.editor_settings.assistant_session_retention_days = days;
  return store;
}

describe("load_assistant_sessions", () => {
  it("hydrates every persisted session into the assistant store", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service({
      v1: [session({ id: "a" }), session({ id: "b" })],
    });

    await load_assistant_sessions(sessions, rag, service, "v1");

    expect(sessions.sessions.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("hydrates sessions of every kind in one pass", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service({
      v1: [
        session({ id: "c", kind: "chat" }),
        session({ id: "i", kind: "inline" }),
        session({ id: "n", kind: "note" }),
      ],
    });

    await load_assistant_sessions(sessions, rag, service, "v1");

    expect(sessions.sessions.map((s) => s.kind)).toEqual([
      "chat",
      "inline",
      "note",
    ]);
  });

  // Re-stamping on load would move every session to "now" on each vault open
  // and destroy recency ordering (AU-010).
  it("preserves stored timestamps and never calls the clock", async () => {
    const clock = vi.fn(() => 999_999);
    const sessions = new AssistantSessionStore(clock);
    const rag = new RagStore(sessions);
    const service = fake_service({
      v1: [session({ id: "a", created_at: 100, updated_at: 200 })],
    });

    await load_assistant_sessions(sessions, rag, service, "v1");

    expect(sessions.sessions[0]).toMatchObject({
      created_at: 100,
      updated_at: 200,
    });
    expect(clock).not.toHaveBeenCalled();
  });

  it("resets chat panel view state pointing at the previous vault", async () => {
    const { sessions, rag } = make_stores();
    rag.active_id = "stale";
    rag.streaming_id = "stale-msg";
    rag.is_loading = true;
    rag.error = "boom";

    await load_assistant_sessions(sessions, rag, fake_service({}), "v1");

    expect(rag.active_id).toBeNull();
    expect(rag.streaming_id).toBeNull();
    expect(rag.is_loading).toBe(false);
    expect(rag.error).toBeNull();
  });

  it("skips the hydrate when the vault is no longer current (switch race)", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service({ v1: [session({ id: "a" })] });

    await load_assistant_sessions(sessions, rag, service, "v1", () => false);

    expect(sessions.sessions).toEqual([]);
  });
});

describe("assistant_sessions_load reactor", () => {
  it("hydrates once when a vault becomes active", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service({ v1: [session({ id: "a" })] });
    const vault_store = vault_store_for("v1");

    const cleanup = create_assistant_sessions_load_reactor(
      sessions,
      rag,
      service,
      vault_store,
      ui_store_with_retention(),
    );
    flushSync();
    await vi.waitFor(() => {
      expect(sessions.sessions.map((s) => s.id)).toEqual(["a"]);
    });

    expect(service.load_all_sessions).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not re-hydrate while the same vault stays active", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service({ v1: [session({ id: "a" })] });
    const vault_store = vault_store_for("v1");

    const cleanup = create_assistant_sessions_load_reactor(
      sessions,
      rag,
      service,
      vault_store,
      ui_store_with_retention(),
    );
    flushSync();
    await vi.waitFor(() => {
      expect(service.load_all_sessions).toHaveBeenCalledTimes(1);
    });

    vault_store.set_vault(create_test_vault({ id: "v1" as VaultId }));
    flushSync();

    expect(service.load_all_sessions).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("clears the store when the active vault goes away", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service({ v1: [session({ id: "a" })] });
    const vault_store = vault_store_for("v1");

    const cleanup = create_assistant_sessions_load_reactor(
      sessions,
      rag,
      service,
      vault_store,
      ui_store_with_retention(),
    );
    flushSync();
    await vi.waitFor(() => {
      expect(sessions.sessions.map((s) => s.id)).toEqual(["a"]);
    });

    vault_store.clear();
    flushSync();

    expect(sessions.sessions).toEqual([]);
    expect(service.load_all_sessions).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not load when no vault has ever been active", () => {
    const { sessions, rag } = make_stores();
    const service = fake_service({});

    const cleanup = create_assistant_sessions_load_reactor(
      sessions,
      rag,
      service,
      new VaultStore(),
      ui_store_with_retention(),
    );
    flushSync();

    expect(sessions.sessions).toEqual([]);
    expect(service.load_all_sessions).not.toHaveBeenCalled();
    cleanup();
  });

  it("replaces one vault's sessions with the next on a switch", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service({
      v1: [session({ id: "a" })],
      v2: [session({ id: "z" })],
    });
    const vault_store = vault_store_for("v1");

    const cleanup = create_assistant_sessions_load_reactor(
      sessions,
      rag,
      service,
      vault_store,
      ui_store_with_retention(),
    );
    flushSync();
    await vi.waitFor(() => {
      expect(sessions.sessions.map((s) => s.id)).toEqual(["a"]);
    });

    vault_store.set_vault(create_test_vault({ id: "v2" as VaultId }));
    flushSync();
    await vi.waitFor(() => {
      expect(sessions.sessions.map((s) => s.id)).toEqual(["z"]);
    });

    cleanup();
  });

  it("applies the configured retention to the sessions it hydrates", async () => {
    const now = 1_000 * 24 * 60 * 60 * 1000;
    const sessions = new AssistantSessionStore(() => now);
    const rag = new RagStore(sessions);
    const day = 24 * 60 * 60 * 1000;
    const service = fake_service({
      v1: [
        session({ id: "fresh", updated_at: now - 5 * day }),
        session({ id: "stale", updated_at: now - 45 * day }),
      ],
    });

    const cleanup = create_assistant_sessions_load_reactor(
      sessions,
      rag,
      service,
      vault_store_for("v1"),
      ui_store_with_retention(30),
    );
    flushSync();
    await vi.waitFor(() => {
      expect(sessions.sessions.map((s) => s.id)).toEqual(["fresh"]);
    });

    expect(service.delete_session).toHaveBeenCalledWith("v1", "stale");
    cleanup();
  });
});
