<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Button } from "$lib/components/ui/button";
  import { VaultSwitcherDropdown } from "$lib/features/vault";
  import SidebarExplorerView from "$lib/app/bootstrap/ui/sidebar_explorer_view.svelte";
  import {
    SIDEBAR_PANEL_COMPONENTS,
    TITLED_VIEWS,
  } from "$lib/app/bootstrap/ui/workspace_sidebar_views";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS, SIDEBAR_VIEWS, sidebar_view_meta } from "$lib/app";
  import {
    FilePlus,
    FolderPlus,
    RefreshCw,
    FoldVertical,
    AppWindow,
  } from "@lucide/svelte";

  const { stores, action_registry } = use_app_context();

  const is_vault_mode = $derived(stores.vault.is_vault_mode);

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
    if (is_vault_mode && view === SIDEBAR_VIEWS.starred)
      return starred_header_actions;
    if (is_vault_mode && view === SIDEBAR_VIEWS.dashboard)
      return dashboard_header_actions;
    return explorer_header_actions;
  });

  const header_title = $derived.by(() => {
    const view = stores.ui.sidebar_view;
    if (TITLED_VIEWS.has(view)) {
      return sidebar_view_meta(view, stores.plugin.sidebar_views)?.label ?? "";
    }
    const plugin_view = stores.plugin.sidebar_views.find((v) => v.id === view);
    return plugin_view ? plugin_view.label : null;
  });
</script>

<Sidebar.Root collapsible="none" class="w-full">
  <Sidebar.Header class="p-0">
    <div class="SidebarHeader">
      <div class="SidebarHeader__top">
        {#if header_title !== null}
          <span class="SidebarHeader__title">{header_title}</span>
        {:else}
          <VaultSwitcherDropdown
            recent_vaults={stores.vault.recent_vaults}
            pinned_vault_ids={stores.vault.pinned_vault_ids}
            current_vault_id={stores.vault.vault?.id ?? null}
            current_vault_name={stores.vault.vault?.name ?? ""}
            bind:open={stores.ui.vault_switcher_open}
            git_cache={stores.vault.vault_git_cache}
            on_select_vault={(id) => {
              void action_registry.execute(ACTION_IDS.vault_select, id);
            }}
            on_choose_vault={() => {
              void action_registry.execute(ACTION_IDS.vault_choose);
            }}
            on_manage_vaults={() => {
              void action_registry.execute(ACTION_IDS.vault_request_change);
            }}
            on_toggle_pin={(id) => {
              void action_registry.execute(ACTION_IDS.vault_toggle_pin, id);
            }}
            on_remove_vault={(id) => {
              void action_registry.execute(
                ACTION_IDS.vault_remove_from_registry,
                id,
              );
            }}
            on_reveal_vault={(path) => {
              void action_registry.execute(ACTION_IDS.shell_open_url, path);
            }}
            on_dropdown_opened={() => {
              void action_registry.execute(
                ACTION_IDS.vault_fetch_git_info_for_list,
              );
            }}
            on_select_folder={() => {
              void action_registry.execute(ACTION_IDS.ui_select_folder, "");
            }}
            on_promote_to_vault={!is_vault_mode
              ? () => {
                  void action_registry.execute(ACTION_IDS.vault_promote);
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
    {#if is_vault_mode && SIDEBAR_PANEL_COMPONENTS[stores.ui.sidebar_view]}
      {@const Panel = SIDEBAR_PANEL_COMPONENTS[stores.ui.sidebar_view]}
      <Sidebar.Group class="h-full">
        <Sidebar.GroupContent class="h-full">
          <Panel />
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

    <!-- The explorer group is hidden, never unmounted: tree scroll and
         expansion DOM state must survive view switches. -->
    <Sidebar.Group
      class="h-full"
      hidden={stores.ui.sidebar_view !== SIDEBAR_VIEWS.explorer}
    >
      <Sidebar.GroupContent class="h-full flex flex-col min-h-0">
        <SidebarExplorerView />
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Rail />
</Sidebar.Root>

<style>
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
</style>
