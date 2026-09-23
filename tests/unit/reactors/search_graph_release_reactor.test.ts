// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { flushSync } from "svelte";
import type { GraphService } from "$lib/features/graph";
import { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { create_search_graph_release_reactor } from "$lib/reactors/search_graph_release.reactor.svelte";

function open_search_graph(
  tabs: TabStore,
  search_graph: SearchGraphStore,
  tab_id: string,
) {
  search_graph.create_instance(tab_id, "q");
  tabs.open_search_graph_tab(tab_id, "Search: q", "q");
}

function setup() {
  const tabs = new TabStore();
  const search_graph = new SearchGraphStore();
  const graph_service = {
    release_search_graphs: (open: Set<string>) => {
      search_graph.retain_instances(open);
    },
  } as unknown as GraphService;
  const stop = create_search_graph_release_reactor(tabs, graph_service);
  flushSync();
  return { tabs, search_graph, stop };
}

describe("search graph release reactor", () => {
  it("releases the instance of a search graph tab closed from the tab bar", () => {
    const { tabs, search_graph, stop } = setup();
    open_search_graph(tabs, search_graph, "sg-a");
    open_search_graph(tabs, search_graph, "sg-b");
    flushSync();

    tabs.close_tab("sg-a");
    flushSync();

    expect(search_graph.get_instance("sg-a")).toBeUndefined();
    expect(search_graph.get_instance("sg-b")).toBeDefined();
    stop();
  });

  it("releases every instance when all tabs close", () => {
    const { tabs, search_graph, stop } = setup();
    open_search_graph(tabs, search_graph, "sg-a");
    open_search_graph(tabs, search_graph, "sg-b");
    flushSync();

    tabs.close_all_tabs();
    flushSync();

    expect([...search_graph.instances.keys()]).toEqual([]);
    stop();
  });

  it("keeps instances whose tabs stay open", () => {
    const { tabs, search_graph, stop } = setup();
    open_search_graph(tabs, search_graph, "sg-a");
    flushSync();
    const before = search_graph.instances;

    tabs.open_search_graph_tab("sg-a", "Search: q", "q");
    flushSync();

    expect(search_graph.instances).toBe(before);
    stop();
  });
});
