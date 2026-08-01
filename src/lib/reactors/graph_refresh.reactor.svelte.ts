import type {
  GraphStore,
  GraphService,
  GraphViewMode,
} from "$lib/features/graph";
import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";

type GraphRefreshState = {
  last_panel_open: boolean;
  last_vault_id: string | null;
  last_open_note_path: string | null;
  last_open_note_dirty: boolean;
};

type GraphRefreshDecision = {
  action: "clear" | "load" | "load_vault" | "noop";
  note_path: string | null;
  invalidate_note_path: string | null;
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
    open_note_path: string | null;
    open_note_dirty: boolean;
  },
): GraphRefreshDecision {
  const next_state: GraphRefreshState = {
    last_panel_open: input.panel_open,
    last_vault_id: input.vault_id,
    last_open_note_path: input.open_note_path,
    last_open_note_dirty: input.open_note_dirty,
  };

  if (!input.vault_id) {
    return {
      action: "clear",
      note_path: null,
      invalidate_note_path: null,
      next_state,
    };
  }

  if (state.last_vault_id && state.last_vault_id !== input.vault_id) {
    return {
      action: "clear",
      note_path: null,
      invalidate_note_path: null,
      next_state,
    };
  }

  // A completed save clears the dirty flag on the note that was edited. That
  // note's cached links are now stale for every reader of the graph cache, so
  // it must refresh even while the panel is closed.
  const saved_note_path =
    state.last_open_note_dirty &&
    !input.open_note_dirty &&
    input.open_note_path !== null &&
    input.open_note_path === state.last_open_note_path
      ? input.open_note_path
      : null;

  if (!input.panel_open) {
    return {
      action: "noop",
      note_path: null,
      invalidate_note_path: saved_note_path,
      next_state,
    };
  }

  const panel_opened = input.panel_open && !state.last_panel_open;

  if (input.view_mode === "vault") {
    if (panel_opened) {
      return {
        action: "load_vault",
        note_path: null,
        invalidate_note_path: saved_note_path,
        next_state,
      };
    }
    return {
      action: "noop",
      note_path: null,
      invalidate_note_path: saved_note_path,
      next_state,
    };
  }

  if (!input.center_note_path) {
    return {
      action: "noop",
      note_path: null,
      invalidate_note_path: saved_note_path,
      next_state,
    };
  }

  const note_path_changed =
    input.panel_open &&
    input.snapshot_note_path !== input.center_note_path &&
    input.status !== "loading";

  if (panel_opened || note_path_changed) {
    return {
      action: "load",
      note_path: input.center_note_path,
      invalidate_note_path:
        saved_note_path === input.center_note_path ? null : saved_note_path,
      next_state,
    };
  }

  return {
    action: "noop",
    note_path: null,
    invalidate_note_path: saved_note_path,
    next_state,
  };
}

export function create_graph_refresh_reactor(
  graph_store: GraphStore,
  vault_store: VaultStore,
  editor_store: EditorStore,
  graph_service: GraphService,
): () => void {
  let state: GraphRefreshState = {
    last_panel_open: false,
    last_vault_id: null,
    last_open_note_path: null,
    last_open_note_dirty: false,
  };

  return $effect.root(() => {
    $effect(() => {
      const open_note = editor_store.open_note;
      const decision = resolve_graph_refresh_decision(state, {
        panel_open: graph_store.panel_open,
        center_note_path: graph_store.center_note_path,
        vault_id: vault_store.vault?.id ?? null,
        snapshot_note_path: graph_store.snapshot?.center.path ?? null,
        status: graph_store.status,
        view_mode: graph_store.view_mode,
        open_note_path: open_note?.meta.path ?? null,
        open_note_dirty: open_note?.is_dirty ?? false,
      });
      state = decision.next_state;

      if (decision.action === "clear") {
        graph_service.clear();
        return;
      }

      const saved = decision.invalidate_note_path;
      const invalidated = saved
        ? graph_service.invalidate_cache(saved)
        : Promise.resolve();

      if (decision.action === "load_vault") {
        void invalidated.then(() => graph_service.load_vault_graph());
        return;
      }

      if (decision.action === "load" && decision.note_path) {
        const note_path = decision.note_path;
        void invalidated
          .then(() => graph_service.invalidate_cache(note_path))
          .then(() => graph_service.load_note_neighborhood(note_path));
        return;
      }

      void invalidated;
    });
  });
}
