import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { VaultStore } from "$lib/features/vault";
import type { LinksService } from "$lib/features/links";
import type { LinksStore } from "$lib/features/links";
import type {
  MarkdownLspStore,
  MarkdownLspStatus,
} from "$lib/features/markdown_lsp";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";
import {
  METADATA_REFRESH_DEBOUNCE_MS,
  subscribe_metadata_changed,
} from "$lib/reactors/metadata_changed";

type BacklinksSyncState = {
  last_note_path: string | null;
  last_panel_open: boolean;
  last_markdown_lsp_status: MarkdownLspStatus;
  loaded_note_path: string | null;
};

type BacklinksSyncInput = {
  open_note_path: string | null;
  panel_open: boolean;
  markdown_lsp_status: MarkdownLspStatus;
  snapshot_note_path: string | null;
  global_status: LinksStore["global_status"];
};

type BacklinksSyncDecision = {
  action: "clear" | "load" | "noop";
  note_path: string | null;
  next_state: BacklinksSyncState;
};

export function resolve_backlinks_sync_decision(
  state: BacklinksSyncState,
  input: BacklinksSyncInput,
): BacklinksSyncDecision {
  const next_state: BacklinksSyncState = {
    last_note_path: input.open_note_path,
    last_panel_open: input.panel_open,
    last_markdown_lsp_status: input.markdown_lsp_status,
    loaded_note_path: state.loaded_note_path,
  };

  if (!input.open_note_path) {
    next_state.loaded_note_path = null;
    return { action: "clear", note_path: null, next_state };
  }

  if (!input.panel_open) {
    return { action: "noop", note_path: input.open_note_path, next_state };
  }

  const path_changed = input.open_note_path !== state.last_note_path;
  const panel_opened = input.panel_open && !state.last_panel_open;
  const markdown_lsp_became_ready =
    input.markdown_lsp_status === "running" &&
    state.last_markdown_lsp_status !== "running";
  const not_loaded = state.loaded_note_path !== input.open_note_path;
  const has_ready_snapshot =
    input.snapshot_note_path === input.open_note_path &&
    input.global_status === "ready";

  const stale_or_unloaded = not_loaded || !has_ready_snapshot;

  const should_load =
    path_changed ||
    (panel_opened && stale_or_unloaded) ||
    (markdown_lsp_became_ready && stale_or_unloaded);

  if (should_load) {
    next_state.loaded_note_path = input.open_note_path;
  }

  return {
    action: should_load ? "load" : "noop",
    note_path: input.open_note_path,
    next_state,
  };
}

// Index-driven refresh replaces the old dirty→clean save-edge trigger: the
// index upsert is async relative to the save reply, so "metadata-changed"
// (emitted post-commit by the DB writer) is the earliest moment a re-read
// can see the new links. It also covers external and bases-driven writes
// the save edge never saw. Any note's commit can change the open note's
// backlinks, so only the vault is filtered; bursts coalesce into one reload.
export function create_backlinks_sync_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  markdown_lsp_store: MarkdownLspStore,
  links_store: LinksStore,
  links_service: LinksService,
  vault_store: VaultStore,
): () => void {
  let state: BacklinksSyncState = {
    last_note_path: null,
    last_panel_open: false,
    last_markdown_lsp_status: "stopped",
    loaded_note_path: null,
  };

  const links_panel_open = () =>
    ui_store.context_rail_open && ui_store.context_rail_tab === "links";

  const reload = create_debounced_task_controller<void>({
    run: () => {
      const open_note_path = editor_store.open_note?.meta.path ?? null;
      if (!open_note_path) return;
      if (!links_panel_open()) {
        state.loaded_note_path = null;
        return;
      }
      state.loaded_note_path = open_note_path;
      void links_service.load_note_links(open_note_path);
    },
  });

  const unsubscribe = subscribe_metadata_changed((payload) => {
    if (payload.vault_id !== vault_store.vault?.id) return;
    reload.schedule(undefined, METADATA_REFRESH_DEBOUNCE_MS);
  });

  const stop_effect = $effect.root(() => {
    $effect(() => {
      const decision = resolve_backlinks_sync_decision(state, {
        open_note_path: editor_store.open_note?.meta.path ?? null,
        panel_open: links_panel_open(),
        markdown_lsp_status: markdown_lsp_store.status,
        snapshot_note_path: links_store.active_note_path,
        global_status: links_store.global_status,
      });
      state = decision.next_state;

      if (decision.action === "clear") {
        links_service.clear();
        return;
      }
      if (decision.action === "load" && decision.note_path) {
        void links_service.load_note_links(decision.note_path);
      }
    });
  });

  return () => {
    unsubscribe();
    reload.cancel();
    stop_effect();
  };
}
