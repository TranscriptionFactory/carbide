import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app";
import type { LinksService } from "$lib/features/links";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";

const LOCAL_LINKS_DEBOUNCE_MS = 220;

type LocalLinksSyncState = {
  last_note_path: string | null;
  last_panel_open: boolean;
  last_markdown: string | null;
};

type LocalLinksSyncInput = {
  open_note_path: string | null;
  panel_open: boolean;
  markdown: string | null;
};

type LocalLinksSyncDecision = {
  action: "clear" | "cancel" | "compute_now" | "compute_debounced" | "noop";
  note_path: string | null;
  next_state: LocalLinksSyncState;
};

export function resolve_local_links_sync_decision(
  state: LocalLinksSyncState,
  input: LocalLinksSyncInput,
): LocalLinksSyncDecision {
  const next_state: LocalLinksSyncState = {
    last_note_path: input.open_note_path,
    last_panel_open: input.panel_open,
    last_markdown: input.markdown,
  };

  if (!input.open_note_path || input.markdown === null) {
    return { action: "clear", note_path: null, next_state };
  }

  if (!input.panel_open) {
    return { action: "cancel", note_path: input.open_note_path, next_state };
  }

  const path_changed = input.open_note_path !== state.last_note_path;
  const panel_opened = input.panel_open && !state.last_panel_open;
  const markdown_changed = input.markdown !== state.last_markdown;

  if (path_changed || panel_opened) {
    return {
      action: "compute_now",
      note_path: input.open_note_path,
      next_state,
    };
  }

  if (markdown_changed) {
    return {
      action: "compute_debounced",
      note_path: input.open_note_path,
      next_state,
    };
  }

  return { action: "noop", note_path: input.open_note_path, next_state };
}

export function create_local_links_sync_reactor(
  editor_store: EditorStore,
  ui_store: UIStore,
  links_service: LinksService,
): () => void {
  let state: LocalLinksSyncState = {
    last_note_path: null,
    last_panel_open: false,
    last_markdown: null,
  };
  const sync_local_links = create_debounced_task_controller<string>({
    run: (note_path) => {
      const current = editor_store.open_note;
      if (!current || current.meta.path !== note_path) return;
      void links_service.update_local_note_links(note_path, current.markdown);
    },
  });

  return $effect.root(() => {
    $effect(() => {
      const open_note = editor_store.open_note;
      const decision = resolve_local_links_sync_decision(state, {
        open_note_path: open_note?.meta.path ?? null,
        panel_open:
          ui_store.context_rail_open && ui_store.context_rail_tab === "links",
        markdown: open_note?.markdown ?? null,
      });
      state = decision.next_state;

      if (decision.action === "clear") {
        sync_local_links.cancel();
        links_service.clear();
        return;
      }

      if (decision.action === "cancel" || decision.action === "noop") {
        sync_local_links.cancel();
        return;
      }

      const note_path = decision.note_path;
      if (!note_path) {
        sync_local_links.cancel();
        return;
      }

      if (decision.action === "compute_now") {
        sync_local_links.cancel();
        const markdown = editor_store.open_note?.markdown;
        if (!markdown) return;
        void links_service.update_local_note_links(note_path, markdown);
        return;
      }

      sync_local_links.schedule(note_path, LOCAL_LINKS_DEBOUNCE_MS);
    });

    return () => {
      sync_local_links.cancel();
    };
  });
}
