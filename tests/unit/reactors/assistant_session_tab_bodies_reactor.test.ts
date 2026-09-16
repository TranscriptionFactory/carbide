// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import {
  AssistantSessionStore,
  to_assistant_session_summary,
} from "$lib/features/assistant";
import type { AssistantSessionService } from "$lib/features/assistant";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { create_assistant_session_tab_bodies_reactor } from "$lib/reactors/assistant_session_tab_bodies.reactor.svelte";
import { make_session } from "../helpers/assistant_session_fixtures";

function fake_service(bodies: Record<string, ReturnType<typeof make_session>>) {
  const load_session = vi.fn((_vault_id: string, id: string) =>
    Promise.resolve(bodies[id] ?? null),
  );
  return {
    service: { load_session } as unknown as AssistantSessionService,
    load_session,
  };
}

describe("assistant session tab bodies reactor", () => {
  it("loads the body of a restored session tab exactly once", async () => {
    const sessions = new AssistantSessionStore();
    const body = make_session({ id: "a", provider_id: "claude" });
    sessions.hydrate_summaries([to_assistant_session_summary(body)], "v1");
    const tabs = new TabStore();
    tabs.open_assistant_session_tab("assistant:a", "Session", "a");
    const { service, load_session } = fake_service({ a: body });

    const stop = create_assistant_session_tab_bodies_reactor(
      tabs,
      sessions,
      service,
    );
    flushSync();
    await vi.waitFor(() => expect(sessions.is_loaded("a")).toBe(true));
    flushSync();

    expect(load_session).toHaveBeenCalledTimes(1);
    expect(load_session).toHaveBeenCalledWith("v1", "a");
    expect(sessions.get("a")?.provider_id).toBe("claude");
    stop();
  });

  it("does not load a session that is already loaded or not a tab", () => {
    const sessions = new AssistantSessionStore();
    const opened = sessions.create({
      kind: "chat",
      title: "Opened",
      provider_id: "claude",
    });
    sessions.hydrate([opened, make_session({ id: "listed-only" })], "v1");
    const tabs = new TabStore();
    tabs.open_assistant_session_tab("assistant:o", "Session", opened.id);
    const { service, load_session } = fake_service({});

    const stop = create_assistant_session_tab_bodies_reactor(
      tabs,
      sessions,
      service,
    );
    flushSync();

    expect(load_session).not.toHaveBeenCalled();
    stop();
  });
});
