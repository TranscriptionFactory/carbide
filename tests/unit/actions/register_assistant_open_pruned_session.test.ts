import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import {
  AssistantSessionStore,
  register_assistant_actions,
} from "$lib/features/assistant";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000 * DAY;

function create_harness() {
  const registry = new ActionRegistry();
  const sessions = new AssistantSessionStore(() => NOW);
  const tab = new TabStore();
  register_assistant_actions({
    registry,
    stores: { tab } as never,
    services: {} as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    assistant_kernel: { stop: vi.fn(), stop_all: vi.fn() } as never,
    assistant_sessions: sessions,
    assistant_proposals: { set_hunk_selected: vi.fn() } as never,
    proposal_apply: {
      apply_batch: vi.fn(),
      reject_batch: vi.fn(),
    } as never,
  });
  return { registry, sessions, tab };
}

// Prune is what makes a session id go stale, so this is the prune-side half of
// AU-013's empty state: nothing crashes, and no dead tab is opened.
describe("opening a session that pruning removed", () => {
  it("opens nothing rather than a tab with no session behind it", async () => {
    const { registry, sessions, tab } = create_harness();
    const stale = sessions.create({
      kind: "inline",
      title: "Old inline edit",
      provider_id: "ollama",
    });
    sessions.hydrate([{ ...stale, updated_at: NOW - 90 * DAY }]);

    expect(sessions.prune(30 * DAY)).toEqual([stale.id]);
    expect(sessions.get(stale.id)).toBeNull();

    await registry.execute(ACTION_IDS.assistant_open_session, stale.id);

    expect(tab.tabs).toEqual([]);
  });

  it("still opens a session that pruning spared", async () => {
    const { registry, sessions, tab } = create_harness();
    const live = sessions.create({
      kind: "inline",
      title: "Recent inline edit",
      provider_id: "ollama",
    });

    expect(sessions.prune(30 * DAY)).toEqual([]);

    await registry.execute(ACTION_IDS.assistant_open_session, live.id);

    expect(tab.tabs).toHaveLength(1);
    expect(tab.tabs[0]).toMatchObject({
      kind: "assistant_session",
      session_id: live.id,
    });
  });
});
