import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { LinksService } from "$lib/features/links";
import type { LinksStore } from "$lib/features/links";
import type { MarkdownLspStore } from "$lib/features/markdown_lsp";

type BacklinksSyncState = {
  last_note_path: string | null;
  last_panel_open: boolean;
  last_markdown_lsp_status: string;
  last_is_dirty: boolean;
  loaded_note_path: string | null;
};

type BacklinksSyncInput = {
  open_note_path: string | null;
  panel_open: boolean;
  markdown_lsp_status: string;
  is_dirty: boolean;
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
    last_is_dirty: input.is_dirty,
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
  const save_completed =
    !input.is_dirty &&
    state.last_is_dirty &&
    input.open_note_path === state.last_note_path;
  const not_loaded = state.loaded_note_path !== input.open_note_path;
  const has_ready_snapshot =
    input.snapshot_note_path === input.open_note_path &&
    input.global_status === "ready";

  const stale_or_unloaded = not_loaded || !has_ready_snapshot;

  const should_load =
    path_changed ||
    (panel_opened && stale_or_unloaded) ||
    (markdown_lsp_became_ready && stale_or_unloaded) ||
    (save_completed && stale_or_unloaded);

  if (should_load) {
    next_state.loaded_note_path = input.open_note_path;
  }

  return {
    action: should_load ? "load" : "noop",
    note_path: input.open_note_path,
    next_state,
  };
}

export function create_backlinks_sync_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  markdown_lsp_store: MarkdownLspStore,
  links_store: LinksStore,
  links_service: LinksService,
): () => void {
  let state: BacklinksSyncState = {
    last_note_path: null,
    last_panel_open: false,
    last_markdown_lsp_status: "idle",
    last_is_dirty: false,
    loaded_note_path: null,
  };

  return $effect.root(() => {
    $effect(() => {
      const decision = resolve_backlinks_sync_decision(state, {
        open_note_path: editor_store.open_note?.meta.path ?? null,
        panel_open:
          ui_store.context_rail_open && ui_store.context_rail_tab === "links",
        markdown_lsp_status: markdown_lsp_store.status,
        is_dirty: editor_store.open_note?.is_dirty ?? false,
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
}
