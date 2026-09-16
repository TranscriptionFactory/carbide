// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import {
  AssistantSessionService,
  AssistantSessionStore,
  to_assistant_session_summary,
} from "$lib/features/assistant";
import type { AssistantScope } from "$lib/features/assistant";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { create_assistant_session_tab_bodies_reactor } from "$lib/reactors/assistant_session_tab_bodies.reactor.svelte";
import { create_test_assistant_session_persistence_adapter } from "../../adapters/test_assistant_session_persistence_adapter";
import { make_session } from "../helpers/assistant_session_fixtures";

const VAULT_ID = "v1";

async function seeded_service(...bodies: ReturnType<typeof make_session>[]) {
  const service = new AssistantSessionService(
    create_test_assistant_session_persistence_adapter(),
    { start: () => Promise.reject(new Error("unused")) },
  );
  for (const body of bodies) await service.save_session(VAULT_ID, body);
  return { service, load_session: vi.spyOn(service, "load_session") };
}

describe("assistant session tab bodies reactor", () => {
  it("loads the body of the shown restored session tab exactly once, migrating it", async () => {
    const body = make_session({
      id: "a",
      provider_id: "claude",
      scope: { folder: "projects" } as unknown as AssistantScope,
    });
    const { service, load_session } = await seeded_service(body);
    const sessions = new AssistantSessionStore();
    sessions.hydrate_summaries([to_assistant_session_summary(body)], VAULT_ID);
    const tabs = new TabStore();
    tabs.open_assistant_session_tab("assistant:a", "Session", "a");

    const stop = create_assistant_session_tab_bodies_reactor(
      tabs,
      sessions,
      service,
    );
    flushSync();
    await vi.waitFor(() => expect(sessions.is_loaded("a")).toBe(true));
    flushSync();

    expect(load_session).toHaveBeenCalledTimes(1);
    expect(sessions.get("a")).toMatchObject({
      provider_id: "claude",
      scope: { folders: ["projects"] },
    });
    stop();
  });

  it("leaves background session tabs unloaded until they are shown", async () => {
    const shown = make_session({ id: "shown" });
    const hidden = make_session({ id: "hidden" });
    const { service, load_session } = await seeded_service(shown, hidden);
    const sessions = new AssistantSessionStore();
    sessions.hydrate_summaries(
      [shown, hidden].map(to_assistant_session_summary),
      VAULT_ID,
    );
    const tabs = new TabStore();
    tabs.open_assistant_session_tab("assistant:hidden", "Session", "hidden");
    tabs.open_assistant_session_tab("assistant:shown", "Session", "shown");

    const stop = create_assistant_session_tab_bodies_reactor(
      tabs,
      sessions,
      service,
    );
    flushSync();
    await vi.waitFor(() => expect(sessions.is_loaded("shown")).toBe(true));
    expect(sessions.is_loaded("hidden")).toBe(false);

    tabs.activate_tab("assistant:hidden");
    flushSync();
    await vi.waitFor(() => expect(sessions.is_loaded("hidden")).toBe(true));
    expect(load_session).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not load a session that is already loaded", async () => {
    const { service, load_session } = await seeded_service();
    const sessions = new AssistantSessionStore();
    const opened = sessions.create({
      kind: "chat",
      title: "Opened",
      provider_id: "claude",
    });
    sessions.hydrate([opened], VAULT_ID);
    const tabs = new TabStore();
    tabs.open_assistant_session_tab("assistant:o", "Session", opened.id);

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
