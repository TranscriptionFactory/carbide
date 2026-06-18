import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { GraphService } from "$lib/features/graph/application/graph_service";
import type { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
import type { SearchGraphSortMode } from "$lib/features/graph/domain/sort_search_graph_nodes";

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

  registry.register({
    id: ACTION_IDS.search_graph_expand_node,
    label: "Find Similar Notes",
    execute: async (payload: unknown) => {
      const { tab_id, node_path } = (payload ?? {}) as {
        tab_id?: string;
        node_path?: string;
      };
      if (!tab_id || !node_path) return;
      await graph_service.expand_search_graph_node(tab_id, node_path);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_toggle_selected,
    label: "Toggle Search Graph Node Selection",
    execute: (payload: unknown) => {
      const { tab_id, node_id } = (payload ?? {}) as {
        tab_id?: string;
        node_id?: string;
      };
      if (!tab_id || !node_id) return;
      search_graph_store.toggle_selected(tab_id, node_id);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_select_range,
    label: "Select Search Graph Node Range",
    execute: (payload: unknown) => {
      const { tab_id, from_id, to_id, ordered_paths } = (payload ?? {}) as {
        tab_id?: string;
        from_id?: string;
        to_id?: string;
        ordered_paths?: string[];
      };
      if (!tab_id || !from_id || !to_id || !ordered_paths) return;
      search_graph_store.select_range(tab_id, from_id, to_id, ordered_paths);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_clear_selected,
    label: "Clear Search Graph Selection",
    execute: (tab_id: unknown) => {
      if (typeof tab_id !== "string") return;
      search_graph_store.clear_selected(tab_id);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_set_sort_mode,
    label: "Set Search Graph Sort Mode",
    execute: (payload: unknown) => {
      const { tab_id, sort_mode } = (payload ?? {}) as {
        tab_id?: string;
        sort_mode?: SearchGraphSortMode;
      };
      if (!tab_id || !sort_mode) return;
      search_graph_store.set_sort_mode(tab_id, sort_mode);
    },
  });

  registry.register({
    id: ACTION_IDS.search_graph_toggle_sort_order,
    label: "Toggle Search Graph Sort Order",
    execute: (tab_id: unknown) => {
      if (typeof tab_id !== "string") return;
      search_graph_store.toggle_sort_order(tab_id);
    },
  });
}
