// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import type { UIStore } from "$lib/app";
import type { GraphService } from "$lib/features/graph";
import { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { create_search_graph_lifecycle_reactor } from "$lib/reactors/search_graph_lifecycle.reactor.svelte";

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
  const ui_store = {
    editor_settings: {
      semantic_similarity_threshold: 0.6,
      reference_include_sources_in_search: false,
    },
  } as unknown as UIStore;
  const ensure_search_graph = vi.fn(
    (tab_id: string, query: string): Promise<void> => {
      if (!search_graph.get_instance(tab_id)) {
        search_graph.create_instance(tab_id, query);
      }
      return Promise.resolve();
    },
  );
  const graph_service = {
    release_search_graphs: (open: Set<string>) => {
      search_graph.retain_instances(open);
    },
    ensure_search_graph,
  } as unknown as GraphService;
  const stop = create_search_graph_lifecycle_reactor(
    tabs,
    ui_store,
    graph_service,
  );
  flushSync();
  return { tabs, search_graph, ensure_search_graph, stop };
}

describe("search graph lifecycle reactor", () => {
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

  it("brings up restored search graph tabs with the current search settings", () => {
    const { tabs, search_graph, ensure_search_graph, stop } = setup();

    tabs.restore_tabs(
      [
        {
          kind: "search_graph",
          id: "sg-a",
          query: "alpha",
          title: "Search: alpha",
          is_pinned: false,
          is_dirty: false,
          pane: "primary",
        },
      ],
      "sg-a",
    );
    flushSync();

    expect(ensure_search_graph).toHaveBeenCalledWith(
      "sg-a",
      "alpha",
      0.6,
      false,
    );
    expect(search_graph.get_instance("sg-a")?.query).toBe("alpha");
    stop();
  });
});
