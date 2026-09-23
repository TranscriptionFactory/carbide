import { describe, expect, it, vi } from "vitest";
import { TabService } from "$lib/features/tab/application/tab_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { as_vault_id } from "$lib/shared/types/ids";
import type { PersistedTabState } from "$lib/features/tab";
import { create_test_vault } from "../../helpers/test_fixtures";

function create_setup() {
  const vault_settings_port = {
    get_vault_setting: vi.fn().mockResolvedValue(null),
    set_vault_setting: vi.fn().mockResolvedValue(undefined),
    get_local_setting: vi.fn().mockResolvedValue(null),
    set_local_setting: vi.fn().mockResolvedValue(undefined),
  };
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault({ id: as_vault_id("vault-a") }));
  const tab_store = new TabStore();
  const note_service = {
    open_note: vi.fn().mockResolvedValue({ status: "opened" }),
    read_note: vi.fn(),
  };
  const service = new TabService(
    vault_settings_port as never,
    vault_store,
    tab_store,
    new NotesStore(),
    note_service as never,
  );
  return { service, vault_settings_port, tab_store, note_service };
}

async function saved_state(
  service: TabService,
  port: ReturnType<typeof create_setup>["vault_settings_port"],
): Promise<PersistedTabState> {
  await service.save_tabs();
  const [, , state] = port.set_local_setting.mock.calls.at(-1) as [
    unknown,
    unknown,
    PersistedTabState,
  ];
  return state;
}

describe("search graph tab query", () => {
  it("set_search_graph_query updates the query and title of the tab", () => {
    const { tab_store } = create_setup();
    tab_store.open_search_graph_tab("sg-1", "Search: old", "old");

    tab_store.set_search_graph_query("sg-1", "new", "Search: new");

    expect(tab_store.tabs[0]).toMatchObject({
      kind: "search_graph",
      query: "new",
      title: "Search: new",
    });
  });

  it("set_search_graph_query leaves the tab list untouched when nothing changed", () => {
    const { tab_store } = create_setup();
    tab_store.open_search_graph_tab("sg-1", "Search: q", "q");
    const before = tab_store.tabs;

    tab_store.set_search_graph_query("sg-1", "q", "Search: q");

    expect(tab_store.tabs).toBe(before);
  });

  it("set_search_graph_query ignores tabs of other kinds", () => {
    const { tab_store } = create_setup();
    tab_store.open_graph_tab("__graph__", "Vault Graph");
    const before = tab_store.tabs;

    tab_store.set_search_graph_query("__graph__", "q", "Search: q");

    expect(tab_store.tabs).toBe(before);
  });
});

describe("restore_tabs for search_graph tabs", () => {
  it("round-trips id, query and active state through save and restore", async () => {
    const first = create_setup();
    first.tab_store.open_search_graph_tab("sg-a", "Search: a", "a");
    first.tab_store.open_search_graph_tab("sg-b", "Search: b", "b");
    first.tab_store.activate_tab("sg-a");
    const state = await saved_state(first.service, first.vault_settings_port);

    const second = create_setup();
    await second.service.restore_tabs(state);

    expect(second.tab_store.tabs.map((t) => t.id)).toEqual(["sg-a", "sg-b"]);
    expect(second.tab_store.active_tab_id).toBe("sg-a");
    expect(second.tab_store.tabs[0]).toMatchObject({
      kind: "search_graph",
      query: "a",
      title: "Search: a",
    });
    expect(second.note_service.open_note).not.toHaveBeenCalled();
  });

  it("persists an edited query", async () => {
    const { service, vault_settings_port, tab_store } = create_setup();
    tab_store.open_search_graph_tab("sg-a", "Search: a", "a");
    tab_store.set_search_graph_query("sg-a", "edited", "Search: edited");

    const state = await saved_state(service, vault_settings_port);

    expect(state.tabs[0]).toMatchObject({
      kind: "search_graph",
      id: "sg-a",
      query: "edited",
    });
  });

  it("titles a restored tab with an empty query as a plain search graph", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs({
      tabs: [
        {
          kind: "search_graph",
          id: "sg-a",
          query: "",
          is_pinned: false,
          cursor: null,
        },
      ],
      active_tab_path: "sg-a",
    });

    expect(tab_store.tabs[0]?.title).toBe("Search Graph");
  });

  it("generates an id for tabs persisted without one", async () => {
    const { service, tab_store } = create_setup();

    await service.restore_tabs({
      tabs: [
        { kind: "search_graph", query: "q", is_pinned: false, cursor: null },
      ],
      active_tab_path: null,
    });

    expect(tab_store.tabs[0]?.id).toMatch(/^__search_graph__.+__$/);
  });
});
