import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { GraphService } from "$lib/features/graph/application/graph_service";
import type { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import {
  GRAPH_TAB_ID,
  GRAPH_TAB_TITLE,
} from "$lib/features/graph/domain/graph_tab";

type GraphCloseOptions = {
  preserve_context_rail?: boolean;
};

function parse_close_options(input: unknown): GraphCloseOptions {
  if (!input || typeof input !== "object") {
    return {};
  }

  const value = input as Partial<GraphCloseOptions>;
  return {
    preserve_context_rail: value.preserve_context_rail === true,
  };
}

export function register_graph_actions(
  input: ActionRegistrationInput & {
    graph_store: GraphStore;
    graph_service: GraphService;
  },
) {
  const { registry, stores, graph_store, graph_service } = input;

  function close_graph(options: GraphCloseOptions = {}) {
    graph_service.close_panel();
    if (options.preserve_context_rail) {
      stores.ui.set_context_rail_tab("links");
      return;
    }

    stores.ui.close_context_rail("links");
  }

  registry.register({
    id: ACTION_IDS.graph_toggle_panel,
    label: "Toggle Graph Panel",
    shortcut: "CmdOrCtrl+Shift+G",
    execute: async () => {
      if (graph_store.panel_open && stores.ui.context_rail_tab === "graph") {
        close_graph();
        return;
      }

      stores.ui.set_context_rail_tab("graph");
      await graph_service.focus_active_note();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_close,
    label: "Close Graph Panel",
    execute: (options: unknown) => {
      close_graph(parse_close_options(options));
    },
  });

  registry.register({
    id: ACTION_IDS.graph_focus_active_note,
    label: "Focus Active Note in Graph",
    execute: async () => {
      stores.ui.set_context_rail_tab("graph");
      await graph_service.focus_active_note();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_refresh,
    label: "Refresh Graph",
    execute: async () => {
      stores.ui.set_context_rail_tab("graph");
      await graph_service.refresh_current();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_select_node,
    label: "Select Graph Node",
    execute: (node_id: unknown) => {
      graph_service.select_node(
        typeof node_id === "string" && node_id.length > 0 ? node_id : null,
      );
    },
  });

  registry.register({
    id: ACTION_IDS.graph_set_hovered_node,
    label: "Set Hovered Graph Node",
    execute: (node_id: unknown) => {
      graph_service.set_hovered_node(
        typeof node_id === "string" && node_id.length > 0 ? node_id : null,
      );
    },
  });

  registry.register({
    id: ACTION_IDS.graph_set_filter_query,
    label: "Set Graph Filter Query",
    execute: (query: unknown) => {
      graph_service.set_filter_query(typeof query === "string" ? query : "");
    },
  });

  registry.register({
    id: ACTION_IDS.graph_toggle_view_mode,
    label: "Toggle Graph View Mode",
    execute: async () => {
      stores.ui.set_context_rail_tab("graph");
      await graph_service.toggle_view_mode();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_load_vault_graph,
    label: "Load Full Vault Graph",
    execute: async () => {
      stores.ui.set_context_rail_tab("graph");
      await graph_service.load_vault_graph();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_toggle_semantic_edges,
    label: "Toggle Semantic Connections",
    execute: async () => {
      const s = stores.ui.editor_settings;
      await graph_service.toggle_semantic_edges({
        max_vault_size: s.semantic_graph_max_vault_size,
        knn_limit: s.semantic_graph_edges_per_note,
        distance_threshold: s.semantic_similarity_threshold,
      });
    },
  });

  registry.register({
    id: ACTION_IDS.graph_open_as_tab,
    label: "Open Vault Graph",
    execute: async () => {
      stores.tab.open_graph_tab(GRAPH_TAB_ID, GRAPH_TAB_TITLE);
      stores.editor.clear_open_note();
      await graph_service.load_vault_graph();
    },
  });
}
