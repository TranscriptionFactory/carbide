import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { SIDEBAR_VIEWS } from "$lib/app/sidebar_views";
import type { GraphService } from "$lib/features/graph/application/graph_service";
import type { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import {
  GRAPH_TAB_ID,
  GRAPH_TAB_TITLE,
} from "$lib/features/graph/domain/graph_tab";
import {
  GRAPH_GROUP_MODE_OPTIONS,
  GRAPH_ORDER_MODE_OPTIONS,
  type EditorSettings,
  type GraphGroupMode,
  type GraphOrderMode,
} from "$lib/shared/types/editor_settings";

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

function as_group_mode(value: unknown): GraphGroupMode | undefined {
  return GRAPH_GROUP_MODE_OPTIONS.find((o) => o.value === value)?.value;
}

function as_order_mode(value: unknown): GraphOrderMode | undefined {
  return GRAPH_ORDER_MODE_OPTIONS.find((o) => o.value === value)?.value;
}

export function register_graph_actions(
  input: ActionRegistrationInput & {
    graph_store: GraphStore;
    graph_service: GraphService;
  },
) {
  const { registry, stores, services, graph_store, graph_service } = input;

  async function persist(patch: Partial<EditorSettings>): Promise<void> {
    const updated: EditorSettings = { ...stores.ui.editor_settings, ...patch };
    const result = await services.settings.save_settings(updated);
    if (result.status === "success") {
      stores.ui.set_editor_settings(updated);
    }
  }

  function close_graph(options: GraphCloseOptions = {}) {
    graph_service.close_panel();
    if (
      !options.preserve_context_rail &&
      stores.ui.sidebar_view === SIDEBAR_VIEWS.graph
    ) {
      stores.ui.sidebar_view = SIDEBAR_VIEWS.explorer;
    }
  }

  registry.register({
    id: ACTION_IDS.graph_toggle_panel,
    label: "Toggle Graph Panel",
    shortcut: "CmdOrCtrl+Shift+G",
    execute: async () => {
      if (
        graph_store.panel_open &&
        stores.ui.sidebar_open &&
        stores.ui.sidebar_view === SIDEBAR_VIEWS.graph
      ) {
        close_graph();
        return;
      }

      stores.ui.set_sidebar_view(SIDEBAR_VIEWS.graph);
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
      stores.ui.set_sidebar_view(SIDEBAR_VIEWS.graph);
      await graph_service.focus_active_note();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_refresh,
    label: "Refresh Graph",
    execute: async () => {
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
      await graph_service.toggle_view_mode();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_load_vault_graph,
    label: "Load Full Vault Graph",
    execute: async () => {
      await graph_service.load_vault_graph();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_toggle_semantic_edges,
    label: "Toggle Semantic Connections",
    execute: async () => {
      const s = stores.ui.editor_settings;
      await graph_service.toggle_semantic_edges({
        knn_limit: s.semantic_graph_edges_per_note,
        distance_threshold: s.semantic_similarity_threshold,
      });
    },
  });

  registry.register({
    id: ACTION_IDS.graph_toggle_smart_link_edges,
    label: "Toggle Smart Link Connections",
    execute: async () => {
      await graph_service.toggle_smart_link_edges();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_open_as_tab,
    label: "Open Vault Graph",
    execute: () => {
      graph_service.close_panel();
      if (stores.ui.sidebar_view === SIDEBAR_VIEWS.graph) {
        stores.ui.sidebar_view = SIDEBAR_VIEWS.explorer;
      }

      graph_store.set_view_mode("vault");
      stores.tab.open_graph_tab(GRAPH_TAB_ID, GRAPH_TAB_TITLE);
      stores.editor.clear_open_note();
    },
  });

  registry.register({
    id: ACTION_IDS.graph_load_hierarchy,
    label: "Load IWE Hierarchy",
    execute: async (root_key?: unknown) => {
      graph_store.set_view_mode("hierarchy");
      stores.ui.set_sidebar_view(SIDEBAR_VIEWS.graph);
      await graph_service.load_hierarchy(
        typeof root_key === "string" ? root_key : null,
      );
    },
  });

  registry.register({
    id: ACTION_IDS.graph_cycle_group_mode,
    label: "Cycle Graph Grouping",
    execute: async () => {
      const current = stores.ui.editor_settings.graph_group_mode;
      const index = GRAPH_GROUP_MODE_OPTIONS.findIndex(
        (o) => o.value === current,
      );
      const next =
        GRAPH_GROUP_MODE_OPTIONS[(index + 1) % GRAPH_GROUP_MODE_OPTIONS.length];
      if (next) await persist({ graph_group_mode: next.value });
    },
  });

  registry.register({
    id: ACTION_IDS.graph_set_group_mode,
    label: "Set Graph Grouping",
    execute: async (mode: unknown) => {
      const value = as_group_mode(mode);
      if (value) await persist({ graph_group_mode: value });
    },
  });

  registry.register({
    id: ACTION_IDS.graph_set_group_order,
    label: "Set Graph Group Order",
    execute: async (order: unknown) => {
      const value = as_order_mode(order);
      if (value) await persist({ graph_group_order: value });
    },
  });

  registry.register({
    id: ACTION_IDS.graph_enter_focus_mode,
    label: "Focus Graph Node",
    execute: (path: unknown) => {
      if (typeof path === "string" && path.length > 0) {
        graph_store.enter_focus_mode(path);
      }
    },
  });

  registry.register({
    id: ACTION_IDS.graph_exit_focus_mode,
    label: "Exit Graph Focus Mode",
    execute: () => {
      graph_store.exit_focus_mode();
    },
  });
}
