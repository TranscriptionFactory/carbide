import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { MetadataService } from "$lib/features/metadata";
import type { MetadataStore } from "$lib/features/metadata";
import { create_debounced_task_controller } from "./debounced_task";

type MetadataSyncState = {
  last_note_path: string | null;
  last_panel_open: boolean;
  last_markdown: string | null;
  loaded_note_path: string | null;
};

type MetadataSyncInput = {
  open_note_path: string | null;
  panel_open: boolean;
  markdown: string | null;
  snapshot_note_path: string | null;
  has_error: boolean;
};

type MetadataSyncDecision = {
  action: "clear" | "load_now" | "load_debounced" | "noop";
  note_path: string | null;
  next_state: MetadataSyncState;
};

export function resolve_metadata_sync_decision(
  state: MetadataSyncState,
  input: MetadataSyncInput,
): MetadataSyncDecision {
  const next_state: MetadataSyncState = {
    last_note_path: input.open_note_path,
    last_panel_open: input.panel_open,
    last_markdown: input.markdown,
    loaded_note_path: state.loaded_note_path,
  };

  if (!input.open_note_path || !input.markdown) {
    next_state.loaded_note_path = null;
    return { action: "clear", note_path: null, next_state };
  }

  if (!input.panel_open) {
    return { action: "noop", note_path: input.open_note_path, next_state };
  }

  const path_changed = input.open_note_path !== state.last_note_path;
  const panel_opened = input.panel_open && !state.last_panel_open;
  const markdown_changed =
    input.markdown !== state.last_markdown &&
    state.last_note_path === input.open_note_path;

  const not_loaded = state.loaded_note_path !== input.open_note_path;
  const has_ready_snapshot =
    input.snapshot_note_path === input.open_note_path && !input.has_error;

  if (path_changed || (panel_opened && (not_loaded || !has_ready_snapshot))) {
    next_state.loaded_note_path = input.open_note_path;
    return { action: "load_now", note_path: input.open_note_path, next_state };
  }

  if (markdown_changed) {
    next_state.loaded_note_path = input.open_note_path;
    return {
      action: "load_debounced",
      note_path: input.open_note_path,
      next_state,
    };
  }

  return { action: "noop", note_path: input.open_note_path, next_state };
}

const DEBOUNCE_MS = 500;

export function create_metadata_sync_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  metadata_store: MetadataStore,
  metadata_service: MetadataService,
) {
  let state: MetadataSyncState = {
    last_note_path: null,
    last_panel_open: false,
    last_markdown: null,
    loaded_note_path: null,
  };

  const debounced = create_debounced_task_controller<string>({
    run: (note_path) => metadata_service.refresh(note_path),
  });

  return $effect.root(() => {
    $effect(() => {
      const decision = resolve_metadata_sync_decision(state, {
        open_note_path: editor_store.open_note?.meta.path ?? null,
        panel_open:
          ui_store.context_rail_open &&
          ui_store.context_rail_tab === "metadata",
        markdown: editor_store.open_note?.markdown ?? null,
        snapshot_note_path: metadata_store.note_path,
        has_error: metadata_store.error !== null,
      });
      state = decision.next_state;

      if (decision.action === "clear") {
        debounced.cancel();
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

      if (decision.action === "load_now" && decision.note_path) {
        debounced.cancel();
        metadata_service.refresh(decision.note_path);
        return;
      }

      if (decision.action === "load_debounced" && decision.note_path) {
        debounced.schedule(decision.note_path, DEBOUNCE_MS);
      }
    });
  });
}
