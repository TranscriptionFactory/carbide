<script lang="ts">
  import { VirtualFileTree } from "$lib/features/folder";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { NoteMeta } from "$lib/shared/types/note";
  import type { FlatTreeNode } from "$lib/shared/types/filetree";

  const { stores, action_registry, services } = use_app_context();

  let {
    nodes,
    on_toggle_folder_node = undefined,
    on_select_folder = default_select_folder,
    manage_actions = true,
  }: {
    nodes: FlatTreeNode[];
    on_toggle_folder_node?: ((node: FlatTreeNode) => void) | undefined;
    on_select_folder?: (path: string) => void;
    manage_actions?: boolean;
  } = $props();

  function default_select_folder(path: string) {
    void action_registry.execute(ACTION_IDS.ui_select_folder, path);
    void action_registry.execute(ACTION_IDS.filetree_open_folder_note, path);
  }

  function toggle_star_for_selection(payload: {
    paths: string[];
    all_starred: boolean;
  }) {
    void action_registry.execute(
      ACTION_IDS.filetree_toggle_star_selection,
      payload,
    );
  }
</script>

<VirtualFileTree
  tree_style={stores.ui.editor_settings.file_tree_style}
  show_blurb={stores.ui.editor_settings.file_tree_show_blurb}
  blurb_position={stores.ui.editor_settings.file_tree_blurb_position}
  {nodes}
  selected_path={stores.ui.selected_folder_path}
  revealed_note_path={stores.ui.filetree_revealed_note_path}
  open_note_path={stores.editor.open_note?.meta.path ?? ""}
  selected_items={Array.from(stores.ui.selected_items)}
  starred_paths={stores.notes.starred_paths}
  on_select_item={(payload) =>
    void action_registry.execute(ACTION_IDS.filetree_select_item, payload)}
  on_toggle_folder={(path: string) =>
    void action_registry.execute(ACTION_IDS.folder_toggle, path)}
  {on_toggle_folder_node}
  on_select_note={(note_path: string) =>
    void action_registry.execute(ACTION_IDS.note_open, note_path)}
  on_select_file={(file_path: string) =>
    void action_registry.execute(ACTION_IDS.document_open, file_path)}
  {on_select_folder}
  on_request_delete={manage_actions
    ? (note: NoteMeta) =>
        void action_registry.execute(ACTION_IDS.note_request_delete, note)
    : undefined}
  on_request_rename={manage_actions
    ? (note: NoteMeta) =>
        void action_registry.execute(ACTION_IDS.note_request_rename, note)
    : undefined}
  on_request_delete_folder={manage_actions
    ? (folder_path: string) =>
        void action_registry.execute(
          ACTION_IDS.folder_request_delete,
          folder_path,
        )
    : undefined}
  on_request_rename_folder={manage_actions
    ? (folder_path: string) =>
        void action_registry.execute(
          ACTION_IDS.folder_request_rename,
          folder_path,
        )
    : undefined}
  on_request_create_note={() =>
    void action_registry.execute(ACTION_IDS.note_create)}
  on_request_create_canvas={() =>
    void action_registry.execute(ACTION_IDS.canvas_create)}
  on_request_create_folder={(folder_path: string) =>
    void action_registry.execute(ACTION_IDS.folder_request_create, folder_path)}
  on_request_folder_note={(folder_path: string) =>
    void action_registry.execute(
      ACTION_IDS.filetree_create_or_open_folder_note,
      folder_path,
    )}
  on_set_note_property={(note_path: string, key: string, value: string) =>
    void action_registry.execute(ACTION_IDS.metadata_set_property_for_path, {
      note_path,
      key,
      value,
    })}
  on_toggle_star={toggle_star_for_selection}
  on_open_to_side={(path: string) =>
    void action_registry.execute(ACTION_IDS.tab_open_to_side, path)}
  on_open_in_new_window={(file_path: string) =>
    void action_registry.execute(ACTION_IDS.window_open_viewer, file_path)}
  on_reveal_in_finder={(path: string) => {
    const vault_path = stores.vault.vault?.path;
    if (vault_path) {
      void services.shell.reveal_in_file_manager(`${vault_path}/${path}`);
    }
  }}
  on_open_in_default_app={(path: string) => {
    if (path.startsWith("/")) {
      void services.shell.open_path(path);
    } else {
      const vault_path = stores.vault.vault?.path;
      if (vault_path) {
        void services.shell.open_path(`${vault_path}/${path}`);
      }
    }
  }}
  on_generate_description={stores.ui.editor_settings.ai_enabled
    ? (path: string) =>
        void action_registry.execute(ACTION_IDS.ai_generate_description, path)
    : undefined}
  on_retry_load={(path: string) =>
    void action_registry.execute(ACTION_IDS.folder_retry_load, path)}
  on_load_more={(path: string) =>
    void action_registry.execute(ACTION_IDS.folder_load_more, path)}
  on_retry_load_more={(path: string) =>
    void action_registry.execute(ACTION_IDS.folder_load_more, path)}
  on_move_items={(items, target_folder, overwrite) =>
    void action_registry.execute(ACTION_IDS.filetree_move_items, {
      items,
      target_folder,
      overwrite,
    })}
  on_import_external_files={(files, target_folder) =>
    void action_registry.execute(ACTION_IDS.filetree_import_external_files, {
      files,
      target_folder,
    })}
/>
