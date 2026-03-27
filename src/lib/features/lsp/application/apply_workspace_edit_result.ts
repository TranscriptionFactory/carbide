import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { NoteService } from "$lib/features/note";
import type { EditorStore } from "$lib/features/editor";
import type { TabStore } from "$lib/features/tab";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { MarksmanWorkspaceEditResult } from "$lib/features/marksman";
import { as_note_path } from "$lib/shared/types/ids";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("apply_workspace_edit_result");

type WorkspaceEditDeps = {
  note_service: NoteService;
  editor_store: EditorStore;
  tab_store: TabStore;
  action_registry: ActionRegistry;
  op_store: OpStore;
  uri_to_path: (uri: string) => string | null;
};

export async function apply_workspace_edit_result(
  result: MarksmanWorkspaceEditResult,
  deps: WorkspaceEditDeps,
): Promise<void> {
  const {
    note_service,
    editor_store,
    tab_store,
    action_registry,
    op_store,
    uri_to_path,
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

  const needs_tree_refresh =
    result.files_created.length > 0 || result.files_deleted.length > 0;

  for (const uri of result.files_modified) {
    const path = uri_to_path(uri);
    if (!path) continue;

    const open_path = editor_store.open_note?.meta.path;
    if (open_path === path) {
      await note_service.open_note(path, false, { force_reload: true });
    }
  }

  for (const uri of result.files_deleted) {
    const path = uri_to_path(uri);
    if (!path) continue;

    const tab = tab_store.find_tab_by_path(as_note_path(path));
    if (tab) {
      tab_store.close_tab(tab.id);
    }
  }

  if (needs_tree_refresh) {
    void action_registry.execute(ACTION_IDS.folder_refresh_tree);
  }
}
