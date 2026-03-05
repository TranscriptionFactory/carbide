import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { TabStore } from "$lib/features/tab";
import type { NoteService } from "$lib/features/note";
import type { WatcherService } from "$lib/features/watcher";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { VaultFsEvent } from "$lib/features/watcher";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { create_logger } from "$lib/shared/utils/logger";
import { toast } from "svelte-sonner";
import { paths_equal_ignore_case } from "$lib/shared/utils/path";
import type { NotePath } from "$lib/shared/types/ids";

const log = create_logger("watcher_reactor");
const TREE_REFRESH_DEBOUNCE_MS = 300;

export type WatcherEventDecision =
  | { action: "reload"; note_path: string }
  | { action: "conflict_toast"; note_path: string }
  | { action: "refresh_tree" }
  | { action: "clear_and_refresh"; note_path: string }
  | { action: "log_only"; path: string }
  | { action: "ignore" };

export function resolve_watcher_event_decision(
  event: VaultFsEvent,
  current_vault_id: string | null,
  open_note_path: string | null,
  is_dirty: boolean,
): WatcherEventDecision {
  if (event.vault_id !== current_vault_id) {
    return { action: "ignore" };
  }

  switch (event.type) {
    case "note_changed_externally": {
      if (!open_note_path) return { action: "ignore" };
      if (!paths_equal_ignore_case(event.note_path, open_note_path)) {
        return { action: "ignore" };
      }
      return is_dirty
        ? { action: "conflict_toast", note_path: event.note_path }
        : { action: "reload", note_path: event.note_path };
    }
    case "note_added":
      return { action: "refresh_tree" };
    case "note_removed": {
      if (
        open_note_path &&
        paths_equal_ignore_case(event.note_path, open_note_path)
      ) {
        return { action: "clear_and_refresh", note_path: event.note_path };
      }
      return { action: "refresh_tree" };
    }
    case "asset_changed":
      return { action: "log_only", path: event.asset_path };
  }
}

export function create_watcher_reactor(
  vault_store: VaultStore,
  editor_store: EditorStore,
  tab_store: TabStore,
  note_service: NoteService,
  watcher_service: WatcherService,
  action_registry: ActionRegistry,
): () => void {
  return $effect.root(() => {
    let tree_refresh_timer: ReturnType<typeof setTimeout> | null = null;
    const active_conflict_toasts = new Map<string, string | number>();

    function debounced_tree_refresh() {
      if (tree_refresh_timer !== null) {
        clearTimeout(tree_refresh_timer);
      }
      tree_refresh_timer = setTimeout(() => {
        tree_refresh_timer = null;
        void action_registry.execute(ACTION_IDS.folder_refresh_tree);
      }, TREE_REFRESH_DEBOUNCE_MS);
    }

    function handle_event(event: VaultFsEvent) {
      const decision = resolve_watcher_event_decision(
        event,
        vault_store.vault?.id ?? null,
        editor_store.open_note?.meta.path ?? null,
        editor_store.open_note?.is_dirty ?? false,
      );

      switch (decision.action) {
        case "reload":
          void note_service.open_note(decision.note_path, false, {
            force_reload: true,
          });
          break;
        case "conflict_toast": {
          if (active_conflict_toasts.has(decision.note_path)) break;
          const tid = toast.warning("Note modified externally", {
            description: "Reload from disk or keep your changes?",
            classes: { toast: "toast--stacked-actions" },
            duration: Infinity,
            action: {
              label: "Reload from disk",
              onClick: () => {
                active_conflict_toasts.delete(decision.note_path);
                void note_service.open_note(decision.note_path, false, {
                  force_reload: true,
                });
              },
            },
            cancel: {
              label: "Keep my changes",
              onClick: () => {
                active_conflict_toasts.delete(decision.note_path);
              },
            },
          });
          active_conflict_toasts.set(decision.note_path, tid);
          break;
        }
        case "refresh_tree":
          debounced_tree_refresh();
          break;
        case "clear_and_refresh":
          editor_store.clear_open_note();
          tab_store.remove_tab_by_path(decision.note_path as NotePath);
          debounced_tree_refresh();
          break;
        case "log_only":
          log.info("Asset changed externally", { path: decision.path });
          break;
        case "ignore":
          break;
      }
    }

    $effect(() => {
      const vault = vault_store.vault;
      if (!vault) {
        void watcher_service.stop();
        return;
      }

      void watcher_service.start(vault.id);
      watcher_service.subscribe(handle_event);

      return () => {
        if (tree_refresh_timer !== null) {
          clearTimeout(tree_refresh_timer);
          tree_refresh_timer = null;
        }
      };
    });
  });
}
