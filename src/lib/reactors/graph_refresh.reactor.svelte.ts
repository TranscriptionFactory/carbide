import type {
  GraphStore,
  GraphService,
  GraphViewMode,
} from "$lib/features/graph";
import type { VaultStore } from "$lib/features/vault";
import { listen } from "@tauri-apps/api/event";

type GraphRefreshState = {
  last_panel_open: boolean;
  last_vault_id: string | null;
};

type GraphRefreshDecision = {
  action: "clear" | "load" | "load_vault" | "noop";
  note_path: string | null;
  next_state: GraphRefreshState;
};

type MetadataChangedPayload = {
  event_type: "upsert" | "rename" | "delete";
  vault_id: string;
  path: string;
  old_path?: string;
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
    return { action: "load", note_path: input.center_note_path, next_state };
  }

  return { action: "noop", note_path: null, next_state };
}

// Cache invalidation is driven by the post-commit "metadata-changed" event
// instead of the old dirty→clean save edge: the index upsert is async
// relative to the save reply, so the event is the earliest moment the
// note's cached links are actually stale-and-replaceable. It also covers
// external and bases-driven writes the save edge never saw.
export function create_graph_refresh_reactor(
  graph_store: GraphStore,
  vault_store: VaultStore,
  graph_service: GraphService,
): () => void {
  let state: GraphRefreshState = {
    last_panel_open: false,
    last_vault_id: null,
  };

  let unlisten_fn: (() => void) | null = null;
  let is_disposed = false;

  void listen<MetadataChangedPayload>("metadata-changed", (event) => {
    if (is_disposed) return;
    const payload = event.payload;
    if (payload.vault_id !== vault_store.vault?.id) return;
    void graph_service.invalidate_cache(payload.path);
    if (payload.old_path) {
      void graph_service.invalidate_cache(payload.old_path);
    }
  }).then((fn) => {
    if (is_disposed) {
      fn();
    } else {
      unlisten_fn = fn;
    }
  });

  const stop_effect = $effect.root(() => {
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

  return () => {
    is_disposed = true;
    if (unlisten_fn) {
      unlisten_fn();
      unlisten_fn = null;
    }
    stop_effect();
  };
}
