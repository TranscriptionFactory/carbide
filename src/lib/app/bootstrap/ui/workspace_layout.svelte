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
  import { SplitNoteEditor, SplitDropZone } from "$lib/features/split_view";
  import { TerminalPanel } from "$lib/features/terminal";
  import { TabBar } from "$lib/features/tab";
  import { FindInFileBar } from "$lib/features/search";
  import { EditorStatusBar } from "$lib/features/editor";
  import { ContextRail } from "$lib/features/links";
  import { GraphPanel } from "$lib/features/graph";
  import { TaskPanel } from "$lib/features/task";
  import { PluginIframeHost } from "$lib/features/plugin";
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
  const split_view_active = $derived(stores.split_view.active);
  const terminal_open = $derived(stores.terminal.panel_open);
  const is_vault_mode = $derived(stores.vault.is_vault_mode);

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
    onpointerdown={(e) => {
      if (stores.ui.selected_items.size <= 1) return;
      const target = e.target as HTMLElement;
      if (target.closest(".TreeRow")) return;
      void action_registry.execute(ACTION_IDS.filetree_clear_selection);
    }}
  >
    <div class="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <ActivityBar
        sidebar_open={stores.ui.sidebar_open}
        active_view={stores.ui.sidebar_view}
        {is_vault_mode}
        dynamic_views={stores.plugin.sidebar_views}
        on_open_explorer={() => {
          if (stores.ui.sidebar_open && stores.ui.sidebar_view === "explorer") {
            void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
            return;
          }
          void action_registry.execute(
            ACTION_IDS.ui_set_sidebar_view,
            "explorer",
          );
        }}
        on_open_starred={() => {
          if (stores.ui.sidebar_open && stores.ui.sidebar_view === "starred") {
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
          void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, "graph");
        }}
        on_open_tasks={() => {
          if (stores.ui.sidebar_open && stores.ui.sidebar_view === "tasks") {
            void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
            return;
          }
          void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, "tasks");
        }}
        on_open_dynamic={(id) => {
          if (stores.ui.sidebar_open && stores.ui.sidebar_view === id) {
            void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
            return;
          }
          void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, id);
        }}
        on_open_help={() => void action_registry.execute(ACTION_IDS.help_open)}
        on_open_settings={() =>
          void action_registry.execute(ACTION_IDS.settings_open)}
      />
      <Sidebar.Provider open={stores.ui.sidebar_open} class="flex-1 min-h-0">
        <Resizable.PaneGroup direction="horizontal" class="h-full">
          {#if stores.ui.sidebar_open}
            <Resizable.Pane
              defaultSize={15}
              minSize={10}
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
                          on_request_create_folder={(folder_path: string) =>
                            void action_registry.execute(
                              ACTION_IDS.folder_request_create,
                              folder_path,
                            )}
                          on_toggle_star={toggle_star_for_selection}
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

                  {#each stores.plugin.sidebar_views as view (view.id)}
                    {#if is_vault_mode && stores.ui.sidebar_view === view.id}
                      <Sidebar.Group class="h-full">
                        <Sidebar.GroupContent class="h-full">
                          <view.panel />
                        </Sidebar.GroupContent>
                      </Sidebar.Group>
                    {/if}
                  {/each}

                  <Sidebar.Group
                    class="h-full"
                    hidden={stores.ui.sidebar_view !== "explorer"}
                  >
                    <Sidebar.GroupContent class="h-full">
                      <VirtualFileTree
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
                          void action_registry.execute(ACTION_IDS.note_create)}
                        on_request_create_folder={(folder_path: string) =>
                          void action_registry.execute(
                            ACTION_IDS.folder_request_create,
                            folder_path,
                          )}
                        on_toggle_star={toggle_star_for_selection}
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
                </Sidebar.Content>

                <Sidebar.Rail />
              </Sidebar.Root>
            </Resizable.Pane>
            <Resizable.Handle withHandle />
          {/if}
          <Resizable.Pane order={2}>
            <Sidebar.Inset class="flex h-full min-h-0 flex-col">
              <Resizable.PaneGroup direction="vertical" class="flex-1 min-h-0">
                <Resizable.Pane
                  defaultSize={terminal_open ? 70 : 100}
                  minSize={20}
                  order={1}
                >
                  <div class="flex h-full min-h-0 min-w-0 flex-col">
                    <TabBar />
                    <div class="flex min-h-0 flex-1 flex-col">
                      <FindInFileBar
                        open={stores.ui.find_in_file.open}
                        query={stores.ui.find_in_file.query}
                        matches={stores.search.in_file_matches}
                        selected_match_index={stores.ui.find_in_file
                          .selected_match_index}
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
                                ACTION_IDS.split_view_set_active_pane,
                                "primary",
                              );
                            }
                          }}
                        >
                          <NoteEditor />
                        </div>
                        {#if split_view_active}
                          <div class="SplitViewContainer__handle"></div>
                          <div class="SplitViewContainer__secondary">
                            <SplitNoteEditor />
                          </div>
                        {/if}
                        <SplitDropZone />
                      </div>
                    </div>
                  </div>
                </Resizable.Pane>
                {#if terminal_open}
                  <Resizable.Handle withHandle />
                  <Resizable.Pane
                    defaultSize={30}
                    minSize={10}
                    maxSize={80}
                    order={2}
                  >
                    <TerminalPanel />
                  </Resizable.Pane>
                {/if}
              </Resizable.PaneGroup>
            </Sidebar.Inset>
          </Resizable.Pane>
          {#if stores.ui.context_rail_open}
            <Resizable.Handle withHandle />
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
      is_repairing_links={is_vault_mode && stores.op.is_pending("links.repair")}
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
      on_git_add_remote={() =>
        void action_registry.execute(ACTION_IDS.git_add_remote)}
      on_sync_click={() =>
        void action_registry.execute(ACTION_IDS.vault_sync_index)}
      editor_mode={stores.editor.editor_mode}
      status_bar_items={stores.plugin.status_bar_items}
      on_mode_toggle={() =>
        void action_registry.execute(ACTION_IDS.editor_toggle_mode)}
    />

    {#each stores.plugin.active_plugin_ids as id (id)}
      <PluginIframeHost
        plugin_id={id}
        vault_path={stores.vault.vault?.path ?? ""}
        on_message={(msg) => services.plugin.handle_rpc(id, msg)}
      />
    {/each}
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
  .SplitViewContainer {
    display: flex;
    flex-direction: row;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  .SplitViewContainer__primary {
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
