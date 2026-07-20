<script lang="ts">
  import SidebarFileTree from "$lib/app/bootstrap/ui/sidebar_file_tree.svelte";
  import { DrillDownFileTree, RecentsFileView } from "$lib/features/folder";
  import { flatten_filetree, resolve_entry_target } from "$lib/features/folder";
  import { BasesRailSection } from "$lib/features/bases";
  import { TypesRailSection, build_type_sections } from "$lib/features/types";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { NoteMeta } from "$lib/shared/types/note";

  const { stores, action_registry, services } = use_app_context();

  $effect(() => {
    if (stores.ui.editor_settings.file_tree_mode === "recents") {
      void action_registry.execute(ACTION_IDS.recents_reload);
    }
  });

  function execute_sidebar_entry_action(
    path: string,
    folder_action_id: string,
    note_action_id: string,
  ) {
    const target = resolve_entry_target(
      path,
      stores.notes.folder_paths,
      stores.notes.notes,
    );
    if (!target) {
      return;
    }
    if (target.kind === "folder") {
      void action_registry.execute(folder_action_id, target.path);
    } else {
      void action_registry.execute(note_action_id, target.note);
    }
  }

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
</script>

<div
  class="flex items-center border-b border-zinc-200 dark:border-zinc-800 px-1 shrink-0"
  role="group"
  aria-label="File tree mode"
>
  {#each [{ mode: "tree" as const, label: "Tree" }, { mode: "drilldown" as const, label: "Folders" }, { mode: "recents" as const, label: "Recents" }, { mode: "bases" as const, label: "Bases" }] as mode_tab}
    <button
      type="button"
      aria-pressed={(stores.ui.editor_settings.file_tree_mode ?? "tree") ===
        mode_tab.mode}
      class="px-2.5 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors {(stores
        .ui.editor_settings.file_tree_mode ?? 'tree') === mode_tab.mode
        ? 'border-blue-500 text-foreground'
        : 'border-transparent text-zinc-500 hover:text-foreground'}"
      onclick={() =>
        void action_registry.execute(
          ACTION_IDS.filetree_set_mode,
          mode_tab.mode,
        )}
    >
      {mode_tab.label}
    </button>
  {/each}
</div>
{#if stores.ui.editor_settings.file_tree_mode === "bases"}
  <div class="flex-1 min-h-0 overflow-y-auto">
    <BasesRailSection />
    <TypesRailSection
      sections={build_type_sections(
        stores.types.backend_types,
        stores.types.definitions,
        { include_hidden: true },
      )}
      active_type={stores.types.active_type}
      on_select={(name) =>
        void action_registry.execute(ACTION_IDS.types_select, name)}
      on_create={(name) =>
        void action_registry.execute(ACTION_IDS.types_create, name)}
      on_toggle_visibility={(section) =>
        void action_registry.execute(
          ACTION_IDS.types_set_visibility,
          section.path,
          !section.visible,
        )}
      on_rename={(section, label) =>
        void action_registry.execute(
          ACTION_IDS.types_rename,
          section.path,
          label,
        )}
      on_customize={(section) =>
        void action_registry.execute(
          ACTION_IDS.types_set_icon_color,
          section.path,
          section.icon,
          section.color,
        )}
      on_delete={(section) => {
        const note = stores.notes.notes.find((n) => n.path === section.path);
        if (note) {
          void action_registry.execute(ACTION_IDS.note_request_delete, note);
        }
      }}
    />
  </div>
{:else if stores.ui.editor_settings.file_tree_mode === "recents"}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex-1 min-h-0" data-vim-nav-region="file_tree" tabindex="-1">
    <RecentsFileView
      results={stores.recents.results}
      error={stores.recents.error}
      sort={stores.ui.editor_settings.recents_sort.option}
      direction={stores.ui.editor_settings.recents_sort.direction}
      period={stores.ui.editor_settings.recents_period}
      on_change_sort={(s) =>
        void action_registry.execute(ACTION_IDS.recents_set_sort, s)}
      on_change_direction={(d) =>
        void action_registry.execute(
          ACTION_IDS.recents_set_sort,
          stores.ui.editor_settings.recents_sort.option,
          d,
        )}
      on_change_period={(p) =>
        void action_registry.execute(ACTION_IDS.recents_set_period, p)}
      on_open_note={(path) =>
        void action_registry.execute(ACTION_IDS.note_open, path)}
      is_starred={(path: string) => stores.notes.is_starred_path(path)}
      on_toggle_star={(note: NoteMeta) =>
        void action_registry.execute(ACTION_IDS.note_toggle_star, note)}
      on_open_to_side={(note: NoteMeta) =>
        void action_registry.execute(ACTION_IDS.tab_open_to_side, note.path)}
      on_open_in_new_window={(note: NoteMeta) =>
        void action_registry.execute(ACTION_IDS.window_open_viewer, note.path)}
      on_reveal_in_finder={(note: NoteMeta) => {
        const vault_path = stores.vault.vault?.path;
        if (vault_path) {
          void services.shell.reveal_in_file_manager(
            `${vault_path}/${note.path}`,
          );
        }
      }}
      on_open_in_default_app={(note: NoteMeta) => {
        const vault_path = stores.vault.vault?.path;
        if (vault_path) {
          void services.shell.open_path(`${vault_path}/${note.path}`);
        }
      }}
      on_rename={(note: NoteMeta) =>
        void action_registry.execute(ACTION_IDS.note_request_rename, note)}
      on_delete={(note: NoteMeta) =>
        void action_registry.execute(ACTION_IDS.note_request_delete, note)}
    />
  </div>
{:else if stores.ui.editor_settings.file_tree_mode === "drilldown"}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex-1 min-h-0" data-vim-nav-region="file_tree" tabindex="-1">
    <DrillDownFileTree
      notes={stores.notes.notes}
      folder_paths={stores.notes.folder_paths}
      files={stores.notes.files}
      current_path={stores.ui.selected_folder_path}
      show_hidden_files={stores.ui.editor_settings.show_hidden_files}
      on_enter_folder={(path: string) => {
        void action_registry.execute(ACTION_IDS.filetree_reveal_folder, path);
        void action_registry.execute(
          ACTION_IDS.filetree_open_folder_note,
          path,
        );
      }}
      on_open_note={(path: string) =>
        void action_registry.execute(ACTION_IDS.note_open, path)}
      on_open_file={(path: string) =>
        void action_registry.execute(ACTION_IDS.document_open, path)}
      is_starred={(path: string) => stores.notes.is_starred_path(path)}
      on_toggle_star={(path: string) =>
        void action_registry.execute(
          stores.notes.folder_paths.includes(path)
            ? ACTION_IDS.folder_toggle_star
            : ACTION_IDS.note_toggle_star,
          path,
        )}
      on_open_to_side={(path: string) =>
        void action_registry.execute(ACTION_IDS.tab_open_to_side, path)}
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
      on_rename={(path: string) =>
        execute_sidebar_entry_action(
          path,
          ACTION_IDS.folder_request_rename,
          ACTION_IDS.note_request_rename,
        )}
      on_delete={(path: string) =>
        execute_sidebar_entry_action(
          path,
          ACTION_IDS.folder_request_delete,
          ACTION_IDS.note_request_delete,
        )}
    />
  </div>
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex-1 min-h-0" data-vim-nav-region="file_tree" tabindex="-1">
    <SidebarFileTree nodes={flat_nodes} />
  </div>
{/if}
