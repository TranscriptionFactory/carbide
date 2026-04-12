import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { GraphService } from "$lib/features/graph/application/graph_service";
import type { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";

export function register_search_graph_actions(
  input: ActionRegistrationInput & {
    search_graph_store: SearchGraphStore;
    graph_service: GraphService;
  },
) {
  const { registry, stores, search_graph_store, graph_service } = input;

  registry.register({
    id: ACTION_IDS.search_graph_open,
    label: "Open Search Graph",
    execute: async (payload: unknown) => {
      const { query = "" } = (payload ?? {}) as { query?: string };
      const tab_id = `__search_graph__${crypto.randomUUID().slice(0, 8)}__`;
      search_graph_store.create_instance(tab_id, query);
      stores.tab.open_search_graph_tab(
        tab_id,
        query ? `Search: ${query}` : "Search Graph",
        query,
      );
      stores.editor.clear_open_note();
      if (query) {
        await graph_service.execute_search_graph(tab_id, query);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_execute,
    label: "Execute Search Graph Query",
    execute: async (payload: unknown) => {
      const { tab_id, query } = (payload ?? {}) as {
        tab_id?: string;
        query?: string;
      };
      if (!tab_id || !query) return;
      await graph_service.execute_search_graph(tab_id, query);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_select_node,
    label: "Select Search Graph Node",
    execute: (payload: unknown) => {
      const { tab_id, node_id = null } = (payload ?? {}) as {
        tab_id?: string;
        node_id?: string | null;
      };
      if (!tab_id) return;
      graph_service.select_search_graph_node(tab_id, node_id ?? null);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_hover_node,
    label: "Hover Search Graph Node",
    execute: (payload: unknown) => {
      const { tab_id, node_id = null } = (payload ?? {}) as {
        tab_id?: string;
        node_id?: string | null;
      };
      if (!tab_id) return;
      graph_service.hover_search_graph_node(tab_id, node_id ?? null);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_close,
    label: "Close Search Graph",
    execute: (tab_id: unknown) => {
      if (typeof tab_id !== "string") return;
      search_graph_store.remove_instance(tab_id);
      stores.tab.close_tab(tab_id);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_toggle_semantic,
    label: "Toggle Search Graph Semantic Edges",
    execute: (tab_id: unknown) => {
      if (typeof tab_id !== "string") return;
      search_graph_store.toggle_semantic_edges(tab_id);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_toggle_smart_links,
    label: "Toggle Search Graph Smart Links",
    execute: (tab_id: unknown) => {
      if (typeof tab_id !== "string") return;
      search_graph_store.toggle_smart_link_edges(tab_id);
    },
  });
}
