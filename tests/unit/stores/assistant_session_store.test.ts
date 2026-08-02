import { describe, expect, it } from "vitest";
import { AssistantSessionStore } from "$lib/features/assistant";
import type { AssistantSessionCreate } from "$lib/features/assistant";
import {
  make_session,
  make_session_message,
} from "../helpers/assistant_session_fixtures";

const DAY_MS = 24 * 60 * 60 * 1000;

// Every timestamp in the store comes from here, so a test states the clock it
// wants instead of sleeping.
function create_clock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    reads: 0,
    advance(by: number) {
      current += by;
    },
    set(to: number) {
      current = to;
    },
  };
}

function counting_clock(start = 1_000) {
  const clock = create_clock(start);
  const now = () => {
    clock.reads += 1;
    return clock.now();
  };
  return { clock, now };
}

function create_store(start = 1_000) {
  const clock = create_clock(start);
  return { store: new AssistantSessionStore(clock.now), clock };
}

function chat(overrides: Partial<AssistantSessionCreate> = {}) {
  return {
    kind: "chat" as const,
    title: "How do backlinks work?",
    provider_id: "claude",
    ...overrides,
  };
}

describe("AssistantSessionStore", () => {
  describe("create", () => {
    it("stamps both timestamps from the clock and defaults every unset field", () => {
      const { store, clock } = create_store(5_000);

      const session = store.create(chat());

      expect(session.created_at).toBe(5_000);
      expect(session.updated_at).toBe(5_000);
      expect(session.title_source).toBe("derived");
      expect(session.messages).toEqual([]);
      expect(session.origin).toEqual({});
      expect(session.scope).toEqual({});
      expect(session.mode).toBe("ask");
      expect(session.permission_mode).toBe("safe");
      expect(session.changed_files).toEqual([]);
      expect(clock.now()).toBe(5_000);
    });

    it("carries the caller's origin, scope, mode and permission mode through", () => {
      const { store } = create_store();

      const session = store.create(
        chat({
          kind: "note",
          origin: { note_path: "notes/a.md" },
          scope: { folders: ["projects/"] },
          mode: "agent",
          permission_mode: "power",
        }),
      );

      expect(session.kind).toBe("note");
      expect(session.origin).toEqual({ note_path: "notes/a.md" });
      expect(session.scope).toEqual({ folders: ["projects/"] });
      expect(session.mode).toBe("agent");
      expect(session.permission_mode).toBe("power");
    });

    it("makes the session readable through get, summaries and of_kind", () => {
      const { store } = create_store();

      const session = store.create(chat());

      expect(store.get(session.id)).toEqual(session);
      expect(store.of_kind("chat")).toEqual([session]);
      expect(store.summaries).toEqual([
        {
          id: session.id,
          kind: "chat",
          title: "How do backlinks work?",
          created_at: 1_000,
          updated_at: 1_000,
        },
      ]);
    });

    it("mints distinct ids under a frozen clock", () => {
      const { store } = create_store();

      const first = store.create(chat());
      const second = store.create(chat());

      expect(first.id).not.toBe(second.id);
      expect(store.sessions).toHaveLength(2);
    });
  });

  describe("append_message", () => {
    it("appends and bumps updated_at without touching created_at", () => {
      const { store, clock } = create_store(1_000);
      const session = store.create(chat());
      clock.advance(500);

      store.append_message(session.id, make_session_message());

      const live = store.get(session.id);
      expect(live?.messages).toHaveLength(1);
      expect(live?.created_at).toBe(1_000);
      expect(live?.updated_at).toBe(1_500);
    });

    it("is a no-op on an unknown session id", () => {
      const { store } = create_store();
      store.create(chat());

      expect(() => {
        store.append_message("missing", make_session_message());
      }).not.toThrow();
      expect(store.sessions[0]?.messages).toEqual([]);
    });
  });

  describe("update_message", () => {
    it("merges changes into the matching message only and bumps updated_at", () => {
      const { store, clock } = create_store(1_000);
      const session = store.create(chat());
      const first = make_session_message({ content: "one" });
      const second = make_session_message({ content: "two" });
      store.append_message(session.id, first);
      store.append_message(session.id, second);
      clock.advance(700);

      store.update_message(session.id, second.id, { content: "two edited" });

      const live = store.get(session.id);
      expect(live?.messages[0]?.content).toBe("one");
      expect(live?.messages[1]?.content).toBe("two edited");
      expect(live?.updated_at).toBe(1_700);
    });

    it("leaves the session untouched and does not bump when the message is unknown", () => {
      const { store, clock } = create_store(1_000);
      const session = store.create(chat());
      store.append_message(session.id, make_session_message());
      const before = store.get(session.id);
      clock.advance(900);

      store.update_message(session.id, "missing", { content: "nope" });

      expect(store.get(session.id)).toEqual(before);
      expect(store.get(session.id)?.updated_at).toBe(1_000);
    });

    it("refuses to rewrite a message id", () => {
      const { store } = create_store();
      const session = store.create(chat());
      const message = make_session_message();
      store.append_message(session.id, message);

      store.update_message(session.id, message.id, {
        id: "hijacked",
        content: "edited",
      });

      expect(store.get(session.id)?.messages[0]?.id).toBe(message.id);
      expect(store.get(session.id)?.messages[0]?.content).toBe("edited");
    });
  });

  describe("replace_messages", () => {
    it("swaps the whole array and bumps updated_at", () => {
      const { store, clock } = create_store(1_000);
      const session = store.create(chat());
      store.append_message(session.id, make_session_message());
      const replacement = make_session_message({ content: "fresh" });
      clock.advance(300);

      store.replace_messages(session.id, [replacement]);

      expect(store.get(session.id)?.messages).toEqual([replacement]);
      expect(store.get(session.id)?.updated_at).toBe(1_300);
    });

    it("accepts an empty array as a truncation to nothing", () => {
      const { store } = create_store();
      const session = store.create(chat());
      store.append_message(session.id, make_session_message());

      store.replace_messages(session.id, []);

      expect(store.get(session.id)?.messages).toEqual([]);
    });
  });

  describe("patch_session", () => {
    it("applies whitelisted fields and bumps updated_at", () => {
      const { store, clock } = create_store(1_000);
      const session = store.create(chat());
      clock.advance(250);

      store.patch_session(session.id, {
        provider_id: "ollama",
        mode: "agent",
        changed_files: ["notes/a.md"],
        agent_session_id: "agent-1",
      });

      const live = store.get(session.id);
      expect(live?.provider_id).toBe("ollama");
      expect(live?.mode).toBe("agent");
      expect(live?.changed_files).toEqual(["notes/a.md"]);
      expect(live?.agent_session_id).toBe("agent-1");
      expect(live?.updated_at).toBe(1_250);
    });

    it("does not bump updated_at for an empty patch", () => {
      const { store, clock } = create_store(1_000);
      const session = store.create(chat());
      clock.advance(400);

      store.patch_session(session.id, {});

      expect(store.get(session.id)?.updated_at).toBe(1_000);
    });

    it("is a no-op on an unknown session id", () => {
      const { store } = create_store();
      const session = store.create(chat());

      store.patch_session("missing", { provider_id: "ollama" });

      expect(store.get(session.id)?.provider_id).toBe("claude");
    });
  });

  describe("rename", () => {
    it("trims the title and defaults the source to manual", () => {
      const { store, clock } = create_store(1_000);
      const session = store.create(chat());
      clock.advance(100);

      store.rename(session.id, "  Caching notes  ");

      const live = store.get(session.id);
      expect(live?.title).toBe("Caching notes");
      expect(live?.title_source).toBe("manual");
      expect(live?.updated_at).toBe(1_100);
    });

    it("records a generated title so autotitling stops firing", () => {
      const { store } = create_store();
      const session = store.create(chat());

      store.rename(session.id, "Caching notes", "generated");

      expect(store.get(session.id)?.title_source).toBe("generated");
    });

    it("rejects a whitespace-only title without mutating or bumping", () => {
      const { store, clock } = create_store(1_000);
      const session = store.create(chat());
      clock.advance(100);

      store.rename(session.id, "   ");

      const live = store.get(session.id);
      expect(live?.title).toBe("How do backlinks work?");
      expect(live?.title_source).toBe("derived");
      expect(live?.updated_at).toBe(1_000);
    });
  });

  describe("delete_session", () => {
    it("removes the target and leaves the others alone", () => {
      const { store } = create_store();
      const first = store.create(chat({ title: "one" }));
      const second = store.create(chat({ title: "two" }));

      store.delete_session(first.id);

      expect(store.get(first.id)).toBeNull();
      expect(store.sessions).toEqual([second]);
    });

    it("is a no-op on an unknown session id", () => {
      const { store } = create_store();
      store.create(chat());

      store.delete_session("missing");

      expect(store.sessions).toHaveLength(1);
    });
  });

  describe("hydrate", () => {
    // Re-stamping on load would move every session to "now" on each vault
    // open and destroy the recency ordering the session list renders by.
    it("preserves stored timestamps and never reads the clock", () => {
      const { clock, now } = counting_clock();
      const store = new AssistantSessionStore(now);
      const stored = make_session({ created_at: 10, updated_at: 20 });

      store.hydrate([stored]);

      expect(store.get(stored.id)?.created_at).toBe(10);
      expect(store.get(stored.id)?.updated_at).toBe(20);
      expect(clock.reads).toBe(0);
    });

    it("clears the store when given nothing", () => {
      const { store } = create_store();
      store.create(chat());

      store.hydrate([]);

      expect(store.sessions).toEqual([]);
    });

    it("replaces rather than merges", () => {
      const { store } = create_store();
      const first = make_session({ id: "a" });
      const second = make_session({ id: "b" });

      store.hydrate([first]);
      store.hydrate([second]);

      expect(store.sessions).toEqual([second]);
    });
  });

  describe("prune", () => {
    it("removes sessions stale by last use and returns their ids", () => {
      const { clock, now } = counting_clock();
      const store = new AssistantSessionStore(now);
      clock.set(100 * DAY_MS);
      store.hydrate([
        make_session({ id: "stale", updated_at: 10 * DAY_MS }),
        make_session({ id: "fresh", updated_at: 99 * DAY_MS }),
      ]);

      const pruned = store.prune(30 * DAY_MS);

      expect(pruned).toEqual(["stale"]);
      expect(store.sessions.map((session) => session.id)).toEqual(["fresh"]);
    });

    // An old thread picked up yesterday is live, so age is measured from last
    // use rather than creation.
    it("keeps an old session that was used recently", () => {
      const { clock, now } = counting_clock();
      const store = new AssistantSessionStore(now);
      clock.set(100 * DAY_MS);
      store.hydrate([
        make_session({
          id: "revived",
          created_at: 1 * DAY_MS,
          updated_at: 99 * DAY_MS,
        }),
      ]);

      expect(store.prune(30 * DAY_MS)).toEqual([]);
      expect(store.sessions).toHaveLength(1);
    });

    it("returns nothing and mutates nothing when everything is fresh", () => {
      const { clock, now } = counting_clock();
      const store = new AssistantSessionStore(now);
      clock.set(100 * DAY_MS);
      const sessions = [make_session({ id: "a", updated_at: 99 * DAY_MS })];
      store.hydrate(sessions);

      expect(store.prune(30 * DAY_MS)).toEqual([]);
      expect(store.sessions).toEqual(sessions);
    });

    it("keeps a session sitting exactly on the cutoff", () => {
      const { clock, now } = counting_clock();
      const store = new AssistantSessionStore(now);
      clock.set(100 * DAY_MS);
      store.hydrate([make_session({ id: "edge", updated_at: 70 * DAY_MS })]);

      expect(store.prune(30 * DAY_MS)).toEqual([]);
      expect(store.sessions).toHaveLength(1);
    });

    it("prunes only the stale entries of a hydrated set and preserves order", () => {
      const { clock, now } = counting_clock();
      const store = new AssistantSessionStore(now);
      clock.set(100 * DAY_MS);
      store.hydrate([
        make_session({ id: "a", updated_at: 99 * DAY_MS }),
        make_session({ id: "b", updated_at: 1 * DAY_MS }),
        make_session({ id: "c", updated_at: 98 * DAY_MS }),
      ]);

      expect(store.prune(30 * DAY_MS)).toEqual(["b"]);
      expect(store.sessions.map((session) => session.id)).toEqual(["a", "c"]);
    });
  });

  // A stray Date.now() would still pass every assertion above; only counting
  // the injected clock's reads catches it.
  it("takes every timestamp from the injected clock", () => {
    const { clock, now } = counting_clock(4_000);
    const store = new AssistantSessionStore(now);

    const session = store.create(chat());
    store.append_message(session.id, make_session_message());
    store.rename(session.id, "Renamed");

    expect(clock.reads).toBe(3);
    expect(store.get(session.id)?.updated_at).toBe(4_000);
  });
});
