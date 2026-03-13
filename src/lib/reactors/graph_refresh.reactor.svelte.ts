import type { GraphStore, GraphService } from "$lib/features/graph";
import type { SearchStore } from "$lib/features/search";
import type { VaultStore } from "$lib/features/vault";

type GraphRefreshState = {
  last_panel_open: boolean;
  last_index_status: SearchStore["index_progress"]["status"];
  last_vault_id: string | null;
};

type GraphRefreshDecision = {
  action: "clear" | "load" | "noop";
  note_path: string | null;
  next_state: GraphRefreshState;
};

export function resolve_graph_refresh_decision(
  state: GraphRefreshState,
  input: {
    panel_open: boolean;
    center_note_path: string | null;
    vault_id: string | null;
    index_status: SearchStore["index_progress"]["status"];
    snapshot_note_path: string | null;
    status: GraphStore["status"];
  },
): GraphRefreshDecision {
  const next_state: GraphRefreshState = {
    last_panel_open: input.panel_open,
    last_index_status: input.index_status,
    last_vault_id: input.vault_id,
  };

  if (!input.vault_id) {
    return { action: "clear", note_path: null, next_state };
  }

  if (!input.panel_open || !input.center_note_path) {
    return { action: "noop", note_path: null, next_state };
  }

  if (state.last_vault_id && state.last_vault_id !== input.vault_id) {
    return { action: "clear", note_path: null, next_state };
  }

  const panel_opened = input.panel_open && !state.last_panel_open;
  const index_completed =
    input.index_status === "completed" &&
    state.last_index_status !== "completed";
  const needs_initial_load =
    panel_opened &&
    input.snapshot_note_path !== input.center_note_path &&
    input.status !== "loading";

  if (needs_initial_load || index_completed) {
    return {
      action: "load",
      note_path: input.center_note_path,
      next_state,
    };
  }

  return { action: "noop", note_path: null, next_state };
}

export function create_graph_refresh_reactor(
  graph_store: GraphStore,
  search_store: SearchStore,
  vault_store: VaultStore,
  graph_service: GraphService,
): () => void {
  let state: GraphRefreshState = {
    last_panel_open: false,
    last_index_status: "idle",
    last_vault_id: null,
  };

  return $effect.root(() => {
    $effect(() => {
      const decision = resolve_graph_refresh_decision(state, {
        panel_open: graph_store.panel_open,
        center_note_path: graph_store.center_note_path,
        vault_id: vault_store.vault?.id ?? null,
        index_status: search_store.index_progress.status,
        snapshot_note_path: graph_store.snapshot?.center.path ?? null,
        status: graph_store.status,
      });
      state = decision.next_state;

      if (decision.action === "clear") {
        graph_service.clear();
        return;
      }

      if (decision.action === "load" && decision.note_path) {
        void graph_service.load_note_neighborhood(decision.note_path);
      }
    });
  });
}
