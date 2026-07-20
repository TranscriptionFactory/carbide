<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import ActivityBar from "$lib/app/bootstrap/ui/activity_bar.svelte";
  import WorkspaceSidebar from "$lib/app/bootstrap/ui/workspace_sidebar.svelte";
  import { PathBreadcrumb } from "$lib/features/folder";
  import { NoteEditor, NoteDetailsDialog } from "$lib/features/note";
  import { SecondaryNoteEditor, SplitDropZone } from "$lib/features/tab";
  import BottomPanel from "$lib/app/bootstrap/ui/bottom_panel.svelte";
  import { TabBar } from "$lib/features/tab";
  import { FindInFileBar } from "$lib/features/search";
  import {
    EditorStatusBar,
    resolve_note_width_mode,
  } from "$lib/features/editor";
  import { ContextRail, ContextRailPanel } from "$lib/features/links";
  import { is_editable_target } from "$lib/shared/utils/editable_target";
  import { DockedOutline, FloatingOutline } from "$lib/features/outline";
  import { PluginRuntimeContainer } from "$lib/features/plugin";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import {
    ACTION_IDS,
    SIDEBAR_VIEWS,
    resolve_sidebar_views_config,
    sidebar_view_meta,
  } from "$lib/app";
  import type { SidebarViewMeta } from "$lib/app";

  const { stores, action_registry } = use_app_context();

  const split_view_active = $derived(stores.tab.is_split);
  const bottom_panel_open = $derived(stores.ui.bottom_panel_open);
  const is_vault_mode = $derived(stores.vault.is_vault_mode);

  const zen_mode = $derived(stores.ui.zen_mode);
  const outline_docked = $derived(
    stores.ui.editor_settings.outline_mode === "docked" &&
      stores.ui.outline_docked_open &&
      stores.outline.headings.length > 0 &&
      !stores.ui.zen_mode,
  );

  const word_count = $derived(stores.editor.cursor?.total_words ?? 0);
  const note_width_mode = $derived(
    resolve_note_width_mode(
      stores.editor.open_note,
      stores.editor.width_mode_overrides,
      stores.ui.editor_settings.editor_width_mode,
    ),
  );
  const line_count = $derived(stores.editor.cursor?.total_lines ?? 0);

  const html_trust_level = $derived.by(() => {
    const tab = stores.tab.active_tab;
    if (!tab || tab.kind !== "document" || tab.file_type !== "html")
      return null;
    return stores.document.get_trust_level(tab.file_path);
  });

  function open_trust_panel(): void {
    stores.ui.bottom_panel_tab = "trust";
    stores.ui.bottom_panel_open = true;
  }

  let details_dialog_open = $state(false);

  const dynamic_sidebar_views = $derived(stores.plugin.sidebar_views);

  const configured_views = $derived(
    resolve_sidebar_views_config(
      stores.ui.editor_settings.sidebar_views_config,
      dynamic_sidebar_views,
    )
      .filter((entry) => entry.visible)
      .map((entry) => sidebar_view_meta(entry.id, dynamic_sidebar_views))
      .filter((meta): meta is SidebarViewMeta => meta !== undefined)
      .filter((meta) => !meta.vault_only || is_vault_mode),
  );

  $effect(() => {
    const active = stores.ui.sidebar_view;
    if (configured_views.some((view) => view.id === active)) return;
    const fallback = configured_views[0]?.id ?? SIDEBAR_VIEWS.explorer;
    void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, fallback);
  });

  function toggle_sidebar_view(view: string) {
    if (view === SIDEBAR_VIEWS.daily_notes) {
      if (stores.ui.sidebar_open && stores.ui.sidebar_view === view) {
        void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
        return;
      }
      void action_registry.execute(ACTION_IDS.daily_notes_open_today);
      return;
    }
    if (stores.ui.sidebar_open && stores.ui.sidebar_view === view) {
      void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
      return;
    }
    void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, view);
  }
</script>

{#if stores.vault.vault}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="WorkspaceLayout flex h-screen flex-col"
    class:WorkspaceLayout--zen={zen_mode}
    data-sidebar-open={stores.ui.sidebar_open}
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
      } else if (is_editable_target(target)) {
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
          {configured_views}
          on_open_view={toggle_sidebar_view}
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
              defaultSize={stores.ui.sidebar_pane_size}
              minSize={15}
              maxSize={40}
              order={1}
              onResize={(size) => (stores.ui.sidebar_pane_size = size)}
            >
              <WorkspaceSidebar />
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
                    {#if !zen_mode && stores.editor.open_note}
                      <PathBreadcrumb
                        note_path={stores.editor.open_note.meta.path}
                        note_title={stores.editor.open_note.meta.title}
                        vault_name={stores.vault.vault?.name ?? null}
                        on_select_folder={(folder_path) =>
                          void action_registry.execute(
                            ACTION_IDS.filetree_reveal_folder,
                            folder_path,
                          )}
                        on_reveal_note={(note_path) =>
                          void action_registry.execute(
                            ACTION_IDS.filetree_reveal_note,
                            note_path,
                          )}
                      />
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
                        case_sensitive={stores.ui.find_in_file.case_sensitive}
                        whole_word={stores.ui.find_in_file.whole_word}
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
                        on_toggle_case={() =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_toggle_case,
                          )}
                        on_toggle_whole_word={() =>
                          void action_registry.execute(
                            ACTION_IDS.find_in_file_toggle_whole_word,
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
                      <Resizable.PaneGroup
                        direction={stores.tab.split_direction}
                        class="relative min-h-0 min-w-0 flex-1"
                      >
                        <Resizable.Pane minSize={20} order={1}>
                          <!-- svelte-ignore a11y_click_events_have_key_events -->
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <div
                            class="EditorPane"
                            class:EditorPane--focused={split_view_active &&
                              stores.tab.active_pane === "primary"}
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
                        </Resizable.Pane>
                        {#if split_view_active}
                          <Resizable.Handle />
                          <Resizable.Pane
                            defaultSize={50}
                            minSize={20}
                            order={2}
                          >
                            <div
                              class="EditorPane"
                              class:EditorPane--focused={stores.tab
                                .active_pane === "secondary"}
                            >
                              <SecondaryNoteEditor />
                            </div>
                          </Resizable.Pane>
                        {/if}
                        <SplitDropZone />
                      </Resizable.PaneGroup>
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
          {#if outline_docked}
            <Resizable.Handle data-outline-handle="" />
            <Resizable.Pane
              defaultSize={stores.ui.outline_pane_size}
              minSize={10}
              maxSize={40}
              order={3}
              onResize={(size) => (stores.ui.outline_pane_size = size)}
            >
              <DockedOutline />
            </Resizable.Pane>
          {/if}
          {#if !zen_mode && stores.ui.context_rail_open}
            <Resizable.Handle />
            <Resizable.Pane
              defaultSize={stores.ui.context_rail_pane_size}
              minSize={12}
              maxSize={40}
              order={4}
              onResize={(size) => (stores.ui.context_rail_pane_size = size)}
            >
              <ContextRailPanel />
            </Resizable.Pane>
          {/if}
          {#if !zen_mode}
            <div class="WorkspaceLayout__context-rail">
              <ContextRail />
            </div>
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
        is_reindex_pending={is_vault_mode &&
          stores.op.is_pending("vault.reindex")}
        embedding_progress={is_vault_mode
          ? stores.search.embedding_progress
          : { status: "idle", embedded: 0, total: 0, error: null }}
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
        editor_mode={stores.editor.editor_mode}
        split_view={stores.editor.split_view}
        on_split_toggle={() =>
          void action_registry.execute(ACTION_IDS.editor_toggle_split_view)}
        width_mode={note_width_mode}
        on_width_toggle={() =>
          void action_registry.execute(
            note_width_mode === "wide"
              ? ACTION_IDS.editor_set_width_normal
              : ACTION_IDS.editor_set_width_wide,
          )}
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
        {html_trust_level}
        on_html_trust_click={open_trust_panel}
        bottom_panel_open={stores.ui.bottom_panel_open}
        bottom_panel_tab={stores.ui.bottom_panel_tab}
        on_panel_tab_click={(tab) =>
          void action_registry.execute(
            ACTION_IDS.ui_toggle_bottom_panel_tab,
            tab,
          )}
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
  /* Snapshot the pre-wide-override width at the zen root so the
     [data-width-mode="wide"] --editor-max-width override on descendant
     editors cannot widen zen mode */
  .WorkspaceLayout--zen {
    --zen-editor-max-width: var(--editor-max-width, 72ch);
  }

  .WorkspaceLayout--zen :global(.cm-editor) {
    max-width: var(--zen-editor-max-width);
    margin-inline: auto;
  }

  .EditorPane {
    position: relative;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .EditorPane--focused {
    box-shadow: inset 0 0 0 1px var(--focus-ring);
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

  .WorkspaceLayout__context-rail {
    position: relative;
    width: 36px;
    flex-shrink: 0;
    overflow: visible;
  }
</style>
