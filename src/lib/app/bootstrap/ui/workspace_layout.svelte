<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Button } from "$lib/components/ui/button";
  import ActivityBar from "$lib/app/bootstrap/ui/activity_bar.svelte";
  import { VirtualFileTree } from "$lib/features/folder";
  import {
    VaultDashboardPanel,
    VaultSwitcherDropdown,
  } from "$lib/features/vault";
  import { NoteEditor, NoteDetailsDialog } from "$lib/features/note";
  import { SecondaryNoteEditor, SplitDropZone } from "$lib/features/tab";
  import BottomPanel from "$lib/app/bootstrap/ui/bottom_panel.svelte";
  import { TabBar } from "$lib/features/tab";
  import { FindInFileBar } from "$lib/features/search";
  import { EditorStatusBar } from "$lib/features/editor";
  import { ContextRail } from "$lib/features/links";
  import { FloatingOutline } from "$lib/features/outline";
  import { GraphPanel } from "$lib/features/graph";
  import { TaskPanel } from "$lib/features/task";
  import { TagPanel } from "$lib/features/tags";
  import { PluginRuntimeContainer } from "$lib/features/plugin";
  import { SvelteSet } from "svelte/reactivity";
  import { build_filetree, sort_tree } from "$lib/features/folder";
  import { flatten_filetree } from "$lib/features/folder";
  import { derive_starred_tree } from "$lib/features/folder";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { NoteMeta } from "$lib/shared/types/note";
  import {
    FilePlus,
    FolderPlus,
    RefreshCw,
    FoldVertical,
    Star,
    AppWindow,
  } from "@lucide/svelte";

  const { stores, action_registry, services } = use_app_context();

  let starred_expanded_node_ids = $state(new SvelteSet<string>());
  const split_view_active = $derived(stores.tab.is_split);
  const bottom_panel_open = $derived(stores.ui.bottom_panel_open);
  const is_vault_mode = $derived(stores.vault.is_vault_mode);

  const dashboard_task_counts = $derived.by(() => {
    const tasks = stores.task.tasks;
    if (tasks.length === 0) return null;
    let todo = 0,
      doing = 0,
      done = 0;
    for (const t of tasks) {
      if (t.status === "todo") todo++;
      else if (t.status === "doing") doing++;
      else if (t.status === "done") done++;
    }
    return { todo, doing, done };
  });
  const zen_mode = $derived(stores.ui.zen_mode);
  const layout_variant = $derived(stores.ui.active_theme.layout_variant);
  const is_monolith = $derived(layout_variant === "monolith");
  const is_workbench = $derived(layout_variant === "workbench");
  const is_command_deck = $derived(layout_variant === "command_deck");
  const is_grounded_heavy = $derived(layout_variant === "grounded_heavy");
  const is_hud = $derived(layout_variant === "hud");
  const is_zen_deck = $derived(layout_variant === "zen_deck");
  const is_dashboard = $derived(layout_variant === "dashboard");
  const is_spotlight = $derived(layout_variant === "spotlight");
  const is_cockpit = $derived(layout_variant === "cockpit");
  const is_theater = $derived(layout_variant === "theater");
  const is_triptych = $derived(layout_variant === "triptych");

  function starred_node_id(root_path: string, relative_path: string): string {
    return `starred:${root_path}:${relative_path}`;
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

  function toggle_starred_folder_node(node: {
    id: string;
    path: string;
    is_folder: boolean;
  }) {
    if (!node.is_folder) {
      return;
    }

    if (starred_expanded_node_ids.has(node.id)) {
      starred_expanded_node_ids.delete(node.id);
      return;
    }

    starred_expanded_node_ids.add(node.id);
    void action_registry.execute(ACTION_IDS.folder_retry_load, node.path);
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

  const indexed_tree = $derived(
    sort_tree(
      build_filetree(
        stores.notes.notes,
        stores.notes.folder_paths,
        stores.notes.files,
      ),
    ),
  );

  const starred_nodes = $derived.by(() => {
    if (stores.notes.starred_paths.length === 0) {
      return [];
    }
    return derive_starred_tree({
      tree: indexed_tree,
      starred_paths: stores.notes.starred_paths,
      expanded_node_ids: starred_expanded_node_ids,
      load_states: stores.ui.filetree.load_states,
      error_messages: stores.ui.filetree.error_messages,
      show_hidden_files: stores.ui.editor_settings.show_hidden_files,
      pagination: stores.ui.filetree.pagination,
    });
  });

  $effect(() => {
    const valid_ids = new Set(starred_nodes.map((node) => node.id));
    for (const id of starred_expanded_node_ids) {
      if (!valid_ids.has(id)) {
        starred_expanded_node_ids.delete(id);
      }
    }
  });

  const word_count = $derived(stores.editor.cursor?.total_words ?? 0);
  const line_count = $derived(stores.editor.cursor?.total_lines ?? 0);

  let details_dialog_open = $state(false);

  type HeaderAction = {
    icon: typeof FilePlus;
    label: string;
    onclick: () => void;
  };

  const explorer_header_actions: HeaderAction[] = [
    {
      icon: FilePlus,
      label: "New Note",
      onclick: () => void action_registry.execute(ACTION_IDS.note_create),
    },
    {
      icon: FolderPlus,
      label: "New Folder",
      onclick: () =>
        void action_registry.execute(
          ACTION_IDS.folder_request_create,
          stores.ui.selected_folder_path,
        ),
    },
    {
      icon: RefreshCw,
      label: "Refresh",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_refresh_tree),
    },
    {
      icon: FoldVertical,
      label: "Collapse All",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_collapse_all),
    },
    {
      icon: AppWindow,
      label: "Open in New Window",
      onclick: () => void action_registry.execute(ACTION_IDS.window_open_new),
    },
  ];

  const starred_header_actions: HeaderAction[] = [
    {
      icon: RefreshCw,
      label: "Refresh",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_refresh_tree),
    },
    {
      icon: FoldVertical,
      label: "Collapse All",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_collapse_all),
    },
  ];

  const dashboard_header_actions: HeaderAction[] = [
    {
      icon: RefreshCw,
      label: "Refresh",
      onclick: () =>
        void action_registry.execute(ACTION_IDS.folder_refresh_tree),
    },
  ];

  const sidebar_header_actions = $derived.by(() => {
    const view = stores.ui.sidebar_view;
    if (is_vault_mode && view === "starred") return starred_header_actions;
    if (is_vault_mode && view === "dashboard") return dashboard_header_actions;
    return explorer_header_actions;
  });

  $effect(() => {
    if (
      !is_vault_mode &&
      (stores.ui.sidebar_view === "starred" ||
        stores.ui.sidebar_view === "dashboard")
    ) {
      void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, "explorer");
    }
  });
</script>

{#if stores.vault.vault}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex h-screen flex-col"
    class:WorkspaceLayout--zen={zen_mode}
    class:WorkspaceLayout--monolith={is_monolith}
    class:WorkspaceLayout--workbench={is_workbench}
    class:WorkspaceLayout--command-deck={is_command_deck}
    class:WorkspaceLayout--grounded-heavy={is_grounded_heavy}
    class:WorkspaceLayout--hud={is_hud}
    class:WorkspaceLayout--zen-deck={is_zen_deck}
    class:WorkspaceLayout--dashboard={is_dashboard}
    class:WorkspaceLayout--spotlight={is_spotlight}
    class:WorkspaceLayout--cockpit={is_cockpit}
    class:WorkspaceLayout--theater={is_theater}
    class:WorkspaceLayout--triptych={is_triptych}
    data-sidebar-open={stores.ui.sidebar_open}
    data-context-rail-open={stores.ui.context_rail_open}
    onpointerdown={(e) => {
      if (stores.ui.selected_items.size <= 1) return;
      const target = e.target as HTMLElement;
      if (target.closest(".TreeRow")) return;
      void action_registry.execute(ACTION_IDS.filetree_clear_selection);
    }}
    onfocusin={(e) => {
      if (!stores.ui.editor_settings.vim_nav_enabled) return;
      const target = e.target as HTMLElement;
      const region = target.closest<HTMLElement>("[data-vim-nav-region]");
      if (region) {
        const ctx = region.dataset.vimNavRegion as
          | "file_tree"
          | "tab_bar"
          | "outline";
        stores.vim_nav.set_context(ctx);
      } else if (
        target.closest(".ProseMirror") ||
        target.closest(".cm-editor") ||
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA"
      ) {
        stores.vim_nav.set_context("none");
      }
    }}
    onkeydown={(e) => {
      if (zen_mode && e.key === "Escape") {
        void action_registry.execute(ACTION_IDS.ui_toggle_zen_mode);
      }
    }}
  >
    <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {#if !zen_mode}
        <ActivityBar
          sidebar_open={stores.ui.sidebar_open}
          active_view={stores.ui.sidebar_view}
          {is_vault_mode}
          dynamic_views={stores.plugin.sidebar_views}
          context_rail_open={stores.ui.context_rail_open}
          on_toggle_context_rail={is_command_deck ||
          is_grounded_heavy ||
          is_hud ||
          is_zen_deck ||
          is_dashboard ||
          is_spotlight ||
          is_cockpit ||
          is_theater ||
          is_triptych
            ? () =>
                void action_registry.execute(ACTION_IDS.ui_toggle_context_rail)
            : undefined}
          on_open_explorer={() => {
            if (
              stores.ui.sidebar_open &&
              stores.ui.sidebar_view === "explorer"
            ) {
              void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
              return;
            }
            void action_registry.execute(
              ACTION_IDS.ui_set_sidebar_view,
              "explorer",
            );
          }}
          on_open_starred={() => {
            if (
              stores.ui.sidebar_open &&
              stores.ui.sidebar_view === "starred"
            ) {
              void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
              return;
            }
            void action_registry.execute(
              ACTION_IDS.ui_set_sidebar_view,
              "starred",
            );
          }}
          on_open_dashboard={() => {
            if (
              stores.ui.sidebar_open &&
              stores.ui.sidebar_view === "dashboard"
            ) {
              void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
              return;
            }
            void action_registry.execute(
              ACTION_IDS.ui_set_sidebar_view,
              "dashboard",
            );
          }}
          on_open_graph={() => {
            if (stores.ui.sidebar_open && stores.ui.sidebar_view === "graph") {
              void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
              return;
            }
            void action_registry.execute(
              ACTION_IDS.ui_set_sidebar_view,
              "graph",
            );
          }}
          on_open_tasks={() => {
            if (stores.ui.sidebar_open && stores.ui.sidebar_view === "tasks") {
              void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
              return;
            }
            void action_registry.execute(
              ACTION_IDS.ui_set_sidebar_view,
              "tasks",
            );
          }}
          on_open_tags={() => {
            if (stores.ui.sidebar_open && stores.ui.sidebar_view === "tags") {
              void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
              return;
            }
            void action_registry.execute(
              ACTION_IDS.ui_set_sidebar_view,
              "tags",
            );
          }}
          on_open_dynamic={(id) => {
            if (stores.ui.sidebar_open && stores.ui.sidebar_view === id) {
              void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
              return;
            }
            void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, id);
          }}
          on_open_help={() =>
            void action_registry.execute(ACTION_IDS.help_open)}
          on_open_settings={() =>
            void action_registry.execute(ACTION_IDS.settings_open)}
        />
      {/if}
      <Sidebar.Provider
        open={stores.ui.sidebar_open && !zen_mode}
        class="flex-1 min-h-0"
      >
        <Resizable.PaneGroup direction="horizontal" class="flex-1 min-w-0">
          {#if stores.ui.sidebar_open && !zen_mode}
            <Resizable.Pane
              defaultSize={20}
              minSize={15}
              maxSize={40}
              order={1}
            >
              <Sidebar.Root collapsible="none" class="w-full">
                <Sidebar.Header class="p-0">
                  <div class="SidebarHeader">
                    <div class="SidebarHeader__top">
                      {#if stores.ui.sidebar_view === "starred"}
                        <span class="SidebarHeader__title">Starred</span>
                      {:else if stores.ui.sidebar_view === "dashboard"}
                        <span class="SidebarHeader__title">Dashboard</span>
                      {:else if stores.plugin.sidebar_views.find((v) => v.id === stores.ui.sidebar_view)}
                        <span class="SidebarHeader__title">
                          {stores.plugin.sidebar_views.find(
                            (v) => v.id === stores.ui.sidebar_view,
                          )?.label}
                        </span>
                      {:else}
                        <VaultSwitcherDropdown
                          recent_vaults={stores.vault.recent_vaults}
                          pinned_vault_ids={stores.vault.pinned_vault_ids}
                          current_vault_id={stores.vault.vault?.id ?? null}
                          current_vault_name={stores.vault.vault?.name ?? ""}
                          bind:open={stores.ui.vault_switcher_open}
                          git_cache={stores.vault.vault_git_cache}
                          on_select_vault={(id) => {
                            void action_registry.execute(
                              ACTION_IDS.vault_select,
                              id,
                            );
                          }}
                          on_choose_vault={() => {
                            void action_registry.execute(
                              ACTION_IDS.vault_choose,
                            );
                          }}
                          on_manage_vaults={() => {
                            void action_registry.execute(
                              ACTION_IDS.vault_request_change,
                            );
                          }}
                          on_toggle_pin={(id) => {
                            void action_registry.execute(
                              ACTION_IDS.vault_toggle_pin,
                              id,
                            );
                          }}
                          on_remove_vault={(id) => {
                            void action_registry.execute(
                              ACTION_IDS.vault_remove_from_registry,
                              id,
                            );
                          }}
                          on_reveal_vault={(path) => {
                            void action_registry.execute(
                              ACTION_IDS.shell_open_url,
                              path,
                            );
                          }}
                          on_dropdown_opened={() => {
                            void action_registry.execute(
                              ACTION_IDS.vault_fetch_git_info_for_list,
                            );
                          }}
                          on_select_folder={() => {
                            void action_registry.execute(
                              ACTION_IDS.ui_select_folder,
                              "",
                            );
                          }}
                          on_promote_to_vault={!is_vault_mode
                            ? () => {
                                void action_registry.execute(
                                  ACTION_IDS.vault_promote,
                                );
                              }
                            : undefined}
                        />
                      {/if}
                    </div>
                    <div class="SidebarHeader__actions">
                      {#each sidebar_header_actions as action (action.label)}
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            {#snippet child({ props })}
                              <Button
                                {...props}
                                variant="ghost"
                                size="icon"
                                class="SidebarHeaderButton"
                                onclick={action.onclick}
                              >
                                <action.icon class="SidebarHeaderIcon" />
                              </Button>
                            {/snippet}
                          </Tooltip.Trigger>
                          <Tooltip.Content>{action.label}</Tooltip.Content>
                        </Tooltip.Root>
                      {/each}
                    </div>
                  </div>
                </Sidebar.Header>

                <Sidebar.Content class="overflow-hidden">
                  {#if is_vault_mode && stores.ui.sidebar_view === "starred"}
                    <Sidebar.Group class="h-full">
                      <Sidebar.GroupContent class="h-full">
                        <VirtualFileTree
                          tree_style={stores.ui.editor_settings.file_tree_style}
                          show_blurb={stores.ui.editor_settings
                            .file_tree_show_blurb}
                          blurb_position={stores.ui.editor_settings
                            .file_tree_blurb_position}
                          nodes={starred_nodes}
                          selected_path={stores.ui.selected_folder_path}
                          revealed_note_path={stores.ui
                            .filetree_revealed_note_path}
                          open_note_path={stores.editor.open_note?.meta.path ??
                            ""}
                          selected_items={Array.from(stores.ui.selected_items)}
                          starred_paths={stores.notes.starred_paths}
                          on_select_item={(payload) =>
                            void action_registry.execute(
                              ACTION_IDS.filetree_select_item,
                              payload,
                            )}
                          on_toggle_folder={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_toggle,
                              path,
                            )}
                          on_toggle_folder_node={toggle_starred_folder_node}
                          on_select_note={(note_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.note_open,
                              note_path,
                            )}
                          on_select_file={(file_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.document_open,
                              file_path,
                            )}
                          on_select_folder={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.ui_select_folder,
                              path,
                            )}
                          on_request_create_note={() =>
                            void action_registry.execute(
                              ACTION_IDS.note_create,
                            )}
                          on_request_create_canvas={() =>
                            void action_registry.execute(
                              ACTION_IDS.canvas_create,
                            )}
                          on_request_create_folder={(folder_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_request_create,
                              folder_path,
                            )}
                          on_toggle_star={toggle_star_for_selection}
                          on_open_to_side={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.tab_open_to_side,
                              path,
                            )}
                          on_open_in_new_window={(file_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.window_open_viewer,
                              file_path,
                            )}
                          on_reveal_in_finder={(path: string) => {
                            const vault_path = stores.vault.vault?.path;
                            if (vault_path) {
                              void services.shell.reveal_in_file_manager(
                                `${vault_path}/${path}`,
                              );
                            }
                          }}
                          on_open_in_default_app={(path: string) => {
                            if (path.startsWith("/")) {
                              void services.shell.open_path(path);
                            } else {
                              const vault_path = stores.vault.vault?.path;
                              if (vault_path) {
                                void services.shell.open_path(
                                  `${vault_path}/${path}`,
                                );
                              }
                            }
                          }}
                          on_generate_description={stores.ui.editor_settings
                            .ai_enabled
                            ? (path: string) =>
                                void action_registry.execute(
                                  ACTION_IDS.ai_generate_description,
                                  path,
                                )
                            : undefined}
                          on_retry_load={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_retry_load,
                              path,
                            )}
                          on_load_more={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_load_more,
                              path,
                            )}
                          on_retry_load_more={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_load_more,
                              path,
                            )}
                          on_move_items={(items, target_folder, overwrite) =>
                            void action_registry.execute(
                              ACTION_IDS.filetree_move_items,
                              {
                                items,
                                target_folder,
                                overwrite,
                              },
                            )}
                        />
                      </Sidebar.GroupContent>
                    </Sidebar.Group>
                  {/if}

                  {#if is_vault_mode && stores.ui.sidebar_view === "dashboard"}
                    <Sidebar.Group class="h-full">
                      <Sidebar.GroupContent class="h-full">
                        <VaultDashboardPanel
                          stats_status={stores.notes.dashboard_stats.status}
                          note_count={stores.notes.dashboard_stats.value
                            ?.note_count ?? null}
                          folder_count={stores.notes.dashboard_stats.value
                            ?.folder_count ?? null}
                          recent_notes={stores.notes.recent_notes}
                          vault_name={stores.vault.vault.name}
                          vault_path={stores.vault.vault.path}
                          on_note_click={(note_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.note_open,
                              note_path,
                            )}
                          on_new_note={() =>
                            void action_registry.execute(
                              ACTION_IDS.note_create,
                            )}
                          on_search={() =>
                            void action_registry.execute(
                              ACTION_IDS.omnibar_open,
                            )}
                          on_reindex={() =>
                            void action_registry.execute(
                              ACTION_IDS.vault_reindex,
                            )}
                          task_counts={dashboard_task_counts}
                          git_enabled={stores.git.enabled}
                          git_branch={stores.git.branch}
                          git_is_dirty={stores.git.is_dirty}
                          git_pending_files={stores.git.pending_files}
                          tags={stores.tag.tags}
                          on_tag_click={(tag: string) =>
                            void action_registry.execute(
                              ACTION_IDS.tags_select,
                              tag,
                            )}
                        />
                      </Sidebar.GroupContent>
                    </Sidebar.Group>
                  {/if}

                  {#if is_vault_mode && stores.ui.sidebar_view === "graph"}
                    <Sidebar.Group class="h-full">
                      <Sidebar.GroupContent class="h-full">
                        <GraphPanel />
                      </Sidebar.GroupContent>
                    </Sidebar.Group>
                  {/if}

                  {#if is_vault_mode && stores.ui.sidebar_view === "tasks"}
                    <Sidebar.Group class="h-full">
                      <Sidebar.GroupContent class="h-full">
                        <TaskPanel />
                      </Sidebar.GroupContent>
                    </Sidebar.Group>
                  {/if}

                  {#if is_vault_mode && stores.ui.sidebar_view === "tags"}
                    <Sidebar.Group class="h-full">
                      <Sidebar.GroupContent class="h-full">
                        <TagPanel />
                      </Sidebar.GroupContent>
                    </Sidebar.Group>
                  {/if}

                  {#each stores.plugin.sidebar_views as view (view.id)}
                    {#if is_vault_mode && stores.ui.sidebar_view === view.id}
                      <Sidebar.Group class="h-full">
                        <Sidebar.GroupContent class="h-full">
                          {#if view.panel_props}
                            <view.panel {...view.panel_props} />
                          {:else}
                            <view.panel />
                          {/if}
                        </Sidebar.GroupContent>
                      </Sidebar.Group>
                    {/if}
                  {/each}

                  <Sidebar.Group
                    class="h-full"
                    hidden={stores.ui.sidebar_view !== "explorer"}
                  >
                    <Sidebar.GroupContent class="h-full">
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="h-full"
                        data-vim-nav-region="file_tree"
                        tabindex="-1"
                      >
                        <VirtualFileTree
                          tree_style={stores.ui.editor_settings.file_tree_style}
                          show_blurb={stores.ui.editor_settings
                            .file_tree_show_blurb}
                          blurb_position={stores.ui.editor_settings
                            .file_tree_blurb_position}
                          nodes={flat_nodes}
                          selected_path={stores.ui.selected_folder_path}
                          revealed_note_path={stores.ui
                            .filetree_revealed_note_path}
                          open_note_path={stores.editor.open_note?.meta.path ??
                            ""}
                          selected_items={Array.from(stores.ui.selected_items)}
                          starred_paths={stores.notes.starred_paths}
                          on_select_item={(payload) =>
                            void action_registry.execute(
                              ACTION_IDS.filetree_select_item,
                              payload,
                            )}
                          on_toggle_folder={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_toggle,
                              path,
                            )}
                          on_select_note={(note_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.note_open,
                              note_path,
                            )}
                          on_select_file={(file_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.document_open,
                              file_path,
                            )}
                          on_select_folder={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.ui_select_folder,
                              path,
                            )}
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
                          on_request_create_note={() =>
                            void action_registry.execute(
                              ACTION_IDS.note_create,
                            )}
                          on_request_create_canvas={() =>
                            void action_registry.execute(
                              ACTION_IDS.canvas_create,
                            )}
                          on_request_create_folder={(folder_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_request_create,
                              folder_path,
                            )}
                          on_toggle_star={toggle_star_for_selection}
                          on_open_to_side={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.tab_open_to_side,
                              path,
                            )}
                          on_open_in_new_window={(file_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.window_open_viewer,
                              file_path,
                            )}
                          on_reveal_in_finder={(path: string) => {
                            const vault_path = stores.vault.vault?.path;
                            if (vault_path) {
                              void services.shell.reveal_in_file_manager(
                                `${vault_path}/${path}`,
                              );
                            }
                          }}
                          on_open_in_default_app={(path: string) => {
                            if (path.startsWith("/")) {
                              void services.shell.open_path(path);
                            } else {
                              const vault_path = stores.vault.vault?.path;
                              if (vault_path) {
                                void services.shell.open_path(
                                  `${vault_path}/${path}`,
                                );
                              }
                            }
                          }}
                          on_generate_description={stores.ui.editor_settings
                            .ai_enabled
                            ? (path: string) =>
                                void action_registry.execute(
                                  ACTION_IDS.ai_generate_description,
                                  path,
                                )
                            : undefined}
                          on_retry_load={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_retry_load,
                              path,
                            )}
                          on_load_more={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_load_more,
                              path,
                            )}
                          on_retry_load_more={(path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_load_more,
                              path,
                            )}
                          on_move_items={(items, target_folder, overwrite) =>
                            void action_registry.execute(
                              ACTION_IDS.filetree_move_items,
                              {
                                items,
                                target_folder,
                                overwrite,
                              },
                            )}
                        />
                      </div>
                    </Sidebar.GroupContent>
                  </Sidebar.Group>
                </Sidebar.Content>

                <Sidebar.Rail />
              </Sidebar.Root>
            </Resizable.Pane>
            <Resizable.Handle />
          {/if}
          <Resizable.Pane order={2}>
            <Sidebar.Inset class="flex h-full min-h-0 flex-col">
              <Resizable.PaneGroup direction="vertical" class="flex-1 min-h-0">
                <Resizable.Pane
                  defaultSize={bottom_panel_open ? 70 : 100}
                  minSize={20}
                  order={1}
                >
                  <div class="flex h-full min-h-0 min-w-0 flex-col">
                    {#if !zen_mode}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div data-vim-nav-region="tab_bar" tabindex="-1">
                        <TabBar />
                      </div>
                    {/if}
                    <div class="flex min-h-0 flex-1 flex-col">
                      <FindInFileBar
                        open={stores.ui.find_in_file.open}
                        query={stores.ui.find_in_file.query}
                        match_count={stores.search.find_match_count}
                        selected_match_index={stores.ui.find_in_file
                          .selected_match_index}
                        show_replace={stores.ui.find_in_file.show_replace}
                        replace_text={stores.ui.find_in_file.replace_text}
                        on_query_change={(query: string) =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_set_query,
                            query,
                          )}
                        on_next={() =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_next,
                          )}
                        on_prev={() =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_prev,
                          )}
                        on_close={() =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_close,
                          )}
                        on_toggle_replace={() =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_toggle_replace,
                          )}
                        on_replace_text_change={(text: string) =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_set_replace_text,
                            text,
                          )}
                        on_replace_one={() =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_replace_one,
                          )}
                        on_replace_all={() =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_replace_all,
                          )}
                      />
                      <div
                        class="SplitViewContainer"
                        class:SplitViewContainer--split={split_view_active}
                      >
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div
                          class="SplitViewContainer__primary"
                          onclick={() => {
                            if (split_view_active) {
                              void action_registry.execute(
                                ACTION_IDS.tab_set_active_pane,
                                "primary",
                              );
                            }
                          }}
                        >
                          <NoteEditor />
                          <FloatingOutline />
                        </div>
                        {#if split_view_active}
                          <div class="SplitViewContainer__handle"></div>
                          <div class="SplitViewContainer__secondary">
                            <SecondaryNoteEditor />
                          </div>
                        {/if}
                        <SplitDropZone />
                      </div>
                    </div>
                  </div>
                </Resizable.Pane>
                {#if bottom_panel_open}
                  <Resizable.Handle />
                  <Resizable.Pane
                    defaultSize={30}
                    minSize={10}
                    maxSize={80}
                    order={2}
                  >
                    <BottomPanel />
                  </Resizable.Pane>
                {/if}
              </Resizable.PaneGroup>
            </Sidebar.Inset>
          </Resizable.Pane>
          {#if stores.ui.context_rail_open && !zen_mode}
            <Resizable.Handle />
            <Resizable.Pane
              defaultSize={20}
              minSize={12}
              maxSize={35}
              order={3}
            >
              <ContextRail />
            </Resizable.Pane>
          {/if}
        </Resizable.PaneGroup>
      </Sidebar.Provider>
    </div>
    {#if !zen_mode}
      <EditorStatusBar
        cursor_info={stores.editor.cursor}
        {word_count}
        {line_count}
        has_note={!!stores.editor.open_note}
        last_saved_at={stores.editor.last_saved_at}
        index_progress={is_vault_mode
          ? stores.search.index_progress
          : { status: "idle", indexed: 0, total: 0, error: null }}
        vault_name={stores.vault.vault?.name ?? null}
        git_enabled={is_vault_mode && stores.git.enabled}
        git_branch={is_vault_mode ? stores.git.branch : ""}
        git_is_dirty={is_vault_mode && stores.git.is_dirty}
        git_pending_files={is_vault_mode ? stores.git.pending_files : 0}
        git_sync_status={is_vault_mode ? stores.git.sync_status : "idle"}
        git_has_remote={is_vault_mode && stores.git.has_remote}
        git_is_fetching={is_vault_mode && stores.op.is_pending("git.fetch")}
        git_ahead={is_vault_mode ? stores.git.ahead : 0}
        git_behind={is_vault_mode ? stores.git.behind : 0}
        is_repairing_links={is_vault_mode &&
          stores.op.is_pending("links.repair")}
        link_repair_message={is_vault_mode
          ? stores.op.get("links.repair").message
          : null}
        on_vault_click={() =>
          void action_registry.execute(ACTION_IDS.vault_request_change)}
        on_info_click={() => (details_dialog_open = true)}
        on_git_click={() =>
          void action_registry.execute(ACTION_IDS.git_open_history)}
        on_git_fetch={() => void action_registry.execute(ACTION_IDS.git_fetch)}
        on_git_push={() => void action_registry.execute(ACTION_IDS.git_push)}
        on_git_pull={() => void action_registry.execute(ACTION_IDS.git_pull)}
        on_git_sync={() => void action_registry.execute(ACTION_IDS.git_sync)}
        on_git_add_remote={() =>
          void action_registry.execute(ACTION_IDS.git_add_remote)}
        on_sync_click={() =>
          void action_registry.execute(ACTION_IDS.vault_sync_index)}
        lint_is_running={stores.lint.is_running}
        lint_error_count={stores.diagnostics.error_count}
        lint_warning_count={stores.diagnostics.warning_count}
        on_lint_click={() =>
          void action_registry.execute(ACTION_IDS.lint_toggle_problems)}
        on_lint_format_click={() =>
          void action_registry.execute(ACTION_IDS.lint_format_file)}
        stt_enabled={stores.stt.config.enabled}
        stt_recording_state={stores.stt.recording_state}
        stt_model_loading={stores.stt.model_loading}
        stt_has_model={stores.stt.is_ready}
        on_stt_click={() =>
          void action_registry.execute(ACTION_IDS.stt_toggle_recording)}
        on_stt_settings_click={() =>
          void action_registry.execute(ACTION_IDS.stt_open_settings)}
        editor_mode={stores.editor.editor_mode}
        split_view={stores.editor.split_view}
        on_split_toggle={() =>
          void action_registry.execute(ACTION_IDS.editor_toggle_split_view)}
        status_bar_items={stores.plugin.status_bar_items}
        on_mode_toggle={() =>
          void action_registry.execute(ACTION_IDS.editor_toggle_mode)}
        show_line_numbers={stores.ui.editor_settings.source_editor_line_numbers}
        on_line_numbers_toggle={() =>
          void action_registry.execute(ACTION_IDS.editor_toggle_line_numbers)}
        zoom_percent={stores.editor.zoom_percent}
        on_zoom_reset={() =>
          void action_registry.execute(ACTION_IDS.editor_zoom_reset)}
        vim_nav_enabled={stores.ui.editor_settings.vim_nav_enabled}
        vim_nav_context={stores.vim_nav.active_context}
        vim_nav_pending_keys={stores.vim_nav.pending_keys}
        on_vim_nav_cheatsheet={() =>
          void action_registry.execute(ACTION_IDS.vim_nav_cheatsheet_toggle)}
      />
    {/if}

    <PluginRuntimeContainer />
  </div>

  <NoteDetailsDialog
    open={details_dialog_open}
    note={stores.editor.open_note}
    {word_count}
    {line_count}
    on_close={() => (details_dialog_open = false)}
  />
{/if}

<style>
  .WorkspaceLayout--zen :global(.cm-editor) {
    max-width: 72ch;
    margin-inline: auto;
  }

  .SplitViewContainer {
    display: flex;
    flex-direction: row;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  .SplitViewContainer__primary {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .SplitViewContainer--split .SplitViewContainer__primary {
    flex: 1 1 50%;
  }

  .SplitViewContainer__handle {
    width: 1px;
    flex-shrink: 0;
    background-color: var(--border);
    cursor: col-resize;
  }

  .SplitViewContainer__secondary {
    flex: 1 1 50%;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .SidebarHeader {
    display: flex;
    flex-direction: column;
    border-block-end: 1px solid var(--border);
  }

  .SidebarHeader__top {
    display: flex;
    align-items: center;
    height: var(--size-touch-lg);
    padding-inline: var(--space-3);
  }

  .SidebarHeader__title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    font-weight: 600;
    font-size: var(--text-sm);
  }

  .SidebarHeader__actions {
    display: flex;
    align-items: center;
    padding-inline: var(--space-2);
    padding-block-end: var(--space-1);
  }

  :global(.SidebarHeaderButton) {
    width: var(--size-touch-sm);
    height: var(--size-touch-sm);
    color: var(--muted-foreground);
    transition: color var(--duration-fast) var(--ease-default);
  }

  :global(.SidebarHeaderButton:hover) {
    color: var(--foreground);
  }

  :global(.SidebarHeaderIcon) {
    width: var(--size-icon-sm);
    height: var(--size-icon-sm);
  }

  :global(.StarredGroupLabel) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline: var(--space-4);
  }

  :global(.StarredGroupLabel__icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
  }
</style>
