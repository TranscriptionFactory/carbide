// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { create_tab_persist_reactor } from "$lib/reactors/tab_persist.reactor.svelte";
import type { TabService } from "$lib/features/tab";
import { create_test_vault } from "../helpers/test_fixtures";

describe("tab_persist search graph query", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves again when a search graph tab's query changes", async () => {
    const vault_store = new VaultStore();
    const tab_store = new TabStore();
    const save_tabs = vi.fn().mockResolvedValue(undefined);
    vault_store.set_vault(create_test_vault());
    tab_store.open_search_graph_tab("sg-a", "Search: a", "a");
    const cleanup = create_tab_persist_reactor(tab_store, vault_store, {
      save_tabs,
    } as unknown as TabService);
    flushSync();
    await vi.advanceTimersByTimeAsync(1100);
    save_tabs.mockClear();

    tab_store.set_search_graph_query("sg-a", "b", "Search: b");
    flushSync();
    await vi.advanceTimersByTimeAsync(1100);

    expect(save_tabs).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
