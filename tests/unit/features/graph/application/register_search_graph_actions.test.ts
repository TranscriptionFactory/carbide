/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from "vitest";
import { register_search_graph_actions } from "$lib/features/graph/application/search_graph_actions";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
import type { GraphService } from "$lib/features/graph/application/graph_service";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";

type Handler = (payload?: unknown) => unknown;

function setup() {
  const handlers = new Map<string, Handler>();
  const registry = {
    register: vi.fn((definition: { id: string; execute: Handler }) => {
      handlers.set(definition.id, definition.execute);
    }),
  } as unknown as ActionRegistry;

  const search_graph_store = new SearchGraphStore();
  const graph_service = {
    toggle_search_graph_semantic_edges: vi.fn().mockResolvedValue(undefined),
    toggle_search_graph_smart_link_edges: vi.fn().mockResolvedValue(undefined),
    execute_search_graph: vi.fn().mockResolvedValue(undefined),
  } as unknown as GraphService;

  register_search_graph_actions({
    registry,
    stores: {
      tab: {},
      editor: {},
      ui: {
        editor_settings: {
          semantic_similarity_threshold: 0.5,
          reference_include_sources_in_search: true,
        },
      },
    },
    search_graph_store,
    graph_service,
  } as never);

  const execute = async (id: string, payload?: unknown) => {
    await handlers.get(id)?.(payload);
  };

  return { execute, search_graph_store, graph_service };
}

describe("register_search_graph_actions semantic toggle", () => {
  it("delegates the toggle to the service so edges compute lazily", async () => {
    const { execute, graph_service } = setup();

    await execute(ACTION_IDS.search_graph_toggle_semantic, "tab-1");

    expect(
      graph_service.toggle_search_graph_semantic_edges,
    ).toHaveBeenCalledWith("tab-1", 0.5);
  });

  it("ignores non-string payloads", async () => {
    const { execute, graph_service } = setup();

    await execute(ACTION_IDS.search_graph_toggle_semantic, { tab_id: "tab-1" });

    expect(
      graph_service.toggle_search_graph_semantic_edges,
    ).not.toHaveBeenCalled();
  });
});

describe("register_search_graph_actions smart link toggle", () => {
  it("delegates the toggle to the service so edges load on demand", async () => {
    const { execute, graph_service } = setup();

    await execute(ACTION_IDS.search_graph_toggle_smart_links, "tab-1");

    expect(
      graph_service.toggle_search_graph_smart_link_edges,
    ).toHaveBeenCalledWith("tab-1");
  });
});

describe("register_search_graph_actions folder scope", () => {
  it("sets the per-tab folder scope and re-runs the search", async () => {
    const { execute, search_graph_store, graph_service } = setup();
    search_graph_store.create_instance("tab-1", "react");

    await execute(ACTION_IDS.search_graph_set_folder_scope, {
      tab_id: "tab-1",
      folder_path: "Projects",
    });

    expect(search_graph_store.get_instance("tab-1")?.folder_scope).toBe(
      "Projects",
    );
    expect(graph_service.execute_search_graph).toHaveBeenCalledWith(
      "tab-1",
      "react",
      0.5,
      true,
    );
  });

  it("clears the folder scope and skips re-running without a query", async () => {
    const { execute, search_graph_store, graph_service } = setup();
    search_graph_store.create_instance("tab-1", "");

    await execute(ACTION_IDS.search_graph_set_folder_scope, {
      tab_id: "tab-1",
      folder_path: null,
    });

    expect(search_graph_store.get_instance("tab-1")?.folder_scope).toBeNull();
    expect(graph_service.execute_search_graph).not.toHaveBeenCalled();
  });
});
