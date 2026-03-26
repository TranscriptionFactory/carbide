import type {
  GraphStore,
  GraphService,
  GraphViewMode,
} from "$lib/features/graph";
import type { VaultStore } from "$lib/features/vault";

type GraphRefreshState = {
  last_panel_open: boolean;
  last_vault_id: string | null;
};

type GraphRefreshDecision = {
  action: "clear" | "load" | "load_vault" | "noop";
  note_path: string | null;
  next_state: GraphRefreshState;
};

export function resolve_graph_refresh_decision(
  state: GraphRefreshState,
  input: {
    panel_open: boolean;
    center_note_path: string | null;
    vault_id: string | null;
    snapshot_note_path: string | null;
    status: GraphStore["status"];
    view_mode: GraphViewMode;
  },
): GraphRefreshDecision {
  const next_state: GraphRefreshState = {
    last_panel_open: input.panel_open,
    last_vault_id: input.vault_id,
  };

  if (!input.vault_id) {
    return { action: "clear", note_path: null, next_state };
  }

  if (state.last_vault_id && state.last_vault_id !== input.vault_id) {
    return { action: "clear", note_path: null, next_state };
  }

  if (!input.panel_open) {
    return { action: "noop", note_path: null, next_state };
  }

  const panel_opened = input.panel_open && !state.last_panel_open;

  if (input.view_mode === "vault") {
    if (panel_opened) {
      return { action: "load_vault", note_path: null, next_state };
    }
    return { action: "noop", note_path: null, next_state };
  }

  if (!input.center_note_path) {
    return { action: "noop", note_path: null, next_state };
  }

  const note_path_changed =
    input.panel_open &&
    input.snapshot_note_path !== input.center_note_path &&
    input.status !== "loading";

  if (panel_opened || note_path_changed) {
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
  vault_store: VaultStore,
  graph_service: GraphService,
): () => void {
  let state: GraphRefreshState = {
    last_panel_open: false,
    last_vault_id: null,
  };

  return $effect.root(() => {
    $effect(() => {
      const decision = resolve_graph_refresh_decision(state, {
        panel_open: graph_store.panel_open,
        center_note_path: graph_store.center_note_path,
        vault_id: vault_store.vault?.id ?? null,
        snapshot_note_path: graph_store.snapshot?.center.path ?? null,
        status: graph_store.status,
        view_mode: graph_store.view_mode,
      });
      state = decision.next_state;

      if (decision.action === "clear") {
        graph_service.clear();
        return;
      }

      if (decision.action === "load_vault") {
        void graph_service.load_vault_graph();
        return;
      }

      if (decision.action === "load" && decision.note_path) {
        const note_path = decision.note_path;
        void graph_service
          .invalidate_cache(note_path)
          .then(() => graph_service.load_note_neighborhood(note_path));
      }
    });
  });
}
