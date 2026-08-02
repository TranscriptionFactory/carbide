import { describe, expect, it, vi } from "vitest";
import {
  AssistantChatStore,
  AssistantSessionStore,
  load_assistant_sessions,
} from "$lib/features/assistant";
import type {
  AssistantSession,
  AssistantSessionService,
} from "$lib/features/assistant";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;

function session(overrides: Partial<AssistantSession> = {}): AssistantSession {
  return {
    id: "s1",
    kind: "inline",
    title: "Rewrite this",
    title_source: "derived",
    origin: {},
    created_at: NOW,
    updated_at: NOW,
    messages: [],
    provider_id: "ollama",
    scope: {},
    mode: "ask",
    permission_mode: "safe",
    changed_files: [],
    ...overrides,
  };
}

function fake_service(
  loaded: AssistantSession[],
  delete_session = vi.fn(() => Promise.resolve()),
) {
  return {
    load_all_sessions: vi.fn(() => Promise.resolve(loaded)),
    delete_session,
  } as unknown as AssistantSessionService & {
    delete_session: ReturnType<typeof vi.fn>;
  };
}

function make_stores() {
  const sessions = new AssistantSessionStore(() => NOW);
  return { sessions, rag: new AssistantChatStore(sessions) };
}

describe("assistant session pruning at hydration", () => {
  it("removes store entries older than the cutoff and deletes their files", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service([
      session({ id: "old-a", updated_at: NOW - 45 * DAY }),
      session({ id: "old-b", updated_at: NOW - 31 * DAY }),
    ]);

    await load_assistant_sessions(sessions, rag, service, "v1", () => true, 30);

    expect(sessions.sessions).toEqual([]);
    expect(service.delete_session).toHaveBeenCalledWith("v1", "old-a");
    expect(service.delete_session).toHaveBeenCalledWith("v1", "old-b");
    expect(service.delete_session).toHaveBeenCalledTimes(2);
  });

  it("keeps sessions younger than the cutoff and deletes nothing for them", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service([
      session({ id: "yesterday", updated_at: NOW - DAY }),
      session({ id: "just-inside", updated_at: NOW - 29 * DAY }),
    ]);

    await load_assistant_sessions(sessions, rag, service, "v1", () => true, 30);

    expect(sessions.sessions.map((s) => s.id)).toEqual([
      "yesterday",
      "just-inside",
    ]);
    expect(service.delete_session).not.toHaveBeenCalled();
  });

  // Age is measured from last use, not creation — an old thread picked up
  // yesterday is live.
  it("spares an old session that was used recently", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service([
      session({ id: "revived", created_at: NOW - 400 * DAY, updated_at: NOW }),
    ]);

    await load_assistant_sessions(sessions, rag, service, "v1", () => true, 30);

    expect(sessions.sessions.map((s) => s.id)).toEqual(["revived"]);
    expect(service.delete_session).not.toHaveBeenCalled();
  });

  it("prunes nothing when retention is Never", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service([
      session({ id: "ancient", updated_at: NOW - 4_000 * DAY }),
    ]);

    await load_assistant_sessions(sessions, rag, service, "v1", () => true, 0);

    expect(sessions.sessions.map((s) => s.id)).toEqual(["ancient"]);
    expect(service.delete_session).not.toHaveBeenCalled();
  });

  it("prunes nothing when no retention is supplied", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service([
      session({ id: "ancient", updated_at: NOW - 4_000 * DAY }),
    ]);

    await load_assistant_sessions(sessions, rag, service, "v1");

    expect(sessions.sessions.map((s) => s.id)).toEqual(["ancient"]);
    expect(service.delete_session).not.toHaveBeenCalled();
  });

  it("prunes every kind, not just inline sessions", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service([
      session({ id: "c", kind: "chat", updated_at: NOW - 90 * DAY }),
      session({ id: "n", kind: "note", updated_at: NOW - 90 * DAY }),
      session({ id: "i", kind: "inline", updated_at: NOW - 90 * DAY }),
    ]);

    await load_assistant_sessions(sessions, rag, service, "v1", () => true, 30);

    expect(sessions.sessions).toEqual([]);
    expect(service.delete_session).toHaveBeenCalledTimes(3);
  });

  // Deletes go through AssistantSessionService, not the port, because the service is the
  // error boundary that swallows and logs a failed delete — hydration must not
  // be able to die on a bad file.
  it("deletes through AssistantSessionService and does not wait on it", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service(
      [session({ id: "old", updated_at: NOW - 90 * DAY })],
      // never settles: hydration finishing anyway is the assertion
      vi.fn(() => new Promise<void>(() => {})),
    );

    await load_assistant_sessions(sessions, rag, service, "v1", () => true, 30);

    expect(sessions.sessions).toEqual([]);
    expect(service.delete_session).toHaveBeenCalledWith("v1", "old");
  });

  it("prunes nothing when the vault switched away mid-load", async () => {
    const { sessions, rag } = make_stores();
    const service = fake_service([
      session({ id: "old", updated_at: NOW - 90 * DAY }),
    ]);

    await load_assistant_sessions(
      sessions,
      rag,
      service,
      "v1",
      () => false,
      30,
    );

    expect(sessions.sessions).toEqual([]);
    expect(service.delete_session).not.toHaveBeenCalled();
  });
});
