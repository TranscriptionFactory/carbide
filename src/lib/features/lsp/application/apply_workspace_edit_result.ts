import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { NoteService } from "$lib/features/note";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { TabStore, TabService } from "$lib/features/tab";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { MarkdownLspWorkspaceEditResult } from "$lib/features/markdown_lsp";
import type { WatcherService } from "$lib/features/watcher";
import {
  reconcile_workspace,
  type WorkspaceReconcile,
} from "$lib/app/orchestration/workspace_reconcile";
import { as_note_path, type MarkdownText } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("apply_workspace_edit_result");

export type WorkspaceEditDeps = {
  note_service: NoteService;
  editor_service: EditorService;
  editor_store: EditorStore;
  tab_store: TabStore;
  tab_service: TabService;
  action_registry: ActionRegistry;
  op_store: OpStore;
  watcher_service: WatcherService;
  workspace_reconcile?: WorkspaceReconcile;
  is_vault_mode: () => boolean;
  uri_to_path: (uri: string) => string | null;
  read_note_content?: (path: string) => Promise<MarkdownText>;
};

export async function apply_workspace_edit_result(
  result: MarkdownLspWorkspaceEditResult,
  deps: WorkspaceEditDeps,
): Promise<void> {
  const {
    note_service,
    editor_service,
    editor_store,
    tab_store,
    tab_service,
    action_registry,
    op_store,
    watcher_service,
    uri_to_path,
    read_note_content,
  } = deps;

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      log.warn("Workspace edit error", { error });
    }
    op_store.fail(
      "workspace_edit",
      `Code action completed with ${result.errors.length} error(s): ${result.errors[0]}`,
    );
  }

  const modified_paths = resolve_uri_list(result.files_modified, uri_to_path);
  const created_paths = resolve_uri_list(result.files_created, uri_to_path);
  const deleted_paths = resolve_uri_list(result.files_deleted, uri_to_path);
  const all_paths = [...modified_paths, ...created_paths, ...deleted_paths];

  for (const path of all_paths) {
    watcher_service.suppress_next(path);
  }

  for (const path of modified_paths) {
    const open_note = editor_store.open_note;
    if (open_note && open_note.meta.path === path && read_note_content) {
      try {
        const new_markdown = await read_note_content(path);
        const applied =
          editor_service.sync_visual_from_markdown_diff(new_markdown);
        if (!applied) {
          editor_service.sync_visual_from_markdown_undoable(new_markdown);
        }
        editor_store.set_markdown(open_note.meta.id, new_markdown);
        editor_service.mark_clean();
      } catch (err) {
        log.warn("Failed to read updated content, falling back to reload", {
          path,
          err,
        });
        await note_service.open_note(path, false, { force_reload: true });
      }
    } else if (open_note && open_note.meta.path === path) {
      await note_service.open_note(path, false, { force_reload: true });
    } else {
      const tab = tab_store.find_tab_by_path(as_note_path(path));
      if (tab) {
        tab_service.invalidate_cache(as_note_path(path));
      }
    }
  }

  for (const path of deleted_paths) {
    const tab = tab_store.find_tab_by_path(as_note_path(path));
    if (tab) {
      tab_store.close_tab(tab.id);
    }
  }

  const needs_tree_refresh =
    created_paths.length > 0 || deleted_paths.length > 0;

  if (all_paths.length > 0) {
    await reconcile_workspace(
      action_registry,
      {
        refresh_tree: needs_tree_refresh,
        sync_index_paths: {
          changed: [...created_paths, ...modified_paths],
          removed: deleted_paths,
        },
      },
      {
        workspace_reconcile: deps.workspace_reconcile,
        is_vault_mode: deps.is_vault_mode(),
      },
    );
  }
}

function resolve_uri_list(
  uris: string[],
  uri_to_path: (uri: string) => string | null,
): string[] {
  const paths: string[] = [];
  for (const uri of uris) {
    const path = uri_to_path(uri);
    if (path) paths.push(path);
  }
  return paths;
}
