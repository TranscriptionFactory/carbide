import { open_active_tab_note } from "$lib/features/tab";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { detect_file_type } from "$lib/features/document";
import { as_note_path } from "$lib/shared/types/ids";
import { error_message } from "$lib/shared/utils/error_message";
import { toast } from "$lib/shared/ui/toast";
import { build_file_path_from_name } from "$lib/features/note/application/note_action_helpers";

export function register_file_actions(input: ActionRegistrationInput) {
  const { registry, stores, services } = input;
  function target_path(value?: unknown): string | null {
    if (typeof value === "string") return value;
    const tab = stores.tab.active_tab;
    return tab?.kind === "document"
      ? tab.file_path
      : tab?.kind === "note"
        ? tab.note_path
        : null;
  }
  async function copy(
    action: "save_file_as" | "duplicate_file",
    value?: unknown,
  ) {
    const path = target_path(value);
    if (!path) return;
    try {
      stores.ui.system_dialog_open = true;
      await services.note[action](path);
      await input.workspace_reconcile?.({ refresh_tree: true });
    } catch (error) {
      toast.error(error_message(error));
    } finally {
      stores.ui.system_dialog_open = false;
    }
  }
  registry.register({
    id: ACTION_IDS.file_save_as,
    label: "Save As",
    execute: (path) => copy("save_file_as", path),
  });
  registry.register({
    id: ACTION_IDS.file_duplicate,
    label: "Duplicate File",
    execute: (path) => copy("duplicate_file", path),
  });
  for (const mode of ["rename", "delete"] as const) {
    registry.register({
      id:
        mode === "rename"
          ? ACTION_IDS.file_request_rename
          : ACTION_IDS.file_request_delete,
      label: mode === "rename" ? "Rename File" : "Delete File",
      execute: (value) => {
        const path = target_path(value);
        if (!path || /\.md$/i.test(path) || stores.ui.file_dialog.pending)
          return;
        stores.ui.file_dialog = {
          mode,
          path,
          new_name: path.split("/").pop() ?? path,
          pending: false,
          error: null,
        };
      },
    });
  }
  registry.register({
    id: ACTION_IDS.file_update_name,
    label: "Set Filename",
    execute: (name) => {
      if (stores.ui.file_dialog.pending || typeof name !== "string") return;
      stores.ui.file_dialog = {
        ...stores.ui.file_dialog,
        new_name: name,
        error: null,
      };
    },
  });
  registry.register({
    id: ACTION_IDS.file_cancel,
    label: "Cancel File Action",
    execute: () => {
      if (!stores.ui.file_dialog.pending)
        stores.ui.file_dialog = {
          mode: null,
          path: "",
          new_name: "",
          pending: false,
          error: null,
        };
    },
  });
  registry.register({
    id: ACTION_IDS.file_confirm,
    label: "Confirm File Action",
    execute: async () => {
      const dialog = stores.ui.file_dialog;
      if (!dialog.mode || dialog.pending) return;
      stores.ui.file_dialog = { ...dialog, pending: true, error: null };
      try {
        if (dialog.mode === "rename") {
          const target = build_file_path_from_name(
            dialog.path,
            dialog.new_name,
          );
          if (target !== dialog.path) {
            if (stores.tab.tabs.some((tab) => tab.id === target))
              throw new Error("The destination is already open");
            await services.note.rename_file(dialog.path, target);
            services.document.rename_document(dialog.path, target);
            stores.tab.update_tab_path(
              as_note_path(dialog.path),
              as_note_path(target),
              detect_file_type(target) ?? undefined,
            );
          }
        } else {
          await services.note.delete_file(dialog.path);
          const active_before_close = stores.tab.active_tab_id;
          for (const tab of [...stores.tab.tabs]) {
            if (tab.kind !== "document" || tab.file_path !== dialog.path)
              continue;
            services.document.close_document(tab.id);
            stores.tab.close_tab(tab.id);
          }
          if (stores.tab.active_tab_id !== active_before_close) {
            await open_active_tab_note(input);
          }
        }
        await input.workspace_reconcile?.({ refresh_tree: true });
        stores.ui.file_dialog = {
          mode: null,
          path: "",
          new_name: "",
          pending: false,
          error: null,
        };
      } catch (error) {
        stores.ui.file_dialog = {
          ...dialog,
          pending: false,
          error: error_message(error),
        };
      }
    },
  });
  const copy_markdown = registry
    .get_all()
    .find((action) => action.id === ACTION_IDS.note_copy_markdown);
  if (copy_markdown)
    registry.register({
      ...copy_markdown,
      when: () =>
        stores.tab.active_tab?.kind === "note" &&
        (!copy_markdown.when || copy_markdown.when()),
    });
}
