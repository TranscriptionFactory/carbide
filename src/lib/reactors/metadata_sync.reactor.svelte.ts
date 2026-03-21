import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { SearchStore } from "$lib/features/search";
import type { MetadataService } from "$lib/features/metadata";
import type { MetadataStore } from "$lib/features/metadata";

type MetadataSyncState = {
  last_note_path: string | null;
  last_panel_open: boolean;
  last_index_status: SearchStore["index_progress"]["status"];
  last_is_dirty: boolean;
  index_epoch: number;
  save_epoch: number;
  loaded_note_path: string | null;
  loaded_index_epoch: number;
  loaded_save_epoch: number;
};

type MetadataSyncInput = {
  open_note_path: string | null;
  panel_open: boolean;
  index_status: SearchStore["index_progress"]["status"];
  is_dirty: boolean;
  snapshot_note_path: string | null;
  has_error: boolean;
};

type MetadataSyncDecision = {
  action: "clear" | "load" | "noop";
  note_path: string | null;
  next_state: MetadataSyncState;
};

export function resolve_metadata_sync_decision(
  state: MetadataSyncState,
  input: MetadataSyncInput,
): MetadataSyncDecision {
  const index_completed =
    input.index_status === "completed" &&
    state.last_index_status !== "completed";
  const save_completed =
    !input.is_dirty &&
    state.last_is_dirty &&
    input.open_note_path === state.last_note_path;

  const next_index_epoch = state.index_epoch + (index_completed ? 1 : 0);
  const next_save_epoch = state.save_epoch + (save_completed ? 1 : 0);

  const next_state: MetadataSyncState = {
    last_note_path: input.open_note_path,
    last_panel_open: input.panel_open,
    last_index_status: input.index_status,
    last_is_dirty: input.is_dirty,
    index_epoch: next_index_epoch,
    save_epoch: next_save_epoch,
    loaded_note_path: state.loaded_note_path,
    loaded_index_epoch: state.loaded_index_epoch,
    loaded_save_epoch: state.loaded_save_epoch,
  };

  if (!input.open_note_path) {
    next_state.loaded_note_path = null;
    return { action: "clear", note_path: null, next_state };
  }

  const path_changed = input.open_note_path !== state.last_note_path;
  const panel_opened = input.panel_open && !state.last_panel_open;
  const has_loaded_current = state.loaded_note_path === input.open_note_path;
  const has_ready_snapshot =
    input.snapshot_note_path === input.open_note_path && !input.has_error;
  const stale_from_index = next_index_epoch > state.loaded_index_epoch;
  const stale_from_save = next_save_epoch > state.loaded_save_epoch;
  const stale_or_unloaded =
    !has_loaded_current ||
    stale_from_index ||
    stale_from_save ||
    !has_ready_snapshot;

  const should_load = input.panel_open
    ? path_changed ||
      (panel_opened && stale_or_unloaded) ||
      ((index_completed || save_completed) && stale_or_unloaded)
    : false;

  if (should_load) {
    next_state.loaded_note_path = input.open_note_path;
    next_state.loaded_index_epoch = next_index_epoch;
    next_state.loaded_save_epoch = next_save_epoch;
  }

  return {
    action: should_load ? "load" : "noop",
    note_path: input.open_note_path,
    next_state,
  };
}

export function create_metadata_sync_reactor(
  editor_store: EditorStore,
  search_store: SearchStore,
  ui_store: UIStore,
  metadata_store: MetadataStore,
  metadata_service: MetadataService,
) {
  let state: MetadataSyncState = {
    last_note_path: null,
    last_panel_open: false,
    last_index_status: "idle",
    last_is_dirty: false,
    index_epoch: 0,
    save_epoch: 0,
    loaded_note_path: null,
    loaded_index_epoch: 0,
    loaded_save_epoch: 0,
  };

  return $effect.root(() => {
    $effect(() => {
      const decision = resolve_metadata_sync_decision(state, {
        open_note_path: editor_store.open_note?.meta.path ?? null,
        panel_open:
          ui_store.context_rail_open &&
          ui_store.context_rail_tab === "metadata",
        index_status: search_store.index_progress.status,
        is_dirty: editor_store.open_note?.is_dirty ?? false,
        snapshot_note_path: metadata_store.note_path,
        has_error: metadata_store.error !== null,
      });
      state = decision.next_state;

      if (decision.action === "clear") {
        if (
          metadata_store.note_path ||
          metadata_store.error ||
          metadata_store.loading ||
          metadata_store.properties.length > 0 ||
          metadata_store.tags.length > 0
        ) {
          metadata_service.clear();
        }
        return;
      }

      if (decision.action === "load" && decision.note_path) {
        void metadata_service.refresh(decision.note_path);
      }
    });
  });
}
