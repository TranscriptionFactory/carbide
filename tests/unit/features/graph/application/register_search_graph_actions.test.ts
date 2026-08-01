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
  } as unknown as GraphService;

  register_search_graph_actions({
    registry,
    stores: { tab: {}, editor: {} },
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
    ).toHaveBeenCalledWith("tab-1");
  });

  it("ignores non-string payloads", async () => {
    const { execute, graph_service } = setup();

    await execute(ACTION_IDS.search_graph_toggle_semantic, { tab_id: "tab-1" });

    expect(
      graph_service.toggle_search_graph_semantic_edges,
    ).not.toHaveBeenCalled();
  });
});
