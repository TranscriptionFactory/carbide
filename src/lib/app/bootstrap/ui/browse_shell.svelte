<script lang="ts">
  import { onMount } from "svelte";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { VirtualFileTree, flatten_filetree } from "$lib/features/folder";
  import { NoteEditor } from "$lib/features/note";
  import { TabBar } from "$lib/features/tab";
  import { DocumentViewer } from "$lib/features/document";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import { make_close_window_handler } from "$lib/hooks/use_close_window.svelte";
  import { create_logger } from "$lib/shared/utils/logger";
  import type { NoteMeta } from "$lib/shared/types/note";

  const log = create_logger("browse_shell");
  const { stores, action_registry } = use_app_context();

  const flat_nodes = $derived(
    flatten_filetree({
      notes: stores.notes.notes,
      folder_paths: stores.notes.folder_paths,
      files: stores.notes.files,
      expanded_paths: stores.ui.filetree.expanded_paths,
      load_states: stores.ui.filetree.load_states,
      error_messages: stores.ui.filetree.error_messages,
      show_hidden_files: stores.ui.editor_settings.show_hidden_files,
      pagination: stores.ui.filetree.pagination,
    }),
  );

  const active_tab = $derived(stores.tab.active_tab);
  const viewer_state = $derived(
    active_tab?.kind === "document"
      ? stores.document.get_viewer_state(active_tab.id)
      : undefined,
  );

  const handle_keydown = make_close_window_handler();

  onMount(() => {
    action_registry.execute(ACTION_IDS.app_mounted).catch((error) => {
      log.error("app_mounted failed in browse window", { error });
    });
  });
</script>

<svelte:window onkeydown={handle_keydown} />

<Tooltip.Provider delayDuration={0}>
<div class="BrowseShell">
  <Resizable.PaneGroup direction="horizontal" class="h-full">
    <Resizable.Pane defaultSize={20} minSize={10} maxSize={40} order={1}>
      <div class="BrowseShell__sidebar">
        <div class="BrowseShell__sidebar-header">
          <span class="BrowseShell__vault-name">
            {stores.vault.vault?.name ?? ""}
          </span>
        </div>
        <div class="BrowseShell__filetree">
          <VirtualFileTree
            nodes={flat_nodes}
            selected_path={stores.ui.selected_folder_path}
            revealed_note_path={stores.ui.filetree_revealed_note_path}
            open_note_path={stores.editor.open_note?.meta.path ?? ""}
            selected_items={Array.from(stores.ui.selected_items)}
            starred_paths={stores.notes.starred_paths}
            on_select_item={(payload) =>
              void action_registry.execute(
                ACTION_IDS.filetree_select_item,
                payload,
              )}
            on_toggle_folder={(path: string) =>
              void action_registry.execute(ACTION_IDS.folder_toggle, path)}
            on_select_note={(note_path: string) =>
              action_registry
                .execute(ACTION_IDS.note_open, note_path)
                .catch((error) =>
                  log.error("note_open failed", { error, note_path }),
                )}
            on_select_file={(file_path: string) =>
              action_registry
                .execute(ACTION_IDS.document_open, file_path)
                .catch((error) =>
                  log.error("document_open failed", { error, file_path }),
                )}
            on_select_folder={(path: string) =>
              void action_registry.execute(ACTION_IDS.ui_select_folder, path)}
            on_request_create_note={() =>
              void action_registry.execute(ACTION_IDS.note_create)}
            on_request_create_folder={(folder_path: string) =>
              void action_registry.execute(
                ACTION_IDS.folder_request_create,
                folder_path,
              )}
            on_toggle_star={(payload) =>
              void action_registry.execute(
                ACTION_IDS.filetree_toggle_star_selection,
                payload,
              )}
            on_open_to_side={(path: string) =>
              void action_registry.execute(
                ACTION_IDS.split_view_open_to_side,
                path,
              )}
            on_open_in_new_window={(file_path: string) =>
              void action_registry.execute(
                ACTION_IDS.window_open_viewer,
                file_path,
              )}
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
            on_request_delete={(note: NoteMeta) =>
              void action_registry.execute(
                ACTION_IDS.note_request_delete,
                note,
              )}
            on_request_rename={(note: NoteMeta) =>
              void action_registry.execute(
                ACTION_IDS.note_request_rename,
                note,
              )}
            on_request_delete_folder={(folder_path: string) =>
              void action_registry.execute(
                ACTION_IDS.folder_request_delete,
                folder_path,
              )}
            on_request_rename_folder={(folder_path: string) =>
              void action_registry.execute(
                ACTION_IDS.folder_request_rename,
                folder_path,
              )}
          />
        </div>
      </div>
    </Resizable.Pane>
    <Resizable.Handle withHandle />
    <Resizable.Pane order={2}>
      <div class="BrowseShell__main">
        <TabBar />
        <div class="BrowseShell__content">
          {#if viewer_state}
            <DocumentViewer {viewer_state} />
          {:else}
            <NoteEditor />
          {/if}
        </div>
      </div>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
</Tooltip.Provider>

<style>
  .BrowseShell {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .BrowseShell__sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-inline-end: 1px solid var(--border);
  }

  .BrowseShell__sidebar-header {
    display: flex;
    align-items: center;
    height: var(--size-touch-lg);
    padding-inline: var(--space-3);
    border-block-end: 1px solid var(--border);
    flex-shrink: 0;
  }

  .BrowseShell__vault-name {
    font-size: var(--text-sm);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .BrowseShell__filetree {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .BrowseShell__main {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .BrowseShell__content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
